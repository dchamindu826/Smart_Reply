import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../core/api.dart';
import '../core/callkit.dart';
import '../core/webrtc.dart';
import '../models/models.dart';

/// Everything the signed-in person sees: the session, chats, team and live call state.
/// Live events from the server arrive on Socket.IO and update this object.
class AppState extends ChangeNotifier {
  AppState({required this.api, required this.tokens});

  Api api;
  final TokenStore tokens;
  Me? me;
  bool booting = true;

  io.Socket? _socket;
  bool socketConnected = false;

  /// Chats keyed by id, newest first in [conversations].
  final Map<String, Conversation> _convs = {};
  ConversationCounts counts = ConversationCounts({});
  List<StaffMember> staff = [];

  /// Messages of chats that are open (newest last).
  final Map<String, List<Message>> messages = {};
  final Map<String, String?> olderCursor = {};
  String? openConversationId;

  /// A call ringing for this person right now.
  RingingCall? ringing;

  /// A call answered on the phone's own call screen (app closed or in the background), with its
  /// audio already running, waiting for the call screen to take it over.
  ({RingingCall ringing, CallPeer peer})? systemCall;

  /// Calls answered on the system call screen: the system screen stays until hang-up.
  final Set<String> systemAccepted = {};
  final Set<String> _answering = {};
  final _booted = Completer<void>();

  /// Hang-ups pressed on the system call screen (the open call screen ends the call).
  final _systemHangups = StreamController<String>.broadcast();
  Stream<String> get systemHangups => _systemHangups.stream;

  /// Updates to calls (for the call screen).
  final _callUpdates = StreamController<Call>.broadcast();
  Stream<Call> get callUpdates => _callUpdates.stream;
  final _callSignals = StreamController<({String callId, String sdpAnswer})>.broadcast();
  Stream<({String callId, String sdpAnswer})> get callSignals => _callSignals.stream;

  /// Short notices to show as snack bars.
  final _notices = StreamController<String>.broadcast();
  Stream<String> get notices => _notices.stream;

  List<Conversation> get conversations {
    final list = _convs.values.where((c) => !c.archived && c.lastMessageAt != null).toList();
    list.sort((a, b) => (b.lastMessageAt ?? DateTime(2000)).compareTo(a.lastMessageAt ?? DateTime(2000)));
    return list;
  }

  Conversation? conversation(String id) => _convs[id];

  /* ───────── Session ───────── */

  Future<void> boot() async {
    await tokens.load();
    api.onSignedOut = () => unawaited(signOut());
    if (tokens.access != null) {
      try {
        me = Me.fromJson(Map<String, dynamic>.from(await api.get('/me') as Map));
        await _afterSignIn();
      } catch (_) {
        me = null;
      }
    }
    booting = false;
    if (!_booted.isCompleted) _booted.complete();
    notifyListeners();
  }

  /* ───────── The phone's own call screen ───────── */

  /// Answer pressed on the system call screen: answer with audio here, then show the call screen.
  Future<void> answerFromSystem(String callId) async {
    await _booted.future;
    if (me == null) return CallKit.end(callId);
    if (!_answering.add(callId)) return;
    systemAccepted.add(callId);
    try {
      var r = ringing?.call.id == callId ? ringing : null;
      if (r == null) {
        await _loadActiveCalls();
        r = ringing?.call.id == callId ? ringing : null;
      }
      if (r == null || r.sdpOffer == null) {
        systemAccepted.remove(callId);
        await CallKit.end(callId);
        _notices.add('That call is no longer ringing.');
        notifyListeners();
        return;
      }
      final (peer, sdpAnswer) = await CallPeer.answer(r.sdpOffer!);
      try {
        await api.post('/calls/$callId/answer', {'sdpAnswer': sdpAnswer});
      } catch (e) {
        await peer.close();
        rethrow;
      }
      await CallKit.connected(callId);
      systemCall = (ringing: r, peer: peer);
      ringing = null;
      notifyListeners();
    } catch (e) {
      systemAccepted.remove(callId);
      await CallKit.end(callId);
      _notices.add(errorText(e));
      notifyListeners();
    } finally {
      _answering.remove(callId);
    }
  }

  /// Answered (or being answered) on the system call screen.
  bool answeringFromSystem(String callId) => _answering.contains(callId) || systemAccepted.contains(callId);

  /// The call screen took over the audio of a call answered on the system screen.
  ({RingingCall ringing, CallPeer peer})? takeSystemCall(String callId) {
    final c = systemCall;
    if (c == null || c.ringing.call.id != callId) return null;
    systemCall = null;
    return c;
  }

  Future<void> declineFromSystem(String callId) async {
    await _booted.future;
    if (me == null) return;
    try {
      await api.post('/calls/$callId/decline', {});
    } catch (_) {}
    if (ringing?.call.id == callId) ringing = null;
    notifyListeners();
  }

  /// Hang-up pressed on the system call screen.
  Future<void> hangUpFromSystem(String callId) async {
    // A ringing screen that timed out or was dismissed is not a hang-up of a live call.
    if (!systemAccepted.contains(callId) && systemCall?.ringing.call.id != callId) return;
    systemAccepted.remove(callId);
    final c = takeSystemCall(callId);
    if (c != null) {
      // No call screen took the call yet: end it here.
      await c.peer.close();
      try {
        await api.post('/calls/$callId/hangup');
      } catch (_) {}
      notifyListeners();
      return;
    }
    _systemHangups.add(callId);
  }

  /// Close system call screens that should not ring any more (taken by a colleague while the app started).
  Future<void> _closeStaleSystemCalls() async {
    for (final (id, accepted) in await CallKit.active()) {
      if (accepted || systemAccepted.contains(id) || _answering.contains(id)) continue;
      if (ringing?.call.id != id) await CallKit.end(id);
    }
  }

  Future<void> useServer(String url) async {
    await ServerConfig.save(url);
    api = Api(await ServerConfig.load(), tokens)..onSignedOut = () => unawaited(signOut());
    notifyListeners();
  }

  Future<void> signIn(String email, String password) async {
    final res = Map<String, dynamic>.from(await api.post('/auth/login', {'email': email, 'password': password, 'client': 'mobile', 'device': 'Smart Reply app'}) as Map);
    final t = Map<String, dynamic>.from(res['tokens'] as Map);
    await tokens.save(t['accessToken'] as String, t['refreshToken'] as String);
    final signedIn = Me.fromJson(Map<String, dynamic>.from(res['me'] as Map));
    if (signedIn.user.role == 'system_admin') {
      await tokens.clear();
      throw ApiException(403, 'FORBIDDEN', 'The LUMI AI admin console is on the web. Sign in at your Smart Reply web address.');
    }
    me = signedIn;
    await _afterSignIn();
    notifyListeners();
  }

  Future<void> signOut() async {
    final r = tokens.refresh;
    if (r != null) {
      try {
        await api.post('/auth/logout', {'refreshToken': r});
      } catch (_) {}
    }
    _socket?.dispose();
    _socket = null;
    await tokens.clear();
    me = null;
    _convs.clear();
    messages.clear();
    staff = [];
    ringing = null;
    notifyListeners();
  }

  Future<void> refreshMe() async {
    me = Me.fromJson(Map<String, dynamic>.from(await api.get('/me') as Map));
    notifyListeners();
  }

  Future<void> _afterSignIn() async {
    _connectSocket();
    // One failing list must not undo the sign-in; each screen can reload its own data.
    await Future.wait([loadConversations(), loadCounts(), loadStaff(), _loadActiveCalls()]
        .map((f) => f.catchError((Object e) => debugPrint('Initial load failed: $e'))));
  }

  /* ───────── Live events ───────── */

  void _connectSocket() {
    _socket?.dispose();
    var connectedBefore = false;
    DateTime? lastRevokeRetry;
    final s = io.io(
      api.baseUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setPath('/socket.io')
          .setAuth({'token': tokens.access})
          .disableAutoConnect()
          .enableReconnection()
          // io.io() caches one connection per host; without this a new sign-in would reuse the
          // old socket and its old token.
          .enableForceNew()
          .build(),
    );
    s.onConnect((_) {
      socketConnected = true;
      if (connectedBefore) {
        // Back after a drop: catch up on what was missed.
        unawaited(loadConversations().catchError((Object _) {}));
        unawaited(loadCounts().catchError((Object _) {}));
      }
      connectedBefore = true;
      notifyListeners();
    });
    s.onDisconnect((_) {
      socketConnected = false;
      notifyListeners();
    });
    // The access token in the handshake expires; use the newest one when reconnecting.
    // Reconnect events are emitted by the Manager (socket.io), not by the Socket.
    s.io.on('reconnect_attempt', (_) {
      s.auth = {'token': tokens.access};
    });
    s.on('message.created', (data) {
      final m = Map<String, dynamic>.from(data as Map);
      final msg = Message.fromJson(Map<String, dynamic>.from(m['message'] as Map));
      final conv = Conversation.fromJson(Map<String, dynamic>.from(m['conversation'] as Map));
      _putConversation(conv);
      _putMessage(msg);
      if (msg.direction == 'in' && conv.id != openConversationId) {
        _notices.add('${conv.contact.name}: ${msg.body.isEmpty ? 'New message' : msg.body}');
      }
      unawaited(loadCounts());
      notifyListeners();
    });
    s.on('message.status', (data) {
      final m = Map<String, dynamic>.from(data as Map);
      final list = messages[m['conversationId']];
      if (list == null) return;
      final i = list.indexWhere((x) => x.id == m['messageId']);
      if (i >= 0) list[i] = list[i].copyWith(status: m['status'] as String?, error: m['error'] as String?);
      notifyListeners();
    });
    s.on('conversation.updated', (data) {
      _putConversation(Conversation.fromJson(Map<String, dynamic>.from((data as Map)['conversation'] as Map)));
      unawaited(loadCounts());
      notifyListeners();
    });
    s.on('conversation.assigned', (data) {
      final conv = Conversation.fromJson(Map<String, dynamic>.from((data as Map)['conversation'] as Map));
      _putConversation(conv);
      _notices.add('New chat assigned to you: ${conv.contact.name}');
      notifyListeners();
    });
    s.on('contact.updated', (data) {
      final contact = Contact.fromJson(Map<String, dynamic>.from((data as Map)['contact'] as Map));
      for (final c in _convs.values.where((c) => c.contactId == contact.id).toList()) {
        _convs[c.id] = c.copyWith(contact: contact);
      }
      notifyListeners();
    });
    s.on('presence.updated', (_) => unawaited(loadStaff()));
    s.on('call.ringing', (data) {
      ringing = RingingCall.fromJson(Map<String, dynamic>.from(data as Map));
      notifyListeners();
    });
    s.on('call.updated', (data) {
      final call = Call.fromJson(Map<String, dynamic>.from((data as Map)['call'] as Map));
      if (ringing?.call.id == call.id && !call.isRinging(me?.user.id)) ringing = null;
      // The phone's own call screen: stop ringing when it moved on; close an answered call when it ends.
      if (!call.live || (!call.isRinging(me?.user.id) && !systemAccepted.contains(call.id) && !_answering.contains(call.id))) {
        if (!call.live) systemAccepted.remove(call.id);
        unawaited(CallKit.end(call.id));
        final c = !call.live ? takeSystemCall(call.id) : null;
        if (c != null) unawaited(c.peer.close());
      }
      _callUpdates.add(call);
      notifyListeners();
    });
    s.on('call.signal', (data) {
      final m = Map<String, dynamic>.from(data as Map);
      _callSignals.add((callId: m['callId'] as String, sdpAnswer: m['sdpAnswer'] as String));
    });
    s.on('notice', (data) => _notices.add('${(data as Map)['text']}'));
    // The server sends this when the handshake token is rejected, which also happens when the
    // access token simply expired. Refresh once and reconnect before giving up.
    s.on('session.revoked', (_) async {
      final now = DateTime.now();
      final mayRetry = lastRevokeRetry == null || now.difference(lastRevokeRetry!).inSeconds > 60;
      if (mayRetry && await api.refreshTokens() && identical(_socket, s)) {
        lastRevokeRetry = now;
        s.auth = {'token': tokens.access};
        s.connect();
        return;
      }
      if (identical(_socket, s)) unawaited(signOut());
    });
    s.connect();
    _socket = s;
  }

  void _putConversation(Conversation c) {
    final visible = me!.isManager || me!.permissions['seeAllChats'] || c.contact.ownerUserId == null || c.contact.ownerUserId == me!.user.id;
    if (visible) {
      _convs[c.id] = c;
    } else {
      _convs.remove(c.id);
    }
  }

  void _putMessage(Message m) {
    final list = messages[m.conversationId];
    if (list == null) return;
    final i = list.indexWhere((x) => x.id == m.id);
    if (i >= 0) {
      list[i] = m;
    } else {
      list.add(m);
    }
  }

  /* ───────── Data ───────── */

  Future<void> loadConversations() async {
    final res = Map<String, dynamic>.from(await api.get('/conversations', {'filter': 'all', 'limit': 200}) as Map);
    final page = ApiPage.fromJson(res, Conversation.fromJson);
    _convs
      ..clear()
      ..addEntries(page.items.map((c) => MapEntry(c.id, c)));
    notifyListeners();
  }

  /// A filtered list straight from the server (unread, mine, team queue …).
  Future<List<Conversation>> fetchConversations(String filter, {String? search}) async {
    final res = Map<String, dynamic>.from(await api.get('/conversations', {'filter': filter, 'search': search, 'limit': 200}) as Map);
    return ApiPage.fromJson(res, Conversation.fromJson).items;
  }

  Future<void> loadCounts() async {
    counts = ConversationCounts.fromJson(Map<String, dynamic>.from(await api.get('/conversations/counts') as Map));
    notifyListeners();
  }

  Future<void> loadStaff() async {
    final res = await api.get('/staff') as List;
    staff = res.map((e) => StaffMember.fromJson(Map<String, dynamic>.from(e as Map))).toList();
    notifyListeners();
  }

  Future<void> _loadActiveCalls() async {
    try {
      final res = Map<String, dynamic>.from(await api.get('/calls/active') as Map);
      final list = (res['ringing'] as List? ?? []).map((e) => RingingCall.fromJson(Map<String, dynamic>.from(e as Map))).toList();
      ringing = list.isEmpty ? null : list.first;
      unawaited(_closeStaleSystemCalls());
    } catch (_) {}
  }

  void clearRinging() {
    ringing = null;
    notifyListeners();
  }

  /* ───────── One chat ───────── */

  Future<void> openConversation(String id) async {
    openConversationId = id;
    final res = Map<String, dynamic>.from(await api.get('/conversations/$id/messages', {'limit': 50}) as Map);
    final page = ApiPage.fromJson(res, Message.fromJson);
    messages[id] = page.items.reversed.toList();
    olderCursor[id] = page.nextCursor;
    final c = _convs[id];
    if (c != null && c.unreadCount > 0) {
      _convs[id] = c.copyWith(unreadCount: 0);
      unawaited(api.post('/conversations/$id/read').then((_) => loadCounts()).catchError((_) {}));
    }
    notifyListeners();
  }

  void closeConversation() => openConversationId = null;

  Future<void> loadOlder(String id) async {
    final cursor = olderCursor[id];
    if (cursor == null) return;
    final res = Map<String, dynamic>.from(await api.get('/conversations/$id/messages', {'limit': 50, 'cursor': cursor}) as Map);
    final page = ApiPage.fromJson(res, Message.fromJson);
    messages[id] = [...page.items.reversed, ...?messages[id]];
    olderCursor[id] = page.nextCursor;
    notifyListeners();
  }

  /// Load a chat that is not in the list yet (from a notification or a customer page).
  Future<Conversation> ensureConversation(String id) async {
    final c = Conversation.fromJson(Map<String, dynamic>.from(await api.get('/conversations/$id') as Map));
    _convs[c.id] = c;
    notifyListeners();
    return c;
  }

  Future<Conversation> conversationForContact(String contactId) async {
    final c = Conversation.fromJson(Map<String, dynamic>.from(await api.get('/conversations/by-contact/$contactId') as Map));
    _convs[c.id] = c;
    notifyListeners();
    return c;
  }

  /// Send text and files. Shows the bubble at once; replaces it with the server's message.
  Future<void> send(String convId, String text, {List<String> fileIds = const [], bool note = false, bool voice = false}) async {
    final pending = Message.pending(conversationId: convId, body: fileIds.isEmpty ? text : (text.isEmpty ? '📎 Sending…' : text), note: note, senderName: me?.user.name);
    messages.putIfAbsent(convId, () => []).add(pending);
    notifyListeners();
    try {
      if (note) {
        final m = Message.fromJson(Map<String, dynamic>.from(await api.post('/conversations/$convId/notes', {'text': text.isEmpty ? '(attachment)' : text, 'fileIds': fileIds}) as Map));
        messages[convId]!.removeWhere((x) => x.id == pending.id);
        _putMessage(m);
      } else {
        final list = await api.post('/conversations/$convId/messages', {'text': text, 'fileIds': fileIds, 'voice': voice}) as List;
        messages[convId]!.removeWhere((x) => x.id == pending.id);
        for (final e in list) {
          _putMessage(Message.fromJson(Map<String, dynamic>.from(e as Map)));
        }
      }
    } catch (e) {
      final list = messages[convId]!;
      final i = list.indexWhere((x) => x.id == pending.id);
      if (i >= 0) list[i] = pending.copyWith(status: 'failed', error: errorText(e));
      rethrow;
    } finally {
      notifyListeners();
    }
  }

  Future<void> sendTemplate(String convId, String templateId, List<String> variables) async {
    final m = Message.fromJson(Map<String, dynamic>.from(await api.post('/conversations/$convId/templates', {'templateId': templateId, 'variables': variables}) as Map));
    _putMessage(m);
    notifyListeners();
  }

  Future<void> sendQuickReply(String convId, String quickReplyId) async {
    final list = await api.post('/conversations/$convId/quick-replies/$quickReplyId') as List;
    for (final e in list) {
      _putMessage(Message.fromJson(Map<String, dynamic>.from(e as Map)));
    }
    notifyListeners();
  }

  Future<void> conversationAction(String convId, String action, [Object? body]) async {
    final res = action == 'state' ? await api.put('/conversations/$convId/state', body) : await api.post('/conversations/$convId/$action', body);
    if (res is Map) _putConversation(Conversation.fromJson(Map<String, dynamic>.from(res)));
    notifyListeners();
  }

  Future<void> setOwner(String contactId, String? userId, String reason) async {
    await api.put('/contacts/$contactId/owner', {'ownerUserId': userId, 'reason': reason});
    await loadConversations();
  }

  /* ───────── Status ───────── */

  Future<void> setPresence(String channel, String status, {String reason = '', int minutes = 0}) async {
    await api.put('/me/presence', {'channel': channel, 'status': status, 'reason': reason, 'plannedMinutes': minutes});
    await loadStaff();
  }

  StaffMember? get myMember {
    final id = me?.user.id;
    for (final s in staff) {
      if (s.id == id) return s;
    }
    return null;
  }

  @override
  void dispose() {
    _socket?.dispose();
    _callUpdates.close();
    _callSignals.close();
    _notices.close();
    super.dispose();
  }
}
