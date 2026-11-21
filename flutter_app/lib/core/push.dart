import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../firebase_options.dart';
import 'api.dart';
import 'callkit.dart';

/// Runs in its own isolate when a push arrives while the app is in the background or closed.
/// An incoming call shows the phone's full-screen call screen; a stop closes it.
@pragma('vm:entry-point')
Future<void> pushInBackground(RemoteMessage m) async {
  await _handleCallPush(m.data);
}

Future<bool> _handleCallPush(Map<String, dynamic> d) async {
  final callId = d['callId'] as String?;
  if (callId == null || callId.isEmpty) return false;
  if (d['kind'] == 'call' && d['ring'] == '1') {
    await CallKit.show(
      id: callId,
      name: (d['name'] as String?) ?? 'WhatsApp call',
      phone: (d['phone'] as String?) ?? '',
      seconds: int.tryParse('${d['ttl'] ?? ''}') ?? 45,
    );
    return true;
  }
  if (d['kind'] == 'call_end') {
    await CallKit.end(callId);
    return true;
  }
  return false;
}

/// Push notifications through Firebase Cloud Messaging (Android and iOS).
/// Settings live in lib/firebase_options.dart; while they are empty the app works
/// and simply gets no push.
class Push {
  static bool ready = false;
  static final _local = FlutterLocalNotificationsPlugin();
  static void Function(String conversationId)? onOpenChat;
  static StreamSubscription<String>? _tokenRefresh;

  static Future<void> init() async {
    try {
      final options = FirebaseConfig.current;
      if (options == null) {
        debugPrint('Push off: fill lib/firebase_options.dart');
        return;
      }
      await Firebase.initializeApp(options: options);
      FirebaseMessaging.onBackgroundMessage(pushInBackground);
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
        // App open: the live connection already shows the call, so only a stop matters here.
        if (m.data['kind'] == 'call_end') {
          unawaited(_handleCallPush(m.data));
          return;
        }
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

  static String? _token;

  /// FCM token plus, on iOS, the VoIP token that wakes the phone for calls.
  static Future<void> _send(Api api) async {
    final token = _token;
    if (token == null) return;
    final voip = await CallKit.voipToken();
    await api.post('/me/devices', {
      'platform': Platform.isIOS ? 'ios' : 'android',
      'pushToken': token,
      if (voip != null) 'voipToken': voip,
    });
  }

  /// Ask permission and tell the API where to send pushes for this person.
  static Future<void> register(Api api) async {
    if (!ready) return;
    try {
      final settings = await FirebaseMessaging.instance.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) return;
      if (Platform.isIOS) {
        // iOS gives the Apple push token a moment after permission; FCM needs it first
        for (var i = 0; i < 15 && await FirebaseMessaging.instance.getAPNSToken() == null; i++) {
          await Future<void>.delayed(const Duration(seconds: 1));
        }
      }
      final token = await FirebaseMessaging.instance.getToken();
      if (token == null) return;
      _token = token;
      await _send(api);
      _tokenRefresh?.cancel();
      _tokenRefresh = FirebaseMessaging.instance.onTokenRefresh.listen((t) {
        _token = t;
        _send(api).catchError((Object e) => debugPrint('Push token update failed: $e'));
      });
      // iOS: the VoIP token for calls can arrive after the FCM token.
      CallKit.onVoipToken = () => _send(api).catchError((Object e) => debugPrint('VoIP token update failed: $e'));
      await CallKit.askPermissions();
    } catch (e) {
      debugPrint('Push registration failed: $e');
    }
  }
}
