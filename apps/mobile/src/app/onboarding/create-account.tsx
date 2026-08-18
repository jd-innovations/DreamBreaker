import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import { colors, radius, spacing } from '@/theme';
import { getUser, signInWithGoogle, signInWithApple } from '@/lib/auth';
import { haptics } from '@/lib/haptics';
import { useOnboarding } from '@/lib/onboarding/state';

const L = colors;
const PAGE_BG = '#F8F5EF';

type AuthMethod = 'google' | 'apple' | 'email';

export default function CreateAccountScreen() {
  const insets = useSafeAreaInsets();
  const { draft, update } = useOnboarding();
  const [loadingMethod, setLoadingMethod] = useState<AuthMethod | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  // Hide the Apple button where Sign in with Apple can't run (Android, web,
  // simulators without an Apple ID) rather than showing a button that would
  // silently do nothing -- same gate as sign-in.tsx/sign-up.tsx.
  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  async function chooseProvider(method: Exclude<AuthMethod, 'email'>) {
    update('authMethod', method);
    setLoadingMethod(method);

    // Both providers must produce a real Supabase session HERE, before
    // onboarding continues. finalizeOnboarding() later branches on that
    // session existing (see lib/onboarding/finalize.ts) -- previously the
    // Apple button set authMethod and walked on without authenticating, so
    // the user only discovered the failure at the very end of onboarding.
    try {
      const session = method === 'apple' ? await signInWithApple() : await signInWithGoogle();
      if (!session) {
        // Cancelled the Apple sheet / dismissed the Google browser tab (or
        // Apple auth unavailable). Not an error -- stay on this screen.
        setLoadingMethod(null);
        return;
      }
    } catch (e) {
      setLoadingMethod(null);
      haptics.error();
      Alert.alert('Sign-in failed', e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      return;
    }

    haptics.success();

    try {
      const user = await getUser();
      const metadata = user?.user_metadata ?? {};
      const fullName = readMetadata(metadata, ['full_name', 'name', 'display_name']);
      const firstName = readMetadata(metadata, ['given_name', 'first_name']);
      const lastName = readMetadata(metadata, ['family_name', 'last_name']);
      const avatarUrl = readMetadata(metadata, ['avatar_url', 'picture']);
      const split = splitName(fullName);

      if (user?.email) update('profileEmail', user.email.toLowerCase());
      if (user?.id) update('providerSubject', user.id);
      if (avatarUrl) update('avatarUrl', avatarUrl);
      if (!draft.firstName && (firstName || split.firstName)) update('firstName', firstName || split.firstName);
      if (!draft.lastName && (lastName || split.lastName)) update('lastName', lastName || split.lastName);
    } finally {
      setLoadingMethod(null);
      router.push('/onboarding/your-name');
    }
  }

  function chooseEmail() {
    haptics.light();
    update('authMethod', 'email');
    router.push('/onboarding/email-account');
  }

  return (
    <View style={[s.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 28 }]}>
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={26} color={L.navy} />
        </TouchableOpacity>
      </View>

      <View style={s.content}>
        <View style={s.titleBlock}>
          <Text style={s.title}>Create your account</Text>
          <Text style={s.subtitle}>Almost done! Create your account to get started.</Text>
        </View>

        <View style={s.buttonStack}>
          {appleAvailable && (
            <AccountButton
              icon="logo-apple"
              label="Continue with Apple"
              loading={loadingMethod === 'apple'}
              disabled={loadingMethod !== null}
              onPress={() => chooseProvider('apple')}
            />
          )}
          <AccountButton
            icon="logo-google"
            label="Continue with Google"
            loading={loadingMethod === 'google'}
            disabled={loadingMethod !== null}
            onPress={() => chooseProvider('google')}
          />
          <AccountButton
            icon="mail-outline"
            label="Continue with Email"
            disabled={loadingMethod !== null}
            onPress={chooseEmail}
          />
        </View>
      </View>

      <Text style={s.legal}>
        By continuing, you agree to our{`\n`}
        <Text style={s.legalLink}>Terms of Service</Text> and <Text style={s.legalLink}>Privacy Policy</Text>.
      </Text>
    </View>
  );
}

function AccountButton({
  icon,
  label,
  loading,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[s.accountButton, disabled && s.accountButtonDisabled]} activeOpacity={0.82} onPress={onPress} disabled={disabled}>
      <View style={s.accountButtonContent}>
        {loading ? (
          <ActivityIndicator color={L.gold} />
        ) : (
          <>
            <View style={s.iconSlot}>
              <Ionicons name={icon} size={icon === 'logo-apple' ? 23 : 22} color={icon === 'logo-google' ? '#4285F4' : L.navy} />
            </View>
            <Text style={s.accountButtonText}>{label}</Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

function readMetadata(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? '',
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : '',
  };
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PAGE_BG,
    paddingHorizontal: spacing.lg,
  },
  header: {
    height: 40,
    justifyContent: 'center',
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 74,
  },
  titleBlock: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    color: L.navy,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: L.navy,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 260,
  },
  buttonStack: {
    gap: spacing.md,
  },
  accountButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E7DED0',
    borderRadius: radius.card,
    backgroundColor: 'rgba(255,255,255,0.86)',
    paddingHorizontal: spacing.xl,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  accountButtonDisabled: {
    opacity: 0.72,
  },
  accountButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSlot: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  accountButtonText: {
    color: L.navy,
    fontSize: 15,
    fontWeight: '800',
  },
  legal: {
    color: L.textSub,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  legalLink: {
    color: L.gold,
    fontWeight: '800',
  },
});
