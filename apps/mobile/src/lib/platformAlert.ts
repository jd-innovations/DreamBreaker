import { Alert, Platform } from 'react-native';

// react-native-web's Alert.alert is a total no-op (no dialog, no log) — falls
// back to window.alert so web users actually see sign-in/error feedback.
export function platformAlert(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
