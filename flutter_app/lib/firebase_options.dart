// Firebase settings for push notifications.
//
// Fill these from the Firebase console → Project settings → General → Your apps.
// They are identifiers, not secrets (they ship inside every app build).
// While an app id or API key is empty, push is switched off and the app still works.
import 'dart:io';
import 'package:firebase_core/firebase_core.dart';

class FirebaseConfig {
  /// Project settings → General → "Project ID" and "Project number" (= sender ID).
  static const projectId = 'smart-reply-764da';
  static const messagingSenderId = '639153936515';

  /// Your apps → Apple app (lk.lumiai.smartreply): "App ID", and API_KEY from
  /// GoogleService-Info.plist.
  static const iosAppId = '1:639153936515:ios:7dd1b45d2347f1a1e063b6';
  static const iosApiKey = 'AIzaSyB0CO3UvLJ80scA7iPtnBAQv8GDJFRlOtc';

  /// Your apps → Android app (lk.lumiai.smartreply): "App ID", and
  /// client → api_key → current_key from google-services.json.
  static const androidAppId = '1:639153936515:android:43de2d6a36f052f9e063b6';
  static const androidApiKey = 'AIzaSyCEGhBpEeFi3qL1LIVrDrOJlC_nZI9h3Io';

  static const iosBundleId = 'lk.lumiai.smartreply';

  static FirebaseOptions? get current {
    if (projectId.isEmpty || messagingSenderId.isEmpty) return null;
    if (Platform.isIOS) {
      if (iosAppId.isEmpty || iosApiKey.isEmpty) return null;
      return const FirebaseOptions(
        apiKey: iosApiKey,
        appId: iosAppId,
        messagingSenderId: messagingSenderId,
        projectId: projectId,
        iosBundleId: iosBundleId,
      );
    }
    if (Platform.isAndroid) {
      if (androidAppId.isEmpty || androidApiKey.isEmpty) return null;
      return const FirebaseOptions(
        apiKey: androidApiKey,
        appId: androidAppId,
        messagingSenderId: messagingSenderId,
        projectId: projectId,
      );
    }
    return null;
  }
}
