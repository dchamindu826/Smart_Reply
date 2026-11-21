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

  Widget _round(IconData icon, String label, Color color, VoidCallback? onTap, {bool active = false, double size = 72}) {
    return Column(mainAxisSize: MainAxisSize.min, children: [
      SizedBox(
        width: size,
        height: size,
        child: RawMaterialButton(
          onPressed: onTap,
          shape: const CircleBorder(),
          fillColor: active ? Colors.white : color,
          elevation: 0,
          child: Icon(icon, color: active ? Brand.ink : Colors.white, size: size * .4),
        ),
      ),
      const SizedBox(height: 8),
      Text(label, style: const TextStyle(color: Color(0xFFDCE6F5), fontSize: 13)),
    ]);
  }

  Widget _ring(double size, double alpha) => IgnorePointer(
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white.withValues(alpha: alpha))),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final contact = widget.contact;
    final labels = contact?.labels ?? const <LabelRef>[];
    return PopScope(
      canPop: _phase == _Phase.ended,
      child: Scaffold(
        body: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Brand.deepNavy, Color(0xFF1B1060), Color(0xFF3A0D58)]),
          ),
          child: SafeArea(
            child: Column(children: [
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(color: const Color(0x2E25D366), borderRadius: BorderRadius.circular(14)),
                child: const Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.chat, size: 14, color: Color(0xFF7CF0A9)),
                  SizedBox(width: 6),
                  Text('WhatsApp voice call', style: TextStyle(color: Color(0xFF7CF0A9), fontSize: 12.5, fontWeight: FontWeight.w800)),
                ]),
              ),
              const SizedBox(height: 40),
              SizedBox(
                height: 230,
                child: Stack(alignment: Alignment.center, children: [
                  _ring(230, .08),
                  _ring(180, .14),
                  Container(
                    width: 150,
                    height: 150,
                    decoration: BoxDecoration(shape: BoxShape.circle, gradient: RadialGradient(colors: [Brand.magenta.withValues(alpha: .35), Brand.magenta.withValues(alpha: 0)])),
                  ),
                  Container(
                    decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white.withValues(alpha: .25), width: 4)),
                    child: Avatar(initials: _initials, color: 'a1', size: 108, solid: true),
                  ),
                ]),
              ),
              const SizedBox(height: 10),
              Text(_name, style: const TextStyle(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w800)),
              const SizedBox(height: 2),
              Text(_phone, style: const TextStyle(color: Color(0xFFB9C8E2), fontSize: 15)),
              if (labels.isNotEmpty) ...[
                const SizedBox(height: 10),
                Wrap(spacing: 6, children: [
                  for (final l in labels.take(3))
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(color: Colors.white.withValues(alpha: .12), borderRadius: BorderRadius.circular(10)),
                      child: Text(l.name, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
                    ),
                ]),
              ],
              const SizedBox(height: 16),
              Text(_statusText, style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w600)),
              const Spacer(),
              if (_phase == _Phase.ringing)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 28),
                  child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, crossAxisAlignment: CrossAxisAlignment.end, children: [
                    _round(Icons.call_end, 'Decline', const Color(0xFFE53935), () => _decline()),
                    _round(Icons.message_outlined, 'Message', Colors.white.withValues(alpha: .14), _declineWithMessage, size: 56),
                    _round(Icons.call, 'Answer', const Color(0xFF1FAE55), _answer),
                  ]),
                )
              else if (_phase != _Phase.ended)
                Column(children: [
                  Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
                    _round(_muted ? Icons.mic_off : Icons.mic, _muted ? 'Unmute' : 'Mute', Colors.white.withValues(alpha: .14), () {
                      setState(() => _muted = !_muted);
                      _peer?.setMuted(_muted);
                    }, active: _muted, size: 62),
                    _round(Icons.volume_up, 'Speaker', Colors.white.withValues(alpha: .14), () {
                      setState(() => _speaker = !_speaker);
                      _peer?.setSpeaker(_speaker);
                    }, active: _speaker, size: 62),
                  ]),
                  const SizedBox(height: 28),
                  _round(Icons.call_end, 'End', const Color(0xFFE53935), _hangUp),
                ]),
              const SizedBox(height: 48),
            ]),
          ),
        ),
      ),
    );
  }
}
