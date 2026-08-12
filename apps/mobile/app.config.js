const appJson = require('./app.json');

const androidGoogleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY;
const iosGoogleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY;

module.exports = {
  ...appJson.expo,
  ios: {
    ...appJson.expo.ios,
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
        cameraPermission:
          'Allow DreamBreaker to use your camera so you can take and send photos in chat.',
      },
    ],
    'expo-notifications',
    // '@stripe/stripe-react-native' plugin removed for now: importing it
    // anywhere under src/app/ breaks both the web target ("Importing
    // react-native internals is not supported on web", via a transitive
    // ReactFabric import in its helpers.js) and Expo Go ("Unable to resolve
    // module @stripe/stripe-react-native") — confirmed 2026-08-11, see
    // BOOKING_ENGINE_PHASE3_REPORT.md. Re-add this plugin (with a real
    // merchantIdentifier, not a placeholder) once the app runs via a custom
    // Expo dev client on a real device/simulator.
    'expo-dev-client',
  ],
};
