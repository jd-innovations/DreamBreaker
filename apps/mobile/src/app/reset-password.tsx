import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { completePasswordRecovery, updatePassword } from '@/lib/auth';
import { isPasswordLongEnough, PASSWORD_PLACEHOLDER, PASSWORD_TOO_SHORT_MESSAGE } from '@/lib/authPolicy';
import { colors } from '@/theme';
// Design standard, from the shared token source. See DESIGN_STANDARD.md.
import { radius as shape, text } from '@shared/tokens';

type Status = 'verifying' | 'ready' | 'invalid';

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const url = Linking.useLinkingURL();
  const [status, setStatus] = useState<Status>('verifying');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    if (!url || attempted.current) return;
    attempted.current = true;
    (async () => {
      try {
        const session = await completePasswordRecovery(url);
        setStatus(session ? 'ready' : 'invalid');
      } catch {
        setStatus('invalid');
      }
    })();
  }, [url]);

  async function handleSave() {
    if (!isPasswordLongEnough(password)) {
      Alert.alert('Weak password', PASSWORD_TOO_SHORT_MESSAGE);
      return;
    }
    setSaving(true);
    try {
      await updatePassword(password);
      Alert.alert('Password updated', 'Your password has been reset.', [
        { text: 'Continue', onPress: () => router.replace('/(tabs)/profile') },
      ]);
    } catch (e: any) {
      Alert.alert('Could not update password', e.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[s.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {status === 'verifying' && (
          <View style={s.centerBlock}>
            <ActivityIndicator color={colors.gold} size="large" />
            <Text style={[s.sub, { marginTop: 16 }]}>Verifying your reset link…</Text>
          </View>
        )}

        {status === 'invalid' && (
          <View style={s.centerBlock}>
            <View style={s.iconWrap}>
              <Ionicons name="alert-circle-outline" size={32} color={colors.danger} />
            </View>
            <Text style={s.heading}>Link expired or invalid</Text>
            <Text style={s.sub}>This password reset link is no longer valid. Request a new one to continue.</Text>
            <TouchableOpacity style={s.btn} onPress={() => router.replace('/forgot-password')} activeOpacity={0.85}>
              <Text style={s.btnText}>Request New Link</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === 'ready' && (
          <>
            <Text style={s.heading}>Set a new password</Text>
            <Text style={s.sub}>Choose a new password for your account.</Text>

            <View style={s.field}>
              <Text style={s.label}>New password</Text>
              <View style={s.inputRow}>
                <TextInput
                  style={[s.input, s.inputFlex]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder={PASSWORD_PLACEHOLDER}
                  placeholderTextColor={colors.textSub}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                />
                <TouchableOpacity
                  style={s.eyeBtn}
                  onPress={() => setShowPassword(v => !v)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSub} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={s.btn} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
              {saving
                ? <ActivityIndicator color={colors.navy} />
                : <Text style={s.btnText}>Save New Password</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.page },
  container: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center' },

  heading: { color: colors.navy, fontSize: text.pageTitle.size, fontWeight: '900', marginBottom: 8, textAlign: 'center' },
  sub: { fontSize: text.body.size, fontWeight: '500', color: colors.textSub, marginBottom: 32, lineHeight: 21, textAlign: 'center' },

  field: { marginBottom: 20 },
  label: { color: colors.text, fontSize: text.fieldLabel.size, fontWeight: '800', marginBottom: 6 },
  input: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: shape.panel, paddingHorizontal: 14, paddingVertical: 13,
    color: colors.text, fontSize: text.body.size, fontWeight: '500',
  },
  inputRow: { position: 'relative', flexDirection: 'row', alignItems: 'center' },
  inputFlex: { flex: 1, paddingRight: 44 },
  eyeBtn: { position: 'absolute', right: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

  btn: {
    backgroundColor: colors.gold, borderRadius: shape.cta,
    paddingVertical: 15, alignItems: 'center', marginTop: 4,
  },
  btnText: { color: colors.navy, fontSize: text.actionLarge.size, fontWeight: '800' },

  centerBlock: { alignItems: 'center', paddingTop: 40 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: colors.danger,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
});
