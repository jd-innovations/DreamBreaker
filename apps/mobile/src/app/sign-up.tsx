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
import { signInWithGoogle, signInWithApple, signUp } from '@/lib/auth';
import { colors, gradients, radius } from '@/theme';
import { isPasswordLongEnough, PASSWORD_PLACEHOLDER, PASSWORD_TOO_SHORT_MESSAGE } from '@/lib/authPolicy';
import { haptics } from '@/lib/haptics';
import { openPrivacy, openTerms } from '@/lib/legal';

const INPUT_BG = '#EAF1FF';
const MUTED_BLUE = '#8297C3';

export default function SignUpScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ returnTo?: string }>();
  const returnTo = typeof params.returnTo === 'string' ? params.returnTo : null;
  const [fullName, setFullName] = useState('');
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

  async function handleSignUp() {
    if (!fullName.trim() || !email.trim() || !password) {
      haptics.error();
      Alert.alert('Missing fields', 'Please enter your full name, email, and password.');
      return;
    }
    if (!isPasswordLongEnough(password)) {
      haptics.error();
      Alert.alert('Weak password', PASSWORD_TOO_SHORT_MESSAGE);
      return;
    }

    haptics.medium();
    setLoading(true);
    try {
      await signUp(email.trim().toLowerCase(), password, fullName.trim());
      haptics.success();
      Alert.alert(
        'Check your email',
        'We sent you a confirmation link. Open it, then come back to sign in.',
        [{ text: 'Go to Sign In', onPress: () => router.replace({ pathname: '/sign-in', params: returnTo ? { returnTo } : {} }) }],
      );
    } catch (e: any) {
      haptics.error();
      Alert.alert('Sign up failed', e.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignUp() {
    haptics.medium();
    setGoogleLoading(true);
    try {
      const session = await signInWithGoogle();
      if (session) {
        haptics.success();
        // A brand-new OAuth account has an incomplete profile. Route through
        // the root gate (item 1.1) rather than hard-landing in the tabs, so it
        // decides between onboarding and the app. An explicit returnTo from a
        // deep link still wins.
        router.replace((returnTo ?? '/') as never);
      }
    } catch (e: any) {
      haptics.error();
      Alert.alert('Sign up failed', e.message ?? 'Something went wrong. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleAppleSignUp() {
    haptics.medium();
    setAppleLoading(true);
    try {
      const session = await signInWithApple();
      if (session) {
        haptics.success();
        // Same reasoning as the Google path above — let the root gate decide.
        router.replace((returnTo ?? '/') as never);
      }
      // session === null means the user cancelled -- no haptic, no alert,
      // stay on this screen (Phase 7 Step 15).
    } catch (e: any) {
      haptics.error();
      Alert.alert('Sign up failed', e.message ?? 'Something went wrong. Please try again.');
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
              <Text style={s.heading}>Create account</Text>
              <Text style={s.sub}>Join Pickleball App</Text>
            </View>

            <View style={s.form}>
              <View style={s.field}>
                <Text style={s.label}>Full name</Text>
                <TextInput
                  style={s.input}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Jane Smith"
                  placeholderTextColor={MUTED_BLUE}
                  autoComplete="name"
                  returnKeyType="next"
                />
              </View>

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
                    placeholder={PASSWORD_PLACEHOLDER}
                    placeholderTextColor={MUTED_BLUE}
                    secureTextEntry={!showPassword}
                    autoComplete="new-password"
                    returnKeyType="done"
                    onSubmitEditing={handleSignUp}
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
            </View>

            <Animated.View style={[s.ctaWrap, { transform: [{ scale: ctaScale }] }]}> 
              {!loading && <Animated.View pointerEvents="none" style={[s.ctaGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />}
              <TouchableOpacity
                style={[s.btn, loading && s.btnLoading]}
                onPress={handleSignUp}
                onPressIn={pressIn}
                onPressOut={pressOut}
                disabled={loading}
                activeOpacity={0.92}
              >
                {loading
                  ? <ActivityIndicator color={colors.navy} />
                  : <Text style={s.btnText}>Create Account</Text>}
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
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={radius.card}
                  style={s.appleBtn}
                  onPress={handleAppleSignUp}
                />
              )
            )}

            <TouchableOpacity
              style={[s.googleBtn, googleLoading && s.btnLoading]}
              onPress={handleGoogleSignUp}
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

            <TouchableOpacity style={s.linkBtn} onPress={() => router.replace({ pathname: '/sign-in', params: returnTo ? { returnTo } : {} })} activeOpacity={0.7}>
              <Text style={s.linkText}>Already have an account? <Text style={s.linkAccent}>Sign in</Text></Text>
            </TouchableOpacity>

            <Text style={s.terms}>
              By creating an account, you agree to our{' '}
              <Text style={s.termsLink} onPress={openTerms} suppressHighlighting>
                Terms of Service
              </Text>{' '}
              and{' '}
              <Text style={s.termsLink} onPress={openPrivacy} suppressHighlighting>
                Privacy Policy
              </Text>
              .
            </Text>
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

  linkBtn: { alignItems: 'center', marginBottom: 18 },
  linkText: { color: MUTED_BLUE, fontSize: 14, fontWeight: '600' },
  linkAccent: { color: colors.gold, fontWeight: '900' },

  terms: { color: MUTED_BLUE, fontSize: 11, textAlign: 'center', lineHeight: 16 },
  termsLink: { color: MUTED_BLUE, fontSize: 11, lineHeight: 16, fontWeight: '700', textDecorationLine: 'underline' },
});
