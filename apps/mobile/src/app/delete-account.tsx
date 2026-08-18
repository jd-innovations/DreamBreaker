import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { goBack } from '@/lib/navigation';
import { colors } from '@/theme';
import { supabase } from '@/lib/supabase';
import { deleteAccount, AccountDeletionError, DELETE_ACCOUNT_MESSAGES } from '@/lib/accountDeletion';

// Account deletion confirmation (TODO1.1_EXECUTION_PLAN.md item 1.3).
//
// This screen's job is to make the consequences unmissable and the action hard
// to take by accident. It never deletes anything itself and never signs the user
// out unless the backend confirms the account is actually gone.

const L = {
  bg: colors.bg,
  navy: colors.navy,
  text: colors.text,
  textSub: colors.textSub,
  border: colors.border,
  danger: colors.danger,
  dangerBg: colors.dangerBg,
  white: colors.white,
};

const CONFIRM_WORD = 'DELETE';

const WILL_BE_DELETED = [
  'Your name, email, photo, bio, and date of birth',
  'Your location, home court, and search settings',
  'Your rating, play style, and partner preferences',
  'Push notifications to every device you signed in on',
];

const WILL_BE_KEPT = [
  'Tournament registrations and results, so brackets and other players’ match history stay correct',
  'Payment and refund records, which we are required to keep for financial reporting',
  'Messages you sent, which remain visible to the people you sent them to',
  'Support tickets and any safety reports involving your account',
];

export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText.trim().toUpperCase() === CONFIRM_WORD && !busy;

  async function handleDelete() {
    if (!canDelete) return;
    setBusy(true);
    setError(null);

    try {
      await deleteAccount();
    } catch (e) {
      // The account is intact and the session is still valid. Stay put, stay
      // signed in, and show why — signing out here would strand the user with a
      // live account they can no longer see.
      setError(
        e instanceof AccountDeletionError ? e.message : DELETE_ACCOUNT_MESSAGES.internal_error,
      );
      setBusy(false);
      return;
    }

    // Deletion is confirmed. Clear the local session only: the auth user no
    // longer exists, so a server-side sign-out has nothing to revoke and would
    // just fail, leaving stale credentials on the device.
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      if (__DEV__) console.warn('[account] local sign-out after deletion failed', e);
    }

    // Root gate decides where a signed-out user belongs.
    router.replace('/');
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => goBack()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={20} color={busy ? L.textSub : L.navy} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>DELETE ACCOUNT</Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        >
          <View style={styles.warningCard}>
            <Ionicons name="warning-outline" size={24} color={L.danger} />
            <Text style={styles.warningTitle}>This cannot be undone</Text>
            <Text style={styles.warningBody}>
              Deleting your account is permanent and takes effect immediately. There is no grace
              period and no way to recover it. If you sign up again later, you will start with a
              completely new, empty account.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What gets deleted</Text>
            {WILL_BE_DELETED.map((item) => (
              <View key={item} style={styles.bulletRow}>
                <Ionicons name="close-circle" size={16} color={L.danger} style={styles.bulletIcon} />
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What we keep, and why</Text>
            <Text style={styles.sectionIntro}>
              These records stay, but they are no longer linked to your name, email, or photo. They
              show only as &ldquo;Deleted User.&rdquo;
            </Text>
            {WILL_BE_KEPT.map((item) => (
              <View key={item} style={styles.bulletRow}>
                <Ionicons
                  name="archive-outline"
                  size={16}
                  color={L.textSub}
                  style={styles.bulletIcon}
                />
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Confirm</Text>
            <Text style={styles.sectionIntro}>
              Type <Text style={styles.confirmWord}>{CONFIRM_WORD}</Text> below to confirm.
            </Text>
            <TextInput
              style={styles.input}
              value={confirmText}
              onChangeText={(next) => {
                setConfirmText(next);
                if (error) setError(null);
              }}
              placeholder={CONFIRM_WORD}
              placeholderTextColor={L.textSub}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!busy}
              accessibilityLabel={`Type ${CONFIRM_WORD} to confirm account deletion`}
            />
          </View>

          {error ? (
            <View style={styles.errorCard}>
              <Ionicons name="alert-circle-outline" size={18} color={L.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.deleteBtn, !canDelete && styles.deleteBtnDisabled]}
            onPress={handleDelete}
            disabled={!canDelete}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Permanently delete my account"
          >
            {busy ? (
              <ActivityIndicator color={L.white} />
            ) : (
              <Text style={styles.deleteBtnText}>Permanently delete my account</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => goBack()}
            disabled={busy}
            activeOpacity={0.7}
          >
            <Text style={[styles.cancelText, busy && { color: L.textSub }]}>Keep my account</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: L.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: L.bg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: L.border,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: L.navy, fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },

  scrollContent: { padding: 16, gap: 18 },

  warningCard: {
    backgroundColor: L.dangerBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: L.danger,
    padding: 16,
    gap: 8,
  },
  warningTitle: { color: L.danger, fontSize: 17, fontWeight: '900' },
  warningBody: { color: L.text, fontSize: 13, fontWeight: '500', lineHeight: 19 },

  section: { gap: 8 },
  sectionTitle: { color: L.navy, fontSize: 15, fontWeight: '800' },
  sectionIntro: { color: L.textSub, fontSize: 13, fontWeight: '500', lineHeight: 19 },

  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bulletIcon: { marginTop: 2, flexShrink: 0 },
  bulletText: { flex: 1, color: L.text, fontSize: 13, fontWeight: '500', lineHeight: 19 },

  confirmWord: { color: L.danger, fontWeight: '900' },

  input: {
    borderWidth: 1,
    borderColor: L.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    color: L.text,
    backgroundColor: L.white,
  },

  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: L.dangerBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: L.danger,
    padding: 12,
  },
  errorText: { flex: 1, color: L.danger, fontSize: 13, fontWeight: '600', lineHeight: 19 },

  deleteBtn: {
    backgroundColor: L.danger,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  deleteBtnDisabled: { opacity: 0.4 },
  deleteBtnText: { color: L.white, fontSize: 15, fontWeight: '800' },

  cancelBtn: { paddingVertical: 12, alignItems: 'center' },
  cancelText: { color: L.navy, fontSize: 14, fontWeight: '700' },
});
