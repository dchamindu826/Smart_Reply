// Firebase settings for push notifications.
//
// Fill these from the Firebase console → Project settings → General → Your apps.
// They are identifiers, not secrets (they ship inside every app build).
// While an app id or API key is empty, push is switched off and the app still works.
import 'dart:io';
import 'package:firebase_core/firebase_core.dart';

class FirebaseConfig {
  /// Project settings → General → "Project ID" and "Project number" (= sender ID).
  static const projectId = '';
  static const messagingSenderId = '';

  /// Your apps → Apple app (lk.lumiai.smartreply): "App ID", and API_KEY from
  /// GoogleService-Info.plist.
  static const iosAppId = '';
  static const iosApiKey = '';

  /// Your apps → Android app (lk.lumiai.smartreply): "App ID", and
  /// client → api_key → current_key from google-services.json.
  static const androidAppId = '';
  static const androidApiKey = '';

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
