import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { requestPasswordReset } from '@/lib/auth';
import { colors, typography, radius } from '@/theme';

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    if (!email.trim()) {
      Alert.alert('Missing email', 'Please enter your email address.');
      return;
    }
    setLoading(true);
    try {
      await requestPasswordReset(email.trim().toLowerCase());
      setSent(true);
    } catch (e: any) {
      Alert.alert('Could not send reset email', e.message ?? 'Please try again.');
    } finally {
      setLoading(false);
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
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={26} color={colors.navy} />
        </TouchableOpacity>

        {sent ? (
          <View style={s.sentBlock}>
            <View style={s.sentIconWrap}>
              <Ionicons name="mail-outline" size={32} color={colors.gold} />
            </View>
            <Text style={s.heading}>Check your email</Text>
            <Text style={s.sub}>
              If an account exists for {email.trim()}, we sent a link to reset your password.
            </Text>
            <TouchableOpacity style={s.linkBtn} onPress={() => router.replace('/sign-in')} activeOpacity={0.7}>
              <Text style={s.linkText}>Back to <Text style={s.linkAccent}>Sign In</Text></Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={s.heading}>Reset your password</Text>
            <Text style={s.sub}>{"Enter your email and we'll send you a link to reset your password."}</Text>

            <View style={s.field}>
              <Text style={s.label}>Email</Text>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@email.com"
                placeholderTextColor={colors.textSub}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                returnKeyType="send"
                onSubmitEditing={handleSend}
              />
            </View>

            <TouchableOpacity style={s.btn} onPress={handleSend} disabled={loading} activeOpacity={0.85}>
              {loading
                ? <ActivityIndicator color={colors.navy} />
                : <Text style={s.btnText}>Send Reset Link</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={s.linkBtn} onPress={() => router.replace('/sign-in')} activeOpacity={0.7}>
              <Text style={s.linkText}>Back to <Text style={s.linkAccent}>Sign In</Text></Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.page },
  container: { flexGrow: 1, paddingHorizontal: 24 },

  backBtn: { width: 36, height: 36, justifyContent: 'center', marginBottom: 12 },

  heading: { ...typography.pageTitle, color: colors.navy, fontSize: 28, marginBottom: 8 },
  sub: { ...typography.body, color: colors.textSub, marginBottom: 32, lineHeight: 21 },

  field: { marginBottom: 20 },
  label: { color: colors.text, fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13,
    color: colors.text, fontSize: 15,
  },

  btn: {
    backgroundColor: colors.gold, borderRadius: radius.button,
    paddingVertical: 15, alignItems: 'center', marginTop: 4,
  },
  btnText: { color: colors.navy, fontSize: 16, fontWeight: '800' },

  linkBtn: { alignItems: 'center', marginTop: 24 },
  linkText: { color: colors.textSub, fontSize: 14 },
  linkAccent: { color: colors.gold, fontWeight: '700' },

  sentBlock: { alignItems: 'center', paddingTop: 40 },
  sentIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.goldBg, borderWidth: 1, borderColor: colors.goldBorder,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
});
