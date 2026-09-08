import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import { deleteCurrentDevicePushToken } from './pushNotifications';
import { updateProfile } from './services/profile';
import { track } from './analytics';

// No-op on native; required once for the OAuth browser session to resolve on web.
WebBrowser.maybeCompleteAuthSession();

export async function signIn(email: string, password: string) {
  // Instrumented here rather than in the screen so every caller is covered —
  // the sign-in screen is not the only entry point, and a funnel that misses
  // one path reads as user drop-off rather than as missing instrumentation.
  track('auth_started', { method: 'email' });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // No message: Supabase auth errors are prose and can echo the address that
    // was typed. The count and the method are the signal.
    track('auth_failed', { method: 'email' });
    throw error;
  }
  track('auth_succeeded', { method: 'email' });
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
  track('auth_started', { method: 'email', source: 'sign_up' });
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, ...extraMetadata } },
  });
  if (error) {
    track('auth_failed', { method: 'email', source: 'sign_up' });
    throw error;
  }
  // Deliberately not auth_succeeded. With confirmations on, signUp returns no
  // session — the account exists but the person is not signed in, and counting
  // this as a success would hide every abandoned confirmation.
  return data;
}

// Browser-redirect Google OAuth (Supabase's documented native-mobile-deep-linking
// pattern). Returns null if the user cancels/dismisses the browser sheet rather
// than throwing — callers should treat null as "stay on the current screen."
export async function signInWithGoogle() {
  // The app's own scheme, always — NOT makeRedirectUri().
  //
  // makeRedirectUri({ native }) honours `native` only when
  // Constants.executionEnvironment is Standalone or Bare (see its source). A
  // development client is neither, so it falls through to the DEV SERVER url —
  // exp://<tunnel-host> — which is not in Supabase's redirect allowlist. GoTrue
  // then falls back to the project Site URL and Google sign-in lands the user
  // on the WEB app, with no error raised anywhere. Confirmed by logging the
  // computed value on device, 2026-08-28.
  //
  // `pickleballapp://` is declared in app.json, registered by both the dev
  // client and standalone builds, and allowlisted in Supabase, so it is correct
  // in every environment this app actually runs in.
  const redirectTo = 'pickleballapp://';

  track('auth_started', { method: 'google' });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) {
    track('auth_failed', { method: 'google', error_code: 'oauth_url_failed' });
    throw error;
  }

  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  // A dismissed browser sheet is a cancel, not a failure. Counting it as
  // failed would make Google sign-in look broken every time someone changes
  // their mind — the distinction the return contract already draws.
  if (res.type !== 'success') {
    track('auth_failed', { method: 'google', result: 'canceled' });
    return null;
  }

  const { params, errorCode } = QueryParams.getQueryParams(res.url);
  if (errorCode) {
    // errorCode is GoTrue's short code, not prose.
    track('auth_failed', { method: 'google', error_code: errorCode });
    throw new Error(errorCode);
  }

  const { access_token, refresh_token } = params;
  if (!access_token || !refresh_token) {
    track('auth_failed', { method: 'google', error_code: 'missing_tokens' });
    return null;
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });
  if (sessionError) {
    track('auth_failed', { method: 'google', error_code: 'set_session_failed' });
    throw sessionError;
  }
  track('auth_succeeded', { method: 'google' });
  return sessionData.session;
}

// Native Sign in with Apple (expo-apple-authentication) -> Supabase's
// signInWithIdToken(), which validates Apple's identity token server-side.
// Reuses the exact same session/profile architecture as signInWithGoogle()
// above and email/password signIn() -- there is no separate Apple session
// system. Mirrors signInWithGoogle()'s contract: returns the Session on
// success, null if the user cancelled or Apple auth isn't available on this
// device (neither is an error), and throws for genuine failures.
export async function signInWithApple() {
  const available = await AppleAuthentication.isAvailableAsync();
  // Not an attempt: the device cannot offer Apple sign-in at all. Recording a
  // start here would put unreachable users in the top of the funnel.
  if (!available) return null;

  track('auth_started', { method: 'apple' });

  // Apple's documented nonce pattern: the SHA256 hash goes to Apple (embedded
  // verbatim in the identity token's `nonce` claim); the original raw value
  // goes to Supabase, which hashes it again and compares against that claim.
  // This is Supabase's own documented native-Apple pattern, not a custom
  // token-validation scheme.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    if (__DEV__) console.log('[auth] apple auth started');
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (e: unknown) {
    // The user tapped Cancel -- not an authentication failure.
    if (e && typeof e === 'object' && 'code' in e && e.code === 'ERR_REQUEST_CANCELED') {
      if (__DEV__) console.log('[auth] apple auth cancelled');
      track('auth_failed', { method: 'apple', result: 'canceled' });
      return null;
    }
    track('auth_failed', { method: 'apple', error_code: 'apple_sign_in_failed' });
    throw e;
  }

  if (!credential.identityToken) {
    track('auth_failed', { method: 'apple', error_code: 'no_identity_token' });
    throw new Error('Apple did not return an identity token.');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) {
    if (__DEV__) console.log('[auth] supabase auth failed');
    track('auth_failed', { method: 'apple', error_code: 'id_token_rejected' });
    throw error;
  }
  if (__DEV__) console.log('[auth] supabase auth success');
  track('auth_succeeded', { method: 'apple' });

  // Apple returns the user's name only on the FIRST authorization ever for
  // this Apple ID + app pair -- every later sign-in gets `fullName: null`.
  // Only write it when present; a null/missing name here is never written,
  // so an existing profile name is never overwritten with blank (Step 9).
  if (credential.fullName) {
    const displayName = AppleAuthentication.formatFullName(credential.fullName).trim();
    const givenName = credential.fullName.givenName?.trim() ?? '';
    const familyName = credential.fullName.familyName?.trim() ?? '';

    if (displayName) {
      try {
        await updateProfile(data.user.id, { full_name: displayName });
      } catch (e) {
        // Non-fatal: the session is already established. The profile keeps
        // fn_handle_new_user()'s fallback name (email local-part) if this
        // one-time backfill fails.
        if (__DEV__) console.warn('[auth] failed to backfill Apple full name', e);
      }

      // Also mirror the name into auth.users.user_metadata, which is where
      // Google's OAuth flow already deposits full_name/given_name/family_name.
      // Apple's identity token carries only `email` -- the name lives solely on
      // this one-time credential -- so without this, anything reading
      // user_metadata (onboarding's create-account.tsx prefill) would see a
      // name for Google users but never for Apple ones. Writing it here keeps
      // those consumers provider-agnostic instead of special-casing Apple, and
      // makes the name durable in auth.users, since Apple will never hand it
      // over again on subsequent sign-ins.
      try {
        await supabase.auth.updateUser({
          data: {
            full_name: displayName,
            ...(givenName ? { given_name: givenName } : {}),
            ...(familyName ? { family_name: familyName } : {}),
          },
        });
      } catch (e) {
        if (__DEV__) console.warn('[auth] failed to mirror Apple name into user metadata', e);
      }
    }
  }

  // Apple's private relay email (Hide My Email) arrives as a normal email
  // string in credential.email / the identity token's `email` claim -- it
  // needs no special handling. fn_handle_new_user() already reads
  // auth.users.email as-is for new accounts, same as any other provider.

  return data.session;
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
  // Best-effort cleanup, while a session still exists to authorize it.
  //
  // The getUser() call used to sit outside this try, so a failure there — an
  // expired token, no connectivity — threw before signOut() was ever reached,
  // and the user could not sign out at all. A stale push token is the far
  // cheaper failure: the next registration overwrites it.
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) await deleteCurrentDevicePushToken(user.id);
  } catch (err) {
    if (__DEV__) console.warn('[auth] push token cleanup failed before sign-out', err);
  }

  // Sign out THIS device only.
  //
  // The default scope is 'global', which revokes every refresh token on the
  // account — signing out on the phone also signed the user out on the web.
  // That is not what "Sign out" means to anyone. Web uses 'local' for the same
  // reason, and delete-account.tsx already did.
  const { error } = await supabase.auth.signOut({ scope: 'local' });
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
