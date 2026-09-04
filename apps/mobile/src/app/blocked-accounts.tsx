import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';
import { goBack } from '@/lib/navigation';
import { haptics } from '@/lib/haptics';
import { useSession } from '@/hooks/useSession';
import { LoadingState, EmptyState, ErrorState } from '@/components/states';
import { listBlockedUsers, unblockUser, type BlockedAccount } from '@/lib/services/blocking';

/**
 * Blocked accounts, and the only way to undo a block (TODO1.1 4.3).
 *
 * Blocking became consequential in 20260831040000: it now rejects direct
 * messages and hides the conversation and its history. Before that migration
 * the Block button was close to inert, so having no unblock anywhere cost
 * nothing. Now it would be a trap — people block in anger, in error and by
 * mis-tap, and a safety tool you cannot back out of is one people stop
 * trusting.
 *
 * Reached from Account Settings. There is deliberately no way to reach it from
 * a blocked person's profile: that surface is what the block exists to remove.
 */
export default function BlockedAccountsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();

  const [accounts, setAccounts] = useState<BlockedAccount[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setStatus('loading');
    try {
      setAccounts(await listBlockedUsers(user.id));
      setStatus('ready');
    } catch {
      // Never an empty state on failure. "You haven't blocked anyone" when the
      // read actually failed would tell someone their blocks were gone — see
      // the ScreenState header for why this project treats that as a rule.
      setStatus('error');
    }
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  async function handleUnblock(account: BlockedAccount) {
    if (!user?.id) return;
    const name = account.fullName ?? 'this account';

    Alert.alert(
      'Unblock?',
      `${name} will be able to message you again. Your earlier conversation will reappear.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          style: 'destructive',
          onPress: async () => {
            setWorking(account.id);
            try {
              await unblockUser(user.id, account.id);
              haptics.success();
              // Refetch rather than splice: the list is small, and trusting a
              // local edit to match the server is how a UI ends up showing an
              // unblock that did not happen.
              await load();
            } catch {
              Alert.alert('Could not unblock', 'Check your connection and try again.');
            } finally {
              setWorking(null);
            }
          },
        },
      ],
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar style="dark" />

      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => goBack()} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.navy} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Blocked Accounts</Text>
        <View style={s.back} />
      </View>

      <ScrollView contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 32 }]}>
        {status === 'loading' ? (
          <LoadingState label="Loading blocked accounts..." />
        ) : status === 'error' ? (
          <ErrorState
            title="Couldn't load blocked accounts"
            message="Check your connection and try again."
            onRetry={() => { void load(); }}
          />
        ) : accounts.length === 0 ? (
          <EmptyState
            icon="shield-checkmark-outline"
            title="You haven't blocked anyone"
            message="Blocked accounts can't message you, and their conversations are hidden."
          />
        ) : (
          accounts.map((account) => (
            <View key={account.id} style={s.row}>
              {account.avatarUrl ? (
                <Image source={{ uri: account.avatarUrl }} style={s.avatar} />
              ) : (
                <View style={[s.avatar, s.avatarFallback]}>
                  <Ionicons name="person" size={18} color={colors.textMuted} />
                </View>
              )}
              <View style={s.rowText}>
                {/* An account deleted since the block has no profile row to
                    name. Still listed — a block you cannot name is still one
                    you may want to lift. */}
                <Text style={s.name}>{account.fullName ?? 'Account no longer available'}</Text>
                <Text style={s.sub}>Blocked {new Date(account.blockedAt).toLocaleDateString()}</Text>
              </View>
              <TouchableOpacity
                style={s.unblock}
                onPress={() => { void handleUnblock(account); }}
                disabled={working === account.id}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`Unblock ${account.fullName ?? 'this account'}`}
              >
                <Text style={s.unblockText}>{working === account.id ? '...' : 'Unblock'}</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.page },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: text.titleSm.size, fontWeight: '800', color: colors.navy },
  body: { padding: 16, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: shape.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 12,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  name: { fontSize: text.body.size, fontWeight: '500', color: colors.navy },
  sub: { fontSize: text.caption.size, fontWeight: '500', color: colors.textMuted, marginTop: 2 },
  unblock: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: shape.cta, backgroundColor: colors.page },
  unblockText: { fontSize: text.link.size, fontWeight: '700', color: colors.navy },
});
