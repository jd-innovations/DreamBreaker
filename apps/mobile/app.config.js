const appJson = require('./app.json');

const androidGoogleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY;
const iosGoogleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY;

// Single source of truth for the app's one native camera permission string —
// see the expo-camera plugin entry below for why this must be shared.
const CAMERA_PERMISSION_TEXT =
  'Allow DreamBreaker to use your camera to take and send photos in chat, and to scan QR codes for check-in and redemption.';

module.exports = {
  ...appJson.expo,
  ios: {
    ...appJson.expo.ios,
    associatedDomains: Array.from(new Set([
      ...(appJson.expo.ios?.associatedDomains ?? []),
      'applinks:pickleballapp.app',
    ])),
    config: {
      ...appJson.expo.ios?.config,
      googleMapsApiKey: iosGoogleMapsApiKey,
    },
  },
  android: {
    ...appJson.expo.android,
    config: {
      ...appJson.expo.android?.config,
      googleMaps: {
        ...appJson.expo.android?.config?.googleMaps,
        apiKey: androidGoogleMapsApiKey,
      },
    },
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#07091A',
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
          'DreamBreaker uses your location to show nearby courts, games, and tournaments.',
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission:
          'Allow DreamBreaker to access your photos so you can send images in chat.',
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
