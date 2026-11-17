import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'api.dart';

/// Push notifications through Firebase Cloud Messaging (Android and iOS).
/// Needs `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) from your
/// Firebase project; without them the app works and simply gets no push.
class Push {
  static bool ready = false;
  static final _local = FlutterLocalNotificationsPlugin();
  static void Function(String conversationId)? onOpenChat;
  static StreamSubscription<String>? _tokenRefresh;

  static Future<void> init() async {
    try {
      await Firebase.initializeApp();
      await _local.initialize(
        const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(),
        ),
        onDidReceiveNotificationResponse: (r) {
          final id = r.payload;
          if (id != null && id.isNotEmpty) onOpenChat?.call(id);
        },
      );
      final android = _local.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      await android?.createNotificationChannel(const AndroidNotificationChannel('messages', 'Messages', importance: Importance.high));
      await android?.createNotificationChannel(const AndroidNotificationChannel('calls', 'Calls', importance: Importance.max));

      FirebaseMessaging.onMessage.listen((m) {
        final n = m.notification;
        if (n == null) return;
        final channel = m.data['kind'] == 'call' ? 'calls' : 'messages';
        _local.show(
          m.hashCode,
          n.title,
          n.body,
          NotificationDetails(
            android: AndroidNotificationDetails(channel, channel == 'calls' ? 'Calls' : 'Messages', importance: Importance.high, priority: Priority.high),
            iOS: const DarwinNotificationDetails(),
          ),
          payload: m.data['conversationId'] as String?,
        );
      });
      FirebaseMessaging.onMessageOpenedApp.listen((m) {
        final id = m.data['conversationId'] as String?;
        if (id != null) onOpenChat?.call(id);
      });
      final initial = await FirebaseMessaging.instance.getInitialMessage();
      final id = initial?.data['conversationId'] as String?;
      if (id != null) Future.delayed(const Duration(seconds: 2), () => onOpenChat?.call(id));
      ready = true;
    } catch (e) {
      debugPrint('Push not set up: $e');
    }
  }

  /// Ask permission and tell the API where to send pushes for this person.
  static Future<void> register(Api api) async {
    if (!ready) return;
    try {
      final settings = await FirebaseMessaging.instance.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) return;
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null) return;
      await api.post('/me/devices', {'platform': Platform.isIOS ? 'ios' : 'android', 'pushToken': token});
      _tokenRefresh?.cancel();
      _tokenRefresh = FirebaseMessaging.instance.onTokenRefresh.listen((t) {
        api.post('/me/devices', {'platform': Platform.isIOS ? 'ios' : 'android', 'pushToken': t}).catchError((Object e) => debugPrint('Push token update failed: $e'));
      });
    } catch (e) {
      debugPrint('Push registration failed: $e');
    }
  }
}
