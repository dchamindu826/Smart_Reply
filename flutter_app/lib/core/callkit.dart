import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_callkit_incoming/entities/entities.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';

/// The phone's own incoming-call screen (iOS CallKit, Android full-screen call), so a WhatsApp
/// call rings like a phone call even when Smart Reply is closed. The server wakes the phone with
/// an Apple VoIP push (iOS) or a high-priority data push (Android); see core/push.dart.
class CallKit {
  /// Accept / decline / hang up pressed on the system call screen.
  static void Function(String callId)? onAccept;
  static void Function(String callId)? onDecline;
  static void Function(String callId)? onEnded;

  /// iOS VoIP token changed (send it to the server again).
  static void Function()? onVoipToken;

  static StreamSubscription<CallEvent?>? _events;

  /// Call ids already handled, so a repeated event does nothing.
  static final _handled = <String>{};

  /// Calls this app closed itself (answered in the app, taken by a colleague…): their "ended" event is not a hang-up.
  static final _closedByApp = <String>{};

  static CallKitParams params({required String id, required String name, String phone = '', int seconds = 45}) => CallKitParams(
        id: id,
        nameCaller: name.isEmpty ? 'WhatsApp call' : name,
        appName: 'Smart Reply',
        handle: phone,
        type: 0,
        duration: seconds * 1000,
        textAccept: 'Answer',
        textDecline: 'Decline',
        missedCallNotification: const NotificationParams(showNotification: true, isShowCallback: false, subtitle: 'Missed WhatsApp call'),
        extra: {'callId': id},
        android: const AndroidParams(
          isCustomNotification: true,
          isShowLogo: false,
          backgroundColor: '#001A45',
          actionColor: '#1FAE55',
          textColor: '#FFFFFF',
          incomingCallNotificationChannelName: 'Incoming calls',
          missedCallNotificationChannelName: 'Missed calls',
          isShowFullLockedScreen: true,
        ),
        ios: const IOSParams(
          handleType: 'generic',
          supportsVideo: false,
          maximumCallGroups: 1,
          maximumCallsPerCallGroup: 1,
          supportsDTMF: false,
          supportsHolding: false,
          supportsGrouping: false,
          supportsUngrouping: false,
          includesCallsInRecents: false,
          audioSessionMode: 'voiceChat',
          audioSessionActive: true,
        ),
      );

  /// Show the ringing screen (also called from the background push handler, in its own isolate).
  static Future<void> show({required String id, required String name, String phone = '', int seconds = 45}) async {
    try {
      await FlutterCallkitIncoming.showCallkitIncoming(params(id: id, name: name, phone: phone, seconds: seconds));
    } catch (e) {
      debugPrint('CallKit show failed: $e');
    }
  }

  static Future<void> end(String id) async {
    _closedByApp.add(id);
    try {
      await FlutterCallkitIncoming.endCall(id);
    } catch (_) {}
  }

  static Future<void> connected(String id) async {
    try {
      await FlutterCallkitIncoming.setCallConnected(id);
    } catch (_) {}
  }

  /// Listen for the person's taps on the system call screen. Call once at start-up.
  static Future<void> init() async {
    _events ??= FlutterCallkitIncoming.onEvent.listen((event) {
      switch (event) {
        case CallEventActionCallAccept(:final callKitParams):
          _accept(callKitParams.id);
        case CallEventActionCallDecline(:final callKitParams):
          final id = callKitParams.id;
          if (!_closedByApp.contains(id) && _handled.add('d:$id')) onDecline?.call(id);
        case CallEventActionCallEnded(:final callKitParams):
          final id = callKitParams.id;
          if (!_closedByApp.contains(id) && _handled.add('e:$id')) onEnded?.call(id);
        case CallEventActionDidUpdateDevicePushTokenVoip():
          onVoipToken?.call();
        default:
          break;
      }
    });
    // Opened by tapping Answer while the app was closed: the accept happened before we listened.
    try {
      for (final c in await FlutterCallkitIncoming.activeCalls()) {
        if (c.isAccepted) _accept(c.id);
      }
    } catch (_) {}
  }

  /// Calls on the system call screen now: id and whether the person answered it there.
  static Future<List<(String, bool)>> active() async {
    try {
      return [for (final c in await FlutterCallkitIncoming.activeCalls()) (c.id, c.isAccepted)];
    } catch (_) {
      return const [];
    }
  }

  static void _accept(String id) {
    if (id.isEmpty || !_handled.add('a:$id')) return;
    onAccept?.call(id);
  }

  /// Android 13+ asks for notifications, Android 14+ for full-screen call screens.
  static Future<void> askPermissions() async {
    if (!Platform.isAndroid) return;
    try {
      await FlutterCallkitIncoming.requestNotificationPermission({
        'title': 'Notifications',
        'rationaleMessagePermission': 'Smart Reply needs notifications to ring for WhatsApp calls.',
        'postNotificationMessageRequired': 'Allow notifications in Settings so WhatsApp calls can ring.',
      });
      if (!await FlutterCallkitIncoming.canUseFullScreenIntent()) await FlutterCallkitIncoming.requestFullIntentPermission();
    } catch (_) {}
  }

  /// iOS only: the PushKit token the server sends VoIP pushes to.
  static Future<String?> voipToken() async {
    if (!Platform.isIOS) return null;
    try {
      final t = await FlutterCallkitIncoming.getDevicePushTokenVoIP();
      return (t != null && t.isNotEmpty) ? t : null;
    } catch (_) {
      return null;
    }
  }
}
