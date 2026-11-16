import type { ConfigContext, ExpoConfig } from 'expo/config';

const BRAND = '#0F9D58';
const BRAND_DARK = '#0B3D2E';
const projectId = process.env.EAS_PROJECT_ID;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Smart Reply',
  slug: 'smart-reply',
  owner: process.env.EAS_OWNER,
  scheme: 'smartreply',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: BRAND
  },
  ios: {
    bundleIdentifier: 'lk.lumiai.smartreply',
    buildNumber: '1',
    supportsTablet: false,
    infoPlist: {
      NSMicrophoneUsageDescription: 'Smart Reply uses the microphone for customer calls and voice notes.',
      NSCameraUsageDescription: 'Smart Reply uses the camera to take photos you send to customers.',
      NSPhotoLibraryUsageDescription: 'Smart Reply opens your photos so you can send them to customers.',
      UIBackgroundModes: ['audio', 'remote-notification'],
      ITSAppUsesNonExemptEncryption: false
    }
  },
  android: {
    package: 'lk.lumiai.smartreply',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: BRAND
    },
    edgeToEdgeEnabled: true,
    permissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.CAMERA',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.WAKE_LOCK'
    ],
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON
  },
  web: {
    favicon: './assets/favicon.png'
  },
  plugins: [
    'expo-router',
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: BRAND
      }
    ],
    [
      'expo-audio',
      {
        microphonePermission: 'Smart Reply uses the microphone for customer calls and voice notes.'
      }
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Smart Reply opens your photos so you can send them to customers.',
        cameraPermission: 'Smart Reply uses the camera to take photos you send to customers.'
      }
    ],
    [
      '@config-plugins/react-native-webrtc',
      {
        cameraPermission: 'Smart Reply uses the camera to take photos you send to customers.',
        microphonePermission: 'Smart Reply uses the microphone for customer calls and voice notes.'
      }
    ],
    'expo-secure-store',
    [
      '@react-native-community/datetimepicker',
      {
        android: { datePicker: { colorAccent: { light: BRAND } } }
      }
    ],
    'expo-web-browser'
  ],
  experiments: {
    typedRoutes: true
  },
  extra: {
    brandDark: BRAND_DARK,
    ...(projectId ? { eas: { projectId } } : {})
  }
});
