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
    // '@stripe/stripe-react-native' plugin removed for now: the native module
    // doesn't resolve inside Expo Go, and nothing in the app currently uses
    // StripeProvider (see the comment in app/_layout.tsx). Re-add this plugin
    // — with a real merchantIdentifier, not a placeholder — once a real
    // payment integration lands and the app moves to a custom dev client.
    'expo-dev-client',
  ],
};
