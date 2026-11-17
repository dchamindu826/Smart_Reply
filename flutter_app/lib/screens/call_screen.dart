import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../core/webrtc.dart';
import '../models/models.dart';
import '../state/app_state.dart';
import '../widgets/avatar.dart';

/// Full-screen WhatsApp call: incoming (answer / decline) or outgoing, then in-call controls.
class CallScreen extends StatefulWidget {
  const CallScreen._({this.ringing, this.contact});
  factory CallScreen.incoming(RingingCall ringing) => CallScreen._(ringing: ringing);
  factory CallScreen.outgoing(Contact contact) => CallScreen._(contact: contact);

  final RingingCall? ringing;
  final Contact? contact;

  @override
  State<CallScreen> createState() => _CallScreenState();
}

enum _Phase { ringing, connecting, calling, live, ended }

class _CallScreenState extends State<CallScreen> {
  late final AppState _state;
  CallPeer? _peer;
  String? _callId;
  _Phase _phase = _Phase.ringing;
  bool _muted = false;
  bool _speaker = false;
  DateTime? _startedAt;
  Timer? _ticker;
  String? _error;
  StreamSubscription<Call>? _updates;
  StreamSubscription<({String callId, String sdpAnswer})>? _signals;

  bool get _incoming => widget.ringing != null;
  String get _name => widget.ringing?.call.contactName ?? widget.contact?.name ?? 'Customer';
  String get _initials => widget.ringing?.call.contactInitials ?? widget.contact?.initials ?? '?';
  String get _phone => widget.ringing?.call.contactPhone ?? widget.contact?.phone ?? '';

  @override
  void initState() {
    super.initState();
    _state = context.read<AppState>();
    _callId = widget.ringing?.call.id;
    _updates = _state.callUpdates.listen(_onCallUpdate);
    _signals = _state.callSignals.listen((s) async {
      if (s.callId != _callId || _peer == null) return;
      try {
        await _peer!.applyAnswer(s.sdpAnswer);
      } catch (e) {
        _fail(e);
      }
    });
    if (!_incoming) {
      _phase = _Phase.calling;
      _dial();
    }
  }

  void _onCallUpdate(Call call) {
    if (call.id != _callId || !mounted) return;
    if (_incoming && _phase == _Phase.ringing) {
      // Not answered here yet: stop ringing when a colleague took it, it ended, or it moved on.
      if (!call.isRinging(_state.me?.user.id)) {
        _end(
          label: call.outcome == 'ongoing'
              ? 'Answered by ${call.handledByName ?? 'a colleague'}'
              : call.outcome == 'missed'
                  ? 'Missed call'
                  : 'Call ended',
        );
      }
      return;
    }
    if (call.outcome == 'ongoing') {
      if (_phase != _Phase.live) _goLive();
    } else if (call.outcome != 'ringing') {
      _end(remote: true, label: call.outcome == 'missed' ? 'No answer' : 'Call ended');
    }
  }

  void _goLive() {
    if (!mounted || _phase == _Phase.ended) return;
    setState(() {
      _phase = _Phase.live;
      _startedAt = DateTime.now();
    });
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  void _fail(Object e) {
    if (!mounted) return;
    setState(() => _error = errorText(e) == 'Something went wrong. Try again.' ? '$e' : errorText(e));
    _end(label: 'Call failed');
  }

  Future<void> _dial() async {
    final contact = widget.contact!;
    try {
      final (peer, sdpOffer) = await CallPeer.offer();
      if (!mounted) {
        await peer.close();
        return;
      }
      _peer = peer;
      final call = Call.fromJson(Map<String, dynamic>.from(await _state.api.post('/calls', {'contactId': contact.id, 'sdpOffer': sdpOffer}) as Map));
      _callId = call.id;
    } catch (e) {
      if (e is ApiException && e.code == 'CALL_PERMISSION_MISSING' && mounted) {
        final ask = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Ask to allow calls?'),
            content: Text('${contact.name} has not allowed WhatsApp calls from your business yet. Send them a request?'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Not now')),
              FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Send request')),
            ],
          ),
        );
        if (ask == true) {
          try {
            await _state.api.post('/contacts/${contact.id}/call-permission-request');
          } catch (err) {
            _error = errorText(err);
          }
        }
      }
      _fail(e);
    }
  }

  Future<void> _answer() async {
    final r = widget.ringing!;
    if (r.sdpOffer == null) {
      _fail(ApiException(0, 'NO_OFFER', 'This call has no audio offer. Answer it on the phone.'));
      return;
    }
    setState(() => _phase = _Phase.connecting);
    try {
      final (peer, sdpAnswer) = await CallPeer.answer(r.sdpOffer!);
      if (!mounted || _phase == _Phase.ended) {
        await peer.close();
        return;
      }
      _peer = peer;
      await _state.api.post('/calls/${r.call.id}/answer', {'sdpAnswer': sdpAnswer});
      _state.clearRinging();
      _goLive();
    } catch (e) {
      _fail(e);
    }
  }

  Future<void> _decline({String? message}) async {
    try {
      await _state.api.post('/calls/${widget.ringing!.call.id}/decline', message == null ? {} : {'messageText': message});
    } catch (_) {}
    _state.clearRinging();
    _end(label: 'Declined');
  }

  Future<void> _declineWithMessage() async {
    final text = await showDialog<String>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('Decline with a message'),
        children: [
          for (final t in ['Sorry, I can’t talk now. I will call you back soon.', 'Please send your question here on WhatsApp.', 'I’m in a meeting. Calling you back in 10 minutes.'])
            SimpleDialogOption(onPressed: () => Navigator.pop(ctx, t), child: Text(t)),
        ],
      ),
    );
    if (text != null) await _decline(message: text);
  }

  Future<void> _hangUp() async {
    final id = _callId;
    if (id != null) {
      try {
        await _state.api.post('/calls/$id/hangup');
      } catch (_) {}
    }
    _end(label: 'Call ended');
  }

  void _end({bool remote = false, required String label}) {
    _ticker?.cancel();
    _peer?.close();
    _peer = null;
    if (!mounted || _phase == _Phase.ended) return;
    setState(() {
      _endLabel = remote && _phase == _Phase.calling ? 'No answer' : label;
      _phase = _Phase.ended;
    });
    Future.delayed(const Duration(milliseconds: 1500), () {
      if (mounted) Navigator.of(context).maybePop();
    });
  }

  String _endLabel = '';

  @override
  void dispose() {
    _ticker?.cancel();
    _updates?.cancel();
    _signals?.cancel();
    _peer?.close();
    super.dispose();
  }

  String get _statusText {
    switch (_phase) {
      case _Phase.ringing:
        return 'Incoming WhatsApp call';
      case _Phase.connecting:
        return 'Connecting…';
      case _Phase.calling:
        return 'Calling on WhatsApp…';
      case _Phase.live:
        return duration(DateTime.now().difference(_startedAt ?? DateTime.now()).inSeconds);
      case _Phase.ended:
        return _error ?? _endLabel;
    }
  }

  Widget _round(IconData icon, String label, Color color, VoidCallback? onTap, {bool active = false}) {
    return Column(mainAxisSize: MainAxisSize.min, children: [
      RawMaterialButton(
        onPressed: onTap,
        shape: const CircleBorder(),
        fillColor: active ? Colors.white : color,
        padding: const EdgeInsets.all(18),
        child: Icon(icon, color: active ? Colors.black87 : Colors.white, size: 28),
      ),
      const SizedBox(height: 6),
      Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12)),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _phase == _Phase.ended,
      child: Scaffold(
        backgroundColor: Brand.dark,
        body: SafeArea(
          child: Column(children: [
            const SizedBox(height: 48),
            Avatar(initials: _initials, color: 'a2', size: 104),
            const SizedBox(height: 16),
            Text(_name, style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w600)),
            const SizedBox(height: 4),
            Text(_phone, style: const TextStyle(color: Colors.white70)),
            const SizedBox(height: 12),
            Text(_statusText, style: const TextStyle(color: Colors.white, fontSize: 16)),
            const Spacer(),
            if (_phase == _Phase.ringing)
              Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
                _round(Icons.call_end, 'Decline', Brand.danger, () => _decline()),
                _round(Icons.message_outlined, 'Message', Colors.blueGrey, _declineWithMessage),
                _round(Icons.call, 'Answer', Brand.green, _answer),
              ])
            else if (_phase != _Phase.ended)
              Column(children: [
                Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
                  _round(_muted ? Icons.mic_off : Icons.mic, _muted ? 'Unmute' : 'Mute', Colors.white24, () {
                    setState(() => _muted = !_muted);
                    _peer?.setMuted(_muted);
                  }, active: _muted),
                  _round(Icons.volume_up, 'Speaker', Colors.white24, () {
                    setState(() => _speaker = !_speaker);
                    _peer?.setSpeaker(_speaker);
                  }, active: _speaker),
                ]),
                const SizedBox(height: 28),
                _round(Icons.call_end, 'End', Brand.danger, _hangUp),
              ]),
            const SizedBox(height: 48),
          ]),
        ),
      ),
    );
  }
}
