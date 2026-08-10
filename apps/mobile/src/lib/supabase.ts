import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
import type { Database } from './database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// expo-secure-store has no native binding on web — and none at all during the
// Node-side static-render pass, where `window` doesn't exist either. Fall back
// to browser localStorage when available, otherwise a no-op (nothing to
// persist mid-prerender).
const AuthStorageAdapter = {
  getItem: (key: string) => {
    if (Platform.OS !== 'web') return SecureStore.getItemAsync(key);
    return Promise.resolve(typeof window === 'undefined' ? null : window.localStorage.getItem(key));
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS !== 'web') return SecureStore.setItemAsync(key, value);
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    if (Platform.OS !== 'web') return SecureStore.deleteItemAsync(key);
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
    return Promise.resolve();
  },
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AuthStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Stop token auto-refresh when backgrounded; restart when foregrounded.
// Prevents iOS from blocking expo-secure-store access outside user interaction.
// Native-only concern — skip on web (no backgrounding lifecycle, and no
// AppState bridge during Node-side static rendering).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', state => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
