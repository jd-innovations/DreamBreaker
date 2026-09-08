import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Small per-device UI preferences (e.g. Quick Actions order) — not synced to
// the backend, just persisted locally. Mirrors the storage-adapter pattern in
// lib/supabase.ts (SecureStore on native, localStorage on web).
export async function getPref(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

export async function setPref(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}
