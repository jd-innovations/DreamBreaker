// The app's Expo configuration. There is deliberately NO app.json.
//
// This file used to `require('./app.json')` and spread it. That worked, but it
// failed `expo doctor`'s "Check Expo config for common issues" on every single
// EAS build:
//
//   You have an app.json file in your project, but your app.config.js is not
//   using the values from it.
//
// The warning was wrong — the spread did use them — but doctor only recognises
// the `({ config }) => ({ ...config })` form, not a direct require. The cost was
// not the false positive itself: it was a red X on every build log, which
// competes for attention with real failures. During build #8 it was the first
// thing examined while diagnosing a 71-minute build, and it was a dead end.
//
// The split was also actively misleading in a second way. app.json carried a
// `plugins` array that was DEAD: the spread put it in, and the `plugins` key
// below immediately overwrote it. Editing that list had no effect on anything.
//
// Everything from app.json is inlined below, unchanged. Nothing else read it —
// the two source references were comments, and getProjectId reads the resolved
// config (Constants.expoConfig.extra.eas.projectId), which this file provides.

const androidGoogleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY;
const iosGoogleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY;

// Single source of truth for the app's one native camera permission string —
// see the expo-camera plugin entry below for why this must be shared.
const CAMERA_PERMISSION_TEXT =
  'Allow Pickleball App to use your camera to take and send photos in chat, and to scan QR codes for check-in and redemption.';

module.exports = {
  name: 'Pickleball App',
  slug: 'dreambreaker',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'pickleballapp',
  // 'automatic' hands the choice to the OS; ThemeProvider layers the user's
  // own light/dark/system preference on top. This said 'dark' while the UI was
  // light.
  userInterfaceStyle: 'automatic',

  updates: {
    url: 'https://u.expo.dev/04fcdd30-fb9e-47e2-9371-8e4e8b521c17',
  },
  // fingerprint, NOT appVersion.
  //
  // The runtime version decides which installed builds an `eas update` is
  // offered to. `appVersion` derives it from the version string above, so it
  // only changes when someone edits that string by hand — adding a NATIVE
  // module does not move it.
  //
  // That is not academic. Between build #8 and #9 this app gained
  // expo-network, imported on the startup path via OfflineBanner. Under
  // `appVersion` both builds claim runtime "1.0.0", so an update built after
  // that change would have been delivered to build #8, whose binary has no
  // such native module, and crashed it at launch on every device that had it —
  // strictly worse than the bug such an update would be shipping to fix.
  //
  // `fingerprint` hashes the native project instead, so any native change
  // produces a new runtime and an incompatible update is simply never offered.
  // That is the whole point of the field, and it is the only policy that makes
  // OTA updates safe in a project that adds native dependencies.
  runtimeVersion: {
    policy: 'fingerprint',
  },

  ios: {
    supportsTablet: false,
    bundleIdentifier: 'app.pickleballapp',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
    associatedDomains: ['applinks:pickleballapp.app'],
    config: {
      googleMapsApiKey: iosGoogleMapsApiKey,
    },
  },

  android: {
    package: 'app.pickleballapp',
    adaptiveIcon: {
      backgroundColor: '#283C1D',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
    },
    predictiveBackGestureEnabled: false,
    // Android resizes rather than pans by default, which pushes chat input off
    // screen — see the note in src/app/community/[id].tsx.
    softwareKeyboardLayoutMode: 'pan',
    config: {
      googleMaps: {
        apiKey: androidGoogleMapsApiKey,
      },
    },
  },

  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },

  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },

  extra: {
    eas: {
      // Read at runtime by getProjectId() in src/lib/pushNotifications.ts, and
      // by EAS itself. Losing this breaks push token registration and builds.
      projectId: '04fcdd30-fb9e-47e2-9371-8e4e8b521c17',
    },
  },

  plugins: [
    'expo-router',
    [
      // Uploads source maps at build time so a crash reports a filename and
      // line instead of `index.android.bundle:1:284729`. Reads SENTRY_AUTH_TOKEN
      // from the build environment -- set on EAS for preview/production, absent
      // locally, where uploads are simply skipped.
      '@sentry/react-native',
      {
        organization: 'jd-innovations',
        project: 'react-native',
      },
    ],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#07091A',
        // Light wordmark, not logo-splash.png: that asset is dark ink on
        // transparency, so on this near-black background only the gold "app"
        // would have been visible.
        image: './assets/images/pickleballapp-logo-light.png',
        imageWidth: 260,
        resizeMode: 'contain',
      },
    ],
    '@react-native-community/datetimepicker',
    'expo-font',
    'expo-web-browser',
    'expo-secure-store',
    'expo-asset',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Pickleball App uses your location to show nearby courts, games, and tournaments.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'Allow Pickleball App to access your photos so you can send images in chat.',
        cameraPermission: CAMERA_PERMISSION_TEXT,
      },
    ],
    [
      'expo-camera',
      {
        // iOS only exposes one NSCameraUsageDescription for the whole app —
        // expo-image-picker (chat photos) and expo-camera (QR scanning) both
        // set it, and each plugin's explicit string wins over the other's
        // regardless of array order (see @expo/config-plugins ios/Permissions
        // applyPermissions: an explicit value always overwrites). Both plugin
        // entries deliberately share the same CAMERA_PERMISSION_TEXT so the
        // dialog users see is correct no matter which plugin's mod runs last.
        cameraPermission: CAMERA_PERMISSION_TEXT,
        // QR scanning needs no audio; suppress the mic permission expo-camera
        // would otherwise request by default (false deletes the Info.plist
        // key / Android permission instead of adding a generic one).
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
    'expo-notifications',
    // expo-calendar is installed (Phase 6, native "Add to Calendar") but its
    // config plugin is deliberately NOT registered here. The plugin's own
    // source (node_modules/expo-calendar/plugin/src/withCalendar.ts)
    // unconditionally adds Android's READ_CALENDAR/WRITE_CALENDAR permissions
    // and, unless explicitly suppressed, iOS NSCalendars*UsageDescription
    // strings -- but this app only ever calls
    // Calendar.createEventInCalendarAsync() (apps/mobile/src/lib/calendarEvents.native.ts),
    // which launches the OS's own event editor and needs no calendar
    // permission at all on either platform. Registering the plugin would
    // request calendar access this app never uses, violating least privilege
    // (Phase 6 Step 3). expo-calendar's native module still autolinks
    // correctly without a plugin entry -- the plugins array only controls
    // Info.plist/AndroidManifest mutations, not native module linking.
    [
      '@stripe/stripe-react-native',
      {
        enableGooglePay: false,
      },
    ],
    // expo-apple-authentication's plugin (node_modules/expo-apple-authentication/
    // plugin/src/withAppleAuthIOS.ts) adds the "com.apple.developer.applesignin"
    // iOS entitlement (Sign in with Apple capability) -- unlike expo-calendar,
    // there is no permission dialog or least-privilege tradeoff here: the
    // entitlement is a required capability declaration, not an OS permission
    // prompt, so the plugin is registered unconditionally.
    'expo-apple-authentication',
    'expo-dev-client',
  ],
};
