import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

// No-op on native; required once for the OAuth browser session to resolve on web.
WebBrowser.maybeCompleteAuthSession();

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// extraMetadata rides into auth.users.raw_user_meta_data alongside full_name,
// where fn_handle_new_user() reads it to populate profiles at insert time.
// Needed because email/password signups don't get a live session until the
// user confirms their email (see supabase/config.toml's enable_confirmations),
// so there's no authenticated moment to run a separate profiles UPDATE.
export async function signUp(
  email: string,
  password: string,
  fullName: string,
  extraMetadata?: Record<string, unknown>,
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, ...extraMetadata } },
  });
  if (error) throw error;
  return data;
}

// Browser-redirect Google OAuth (Supabase's documented native-mobile-deep-linking
// pattern). Returns null if the user cancels/dismisses the browser sheet rather
// than throwing — callers should treat null as "stay on the current screen."
export async function signInWithGoogle() {
  const redirectTo = makeRedirectUri();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return null;

  const { params, errorCode } = QueryParams.getQueryParams(res.url);
  if (errorCode) throw new Error(errorCode);

  const { access_token, refresh_token } = params;
  if (!access_token || !refresh_token) return null;

  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });
  if (sessionError) throw sessionError;
  return sessionData.session;
}

// Sends a password-reset email. redirectTo points at the reset-password screen,
// which expo-router opens automatically via the app's custom scheme when the
// user taps the emailed link (path matching works regardless of whatever
// query/fragment params GoTrue appends).
export async function requestPasswordReset(email: string) {
  const redirectTo = makeRedirectUri({ path: 'reset-password' });
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

// Completes a password-recovery deep link. Supabase's recovery email can land
// in one of two shapes depending on project auth settings — handle both rather
// than assume:
//   1. access_token/refresh_token already issued (GoTrue completed the
//      exchange server-side before redirecting) -> setSession directly.
//   2. token_hash + type=recovery (app must complete the exchange) -> verifyOtp.
// Returns null if the URL has neither shape (invalid/expired/foreign link).
export async function completePasswordRecovery(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(errorCode);

  if (params.access_token && params.refresh_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) throw error;
    return data.session;
  }

  if (params.token_hash && params.type === 'recovery') {
    const { data, error } = await supabase.auth.verifyOtp({
      type: 'recovery',
      token_hash: params.token_hash,
    });
    if (error) throw error;
    return data.session;
  }

  return null;
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
