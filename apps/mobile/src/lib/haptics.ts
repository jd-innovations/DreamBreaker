import * as ExpoHaptics from 'expo-haptics';

function fire(effect: () => Promise<void>): void {
  effect().catch(() => undefined);
}

export const haptics = {
  selection() {
    fire(() => ExpoHaptics.selectionAsync());
  },

  light() {
    fire(() => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light));
  },

  medium() {
    fire(() => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium));
  },

  success() {
    fire(() => ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success));
  },

  warning() {
    fire(() => ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Warning));
  },

  error() {
    fire(() => ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error));
  },
};
