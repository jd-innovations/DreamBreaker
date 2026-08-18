import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Alert, Animated, Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { signIn, signInWithGoogle, signInWithApple } from '@/lib/auth';
import { colors, gradients, radius } from '@/theme';
import { haptics } from '@/lib/haptics';

const INPUT_BG = '#EAF1FF';
const MUTED_BLUE = '#8297C3';

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = typeof params.returnTo === 'string' ? params.returnTo : null;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const ctaScale = useRef(new Animated.Value(1)).current;
  const ctaGlow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ctaGlow, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(ctaGlow, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [ctaGlow, loading]);

  async function handleSignIn() {
    if (!email.trim() || !password) {
      haptics.error();
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    haptics.medium();
    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      haptics.success();
      // No returnTo -> hand off to the root gate (item 1.1) rather than picking
      // a destination here, so a signed-in user with an incomplete profile is
      // routed to onboarding immediately instead of on their next cold start.
      // An explicit returnTo means the user was mid-way through a protected
      // action, so it still wins.
      router.replace((returnTo ?? '/') as never);
    } catch (e: any) {
      haptics.error();
      Alert.alert('Sign in failed', e.message ?? 'Please check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    haptics.medium();
    setGoogleLoading(true);
    try {
      const session = await signInWithGoogle();
      if (session) {
        haptics.success();
        // Same reasoning as the email path above — let the root gate decide.
        router.replace((returnTo ?? '/') as never);
      }
    } catch (e: any) {
      haptics.error();
      Alert.alert('Sign in failed', e.message ?? 'Something went wrong. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleAppleSignIn() {
    haptics.medium();
    setAppleLoading(true);
    try {
      const session = await signInWithApple();
      if (session) {
        haptics.success();
        // Same reasoning as the email path above — let the root gate decide.
        router.replace((returnTo ?? '/') as never);
      }
      // session === null means the user cancelled -- no haptic, no alert,
      // stay on this screen (Phase 7 Step 15).
    } catch (e: any) {
      haptics.error();
      Alert.alert('Sign in failed', e.message ?? 'Something went wrong. Please try again.');
    } finally {
      setAppleLoading(false);
    }
  }

  function pressIn() {
    if (loading) return;
    Animated.spring(ctaScale, { toValue: 0.975, friction: 7, tension: 180, useNativeDriver: true }).start();
  }

  function pressOut() {
    Animated.spring(ctaScale, { toValue: 1, friction: 6, tension: 160, useNativeDriver: true }).start();
  }

  const glowOpacity = ctaGlow.interpolate({ inputRange: [0, 1], outputRange: [0.14, 0.36] });
  const glowScale = ctaGlow.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1.035] });

  return (
    <LinearGradient colors={gradients.appLight} style={s.gradientRoot}>
      <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[s.container, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.content}>
          <View style={s.heroBlock}>
            <Text style={s.heading}>Welcome back</Text>
            <Text style={s.sub}>Sign in to your account</Text>
          </View>

          <View style={s.form}>
            <View style={s.field}>
              <Text style={s.label}>Email</Text>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@email.com"
                placeholderTextColor={MUTED_BLUE}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                returnKeyType="next"
              />
            </View>

            <View style={s.field}>
              <Text style={s.label}>Password</Text>
              <View style={s.inputRow}>
                <TextInput
                  style={[s.input, s.inputFlex]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor={MUTED_BLUE}
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                  returnKeyType="done"
                  onSubmitEditing={handleSignIn}
                />
                <TouchableOpacity
                  style={s.eyeBtn}
                  onPress={() => setShowPassword(v => !v)}
                  activeOpacity={0.7}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={21} color={MUTED_BLUE} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={s.forgotBtn} onPress={() => router.push('/forgot-password')} activeOpacity={0.7}>
              <Text style={s.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          </View>

          <Animated.View style={[s.ctaWrap, { transform: [{ scale: ctaScale }] }]}> 
            {!loading && <Animated.View pointerEvents="none" style={[s.ctaGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />}
            <TouchableOpacity
              style={[s.btn, loading && s.btnLoading]}
              onPress={handleSignIn}
              onPressIn={pressIn}
              onPressOut={pressOut}
              disabled={loading}
              activeOpacity={0.92}
            >
              {loading
                ? <ActivityIndicator color={colors.navy} />
                : <Text style={s.btnText}>Sign In</Text>}
            </TouchableOpacity>
          </Animated.View>

          <View style={s.divider}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>or</Text>
            <View style={s.dividerLine} />
          </View>

          {appleAvailable && (
            appleLoading ? (
              <View style={[s.googleBtn, s.btnLoading]}>
                <ActivityIndicator color={colors.navy} />
              </View>
            ) : (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={radius.card}
                style={s.appleBtn}
                onPress={handleAppleSignIn}
              />
            )
          )}

          <TouchableOpacity
            style={[s.googleBtn, googleLoading && s.btnLoading]}
            onPress={handleGoogleSignIn}
            disabled={loading || googleLoading}
            activeOpacity={0.85}
          >
            {googleLoading ? (
              <ActivityIndicator color={colors.navy} />
            ) : (
              <View style={s.googleBtnContent}>
                <Ionicons name="logo-google" size={20} color="#4285F4" />
                <Text style={s.googleBtnText}>Continue with Google</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={s.linkBtn} onPress={() => router.push({ pathname: '/sign-up', params: returnTo ? { returnTo } : {} })} activeOpacity={0.7}>
            <Text style={s.linkText}>{"Don't have an account?"} <Text style={s.linkAccent}>Create one</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  gradientRoot: { flex: 1 },
  flex: { flex: 1, backgroundColor: 'transparent' },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  content: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },

  heroBlock: {
    alignItems: 'center',
    marginBottom: 30,
  },
  heading: {
    color: colors.navy,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    textAlign: 'center',
  },
  sub: {
    color: MUTED_BLUE,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 5,
    textAlign: 'center',
  },

  form: { gap: 18 },
  field: { gap: 8 },
  forgotBtn: { alignSelf: 'flex-end', marginTop: -6 },
  forgotText: { color: colors.gold, fontSize: 13, fontWeight: '700' },
  label: {
    color: colors.navy,
    fontSize: 13,
    fontWeight: '800',
  },
  input: {
    minHeight: 48,
    backgroundColor: INPUT_BG,
    borderWidth: 1,
    borderColor: 'rgba(130,151,195,0.08)',
    borderRadius: 12,
    paddingHorizontal: 15,
    color: colors.navy,
    fontSize: 15,
    fontWeight: '500',
  },
  inputRow: { position: 'relative', flexDirection: 'row', alignItems: 'center' },
  inputFlex: { flex: 1, paddingRight: 48 },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  ctaWrap: {
    position: 'relative',
    marginTop: 30,
  },
  ctaGlow: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 5,
    bottom: -7,
    borderRadius: radius.button,
    backgroundColor: colors.gold,
    shadowColor: colors.gold,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 7,
  },
  btn: {
    minHeight: 54,
    backgroundColor: colors.gold,
    borderRadius: radius.button,
    borderWidth: 2,
    borderColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.navy,
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  btnLoading: { opacity: 0.78 },
  btnText: {
    color: colors.navy,
    fontSize: 16,
    fontWeight: '900',
  },

  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 30,
    marginBottom: 26,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E4E9F4' },
  dividerText: { color: MUTED_BLUE, fontSize: 13, fontWeight: '700' },

  appleBtn: {
    height: 54,
    width: '100%',
    marginBottom: 14,
  },
  googleBtn: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E7DED0',
    borderRadius: radius.card,
    backgroundColor: 'rgba(255,255,255,0.86)',
    marginBottom: 20,
  },
  googleBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleBtnText: { color: colors.navy, fontSize: 15, fontWeight: '800' },

  linkBtn: { alignItems: 'center' },
  linkText: { color: MUTED_BLUE, fontSize: 14, fontWeight: '600' },
  linkAccent: { color: colors.gold, fontWeight: '900' },
});
