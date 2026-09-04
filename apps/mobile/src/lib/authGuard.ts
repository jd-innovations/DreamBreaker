import { Alert } from 'react-native';
import { router } from 'expo-router';

export function requireAuth(userId: string | undefined, onGranted: () => void): void {
  if (userId) {
    onGranted();
    return;
  }
  Alert.alert(
    'Log in required',
    'Please log in or create an account to continue.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log In', onPress: () => router.push('/sign-in' as never) },
    ],
  );
}

export function redirectIfGuest(userId: string | undefined, loading: boolean): boolean {
  if (loading) return false;
  if (!userId) {
    router.replace('/sign-in' as never);
    return true;
  }
  return false;
}
