// Backend smoke test for the Groups feature — exercises the real Supabase
// calls groupService.ts makes, as two real authenticated users, to verify
// RLS and data flow end-to-end without needing the RN UI.
//
// Usage: node groups-smoke-test.js [--signup-only]

const { createClient } = require('@supabase/supabase-js');

const URL = 'https://fbzetvkbhneptvfruilw.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiemV0dmtiaG5lcHR2ZnJ1aWx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyOTU4MTIsImV4cCI6MjA5Njg3MTgxMn0.mk0KiENK6Qxp551-m7Mshb1ikN0Lr4y03SeZII5djpo';

const stamp = Date.now();
const USER_A = { email: `groups-test-a-${stamp}@dreambreaker.test`, password: 'TestPass123!', name: 'Groups Test A' };
const USER_B = { email: `groups-test-b-${stamp}@dreambreaker.test`, password: 'TestPass123!', name: 'Groups Test B' };

function log(label, ok, extra) {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${extra ? ' — ' + extra : ''}`);
  return ok;
}

async function signUp(user) {
  const client = createClient(URL, ANON_KEY);
  const { data, error } = await client.auth.signUp({
    email: user.email,
    password: user.password,
    options: { data: { full_name: user.name } },
  });
  if (error) throw new Error(`signUp(${user.email}): ${error.message}`);
  return { client, userId: data.user?.id };
}

async function signIn(user) {
  const client = createClient(URL, ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw new Error(`signIn(${user.email}): ${error.message}`);
  return { client, userId: data.user.id };
}

async function main() {
  let results = [];
  console.log('--- Sign up test accounts ---');
  const a0 = await signUp(USER_A);
  const b0 = await signUp(USER_B);
  console.log('user_a id:', a0.userId);
  console.log('user_b id:', b0.userId);
  console.log(JSON.stringify({ userAId: a0.userId, userBId: b0.userId, emailA: USER_A.email, emailB: USER_B.email }));

  if (process.argv.includes('--signup-only')) return;

  console.log('\n--- Sign in ---');
  const a = await signIn(USER_A);
  const b = await signIn(USER_B);
  results.push(log('sign in user_a', !!a.userId));
  results.push(log('sign in user_b', !!b.userId));

  const A = a.client, B = b.client, uidA = a.userId, uidB = b.userId;

  console.log('\n--- Create group as user_a ---');
  const { data: convo, error: convoErr } = await A
    .from('conversations')
    .insert({ conversation_type: 'group', title: 'Smoke Test Group', created_by: uidA })
    .select('id').single();
  results.push(log('create group conversation', !convoErr && !!convo, convoErr?.message));

  const { data: group, error: groupErr } = await A
    .from('groups')
    .insert({
      name: 'Smoke Test Group', description: 'Automated smoke test', skill: 'All Levels',
      privacy: 'public', allow_invites: true, allow_posts: true,
      organizer_id: uidA, conversation_id: convo?.id,
    })
    .select('*').single();
  results.push(log('create group row', !groupErr && !!group, groupErr?.message));
  if (!group) { console.log('Cannot continue without a group.'); return report(results); }

  await A.from('group_members').insert({ group_id: group.id, user_id: uidA, role: 'owner', status: 'active' });
  await A.from('conversation_participants').upsert({ conversation_id: convo.id, user_id: uidA, role: 'owner' });

  console.log('\n--- user_b discovers and joins the public group ---');
  const { data: discoverable, error: discoverErr } = await B
    .from('groups')
    .select('*')
    .eq('privacy', 'public')
    .eq('id', group.id);
  results.push(log('user_b can see public group (RLS select)', !discoverErr && discoverable?.length === 1, discoverErr?.message));

  const { error: joinErr } = await B
    .from('group_members')
    .upsert({ group_id: group.id, user_id: uidB, role: 'member', status: 'active' });
  results.push(log('user_b can self-join public group (RLS insert)', !joinErr, joinErr?.message));

  await B.from('conversation_participants').upsert({ conversation_id: convo.id, user_id: uidB, role: 'member' });

  const { data: memberRows, error: memberErr } = await A.from('group_members').select('user_id, role, status').eq('group_id', group.id);
  results.push(log('member count after join is 2', !memberErr && memberRows?.length === 2, memberErr?.message));

  console.log('\n--- Feed: post, poll, like, comment ---');
  const { data: post, error: postErr } = await A
    .from('group_posts')
    .insert({ group_id: group.id, author_id: uidA, kind: 'post', body: 'Hello group!' })
    .select('id').single();
  results.push(log('user_a creates a post', !postErr && !!post, postErr?.message));

  const { error: likeErr } = await B.from('group_post_likes').upsert({ post_id: post.id, user_id: uidB });
  results.push(log('user_b (a member) can like the post', !likeErr, likeErr?.message));

  const { error: commentErr } = await B.from('group_post_comments').insert({ post_id: post.id, author_id: uidB, body: 'Nice!' });
  results.push(log('user_b can comment on the post', !commentErr, commentErr?.message));

  const { data: pollPost, error: pollPostErr } = await A
    .from('group_posts')
    .insert({ group_id: group.id, author_id: uidA, kind: 'poll', body: 'Best night for open play?' })
    .select('id').single();
  const { data: opts, error: optsErr } = await A
    .from('group_poll_options')
    .insert([
      { post_id: pollPost.id, label: 'Monday', position: 0 },
      { post_id: pollPost.id, label: 'Wednesday', position: 1 },
    ])
    .select('id');
  results.push(log('create poll + options', !pollPostErr && !optsErr && opts?.length === 2, pollPostErr?.message || optsErr?.message));

  const { error: voteErr } = await B.from('group_poll_votes').insert({ option_id: opts[0].id, user_id: uidB });
  results.push(log('user_b votes on poll', !voteErr, voteErr?.message));

  console.log('\n--- Group chat message ---');
  const { data: msg, error: msgErr } = await B
    .from('messages')
    .insert({ conversation_id: convo.id, sender_id: uidB, body: 'Hey everyone!' })
    .select('id').single();
  results.push(log('user_b sends a group chat message', !msgErr && !!msg, msgErr?.message));

  const { data: seenMsgs, error: seenErr } = await A.from('messages').select('id').eq('conversation_id', convo.id);
  results.push(log('user_a can read the group chat message', !seenErr && seenMsgs?.length === 1, seenErr?.message));

  console.log('\n--- RLS negative test: outsider cannot see a private group ---');
  const { data: privateGroup } = await A
    .from('groups')
    .insert({
      name: 'Private Smoke Test', description: '', skill: 'All Levels',
      privacy: 'private', allow_invites: true, allow_posts: true, organizer_id: uidA,
    })
    .select('*').single();
  await A.from('group_members').insert({ group_id: privateGroup.id, user_id: uidA, role: 'owner', status: 'active' });

  const { data: outsiderView, error: outsiderErr } = await B
    .from('groups')
    .select('*')
    .eq('id', privateGroup.id);
  results.push(log('non-member cannot see private group (RLS)', !outsiderErr && outsiderView?.length === 0, outsiderErr ? outsiderErr.message : `got ${outsiderView?.length} rows, expected 0`));

  console.log('\n--- RLS negative test: non-admin cannot delete group ---');
  const { error: deleteAsMemberErr } = await B.from('groups').delete().eq('id', group.id);
  // RLS delete policy silently returns 0 rows affected rather than an error — verify row still exists.
  const { data: stillExists } = await A.from('groups').select('id').eq('id', group.id).maybeSingle();
  results.push(log('non-admin delete is blocked (group still exists)', !!stillExists));

  console.log('\n--- Cleanup ---');
  await A.from('groups').delete().eq('id', group.id);
  await A.from('groups').delete().eq('id', privateGroup.id);
  await A.from('conversations').delete().eq('id', convo.id);
  console.log('Cleaned up test groups + conversation.');

  report(results);
}

function report(results) {
  const passed = results.filter(Boolean).length;
  console.log(`\n=== ${passed}/${results.length} checks passed ===`);
  if (passed !== results.length) process.exitCode = 1;
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exitCode = 1;
});
