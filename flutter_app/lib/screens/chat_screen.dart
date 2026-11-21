import 'dart:async';
import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:record/record.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../state/app_state.dart';
import '../widgets/audio_bubble.dart';
import '../widgets/avatar.dart';
import 'call_screen.dart';
import 'contact_sheet.dart';
import 'template_sheet.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.conversationId});
  final String conversationId;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _text = TextEditingController();
  final _recorder = AudioRecorder();
  bool _note = false;
  bool _recording = false;
  bool _paused = false;
  Duration _recordedBefore = Duration.zero;
  Timer? _recTimer;
  final List<double> _levels = [];
  DateTime? _recordStart;
  bool _loading = true;
  String? _loadError;
  late final AppState _state;

  String get _id => widget.conversationId;

  @override
  void initState() {
    super.initState();
    _state = context.read<AppState>();
    _open();
  }

  Future<void> _open() async {
    try {
      if (_state.conversation(_id) == null) await _state.ensureConversation(_id);
      await _state.openConversation(_id);
    } catch (e) {
      _loadError = errorText(e);
    }
    if (mounted) setState(() => _loading = false);
  }

  @override
  void dispose() {
    _state.closeConversation();
    _recTimer?.cancel();
    _recorder.dispose();
    _text.dispose();
    super.dispose();
  }

  void _toast(String text) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  Future<void> _sendText() async {
    final text = _text.text.trim();
    if (text.isEmpty) return;
    _text.clear();
    try {
      await _state.send(_id, text, note: _note);
    } catch (e) {
      _toast(errorText(e));
    }
  }

  Future<void> _sendFile(File file, {String? caption, bool voice = false, String? mime, String? name}) async {
    try {
      final id = await _state.api.upload(file, mime: mime, name: name);
      await _state.send(_id, caption ?? '', fileIds: [id], note: _note, voice: voice);
    } catch (e) {
      _toast(errorText(e));
    }
  }

  Future<void> _attach() async {
    final wa = Wa.of(context);
    Widget item(BuildContext ctx, String key, String label, Color color, IconData icon) => InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => Navigator.pop(ctx, key),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(
                width: 54,
                height: 54,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                child: Icon(icon, color: Colors.white, size: 25),
              ),
              const SizedBox(height: 8),
              Text(label, style: TextStyle(fontSize: 13, color: wa.text)),
            ]),
          ),
        );
    final choice = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      barrierColor: const Color(0x590B141A),
      showDragHandle: false,
      builder: (ctx) => SafeArea(
        child: Container(
          margin: const EdgeInsets.fromLTRB(10, 0, 10, 80),
          padding: const EdgeInsets.fromLTRB(8, 16, 8, 10),
          decoration: BoxDecoration(
            color: wa.dark ? const Color(0xFF233138) : Colors.white,
            borderRadius: BorderRadius.circular(22),
            boxShadow: const [BoxShadow(color: Color(0x40000000), blurRadius: 30, offset: Offset(0, 8))],
          ),
          child: GridView.count(
            crossAxisCount: 3,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            childAspectRatio: 1.05,
            children: [
              item(ctx, 'doc', 'Document', const Color(0xFF7F66FF), Icons.insert_drive_file),
              item(ctx, 'camera', 'Camera', const Color(0xFFFF2E74), Icons.photo_camera),
              item(ctx, 'gallery', 'Gallery', const Color(0xFFC861FA), Icons.image),
              item(ctx, 'audio', 'Audio', const Color(0xFFFF7F21), Icons.headphones),
              item(ctx, 'template', 'Template', const Color(0xFF02A698), Icons.description_outlined),
              item(ctx, 'quick', 'Quick reply', const Color(0xFF009DE2), Icons.bolt),
            ],
          ),
        ),
      ),
    );
    if (choice == null) return;
    if (choice == 'template') return _template();
    if (choice == 'quick') return _quickReplies();
    final caption = _text.text.trim();
    if (choice == 'doc' || choice == 'audio') {
      final file = await FilePicker.pickFile(type: choice == 'audio' ? FileType.audio : FileType.any);
      final path = file?.path;
      if (file == null || path == null) return;
      _text.clear();
      await _sendFile(File(path), caption: caption, name: file.name);
      return;
    }
    final picker = ImagePicker();
    final XFile? picked = choice == 'camera'
        ? await picker.pickImage(source: ImageSource.camera, imageQuality: 85, maxWidth: 2048)
        : await picker.pickMedia(imageQuality: 85, maxWidth: 2048);
    if (picked == null) return;
    _text.clear();
    await _sendFile(File(picked.path), caption: caption, name: picked.name);
  }

  Future<void> _camera() async {
    final picked = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 85, maxWidth: 2048);
    if (picked == null) return;
    final caption = _text.text.trim();
    _text.clear();
    await _sendFile(File(picked.path), caption: caption, name: picked.name);
  }

  Future<void> _toggleRecord() async {
    if (_recording) return _stopAndSend();
    if (!await _recorder.hasPermission()) {
      _toast('Allow the microphone to record voice messages.');
      return;
    }
    final dir = await getTemporaryDirectory();
    await _recorder.start(const RecordConfig(encoder: AudioEncoder.aacLc, numChannels: 1), path: '${dir.path}/voice-${DateTime.now().millisecondsSinceEpoch}.m4a');
    if (!mounted) return;
    HapticFeedback.mediumImpact();
    setState(() {
      _recording = true;
      _paused = false;
      _recordStart = DateTime.now();
      _recordedBefore = Duration.zero;
      _levels.clear();
    });
    _recTimer?.cancel();
    _recTimer = Timer.periodic(const Duration(milliseconds: 120), (_) async {
      if (!mounted || !_recording) return;
      double level = 0;
      try {
        final a = await _recorder.getAmplitude();
        level = ((a.current + 50) / 50).clamp(0.08, 1.0);
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        if (!_paused) {
          _levels.add(level);
          if (_levels.length > 40) _levels.removeAt(0);
        }
      });
    });
  }

  Duration get _recordedFor {
    if (_paused || _recordStart == null) return _recordedBefore;
    return _recordedBefore + DateTime.now().difference(_recordStart!);
  }

  Future<void> _pauseResume() async {
    if (_paused) {
      await _recorder.resume();
      setState(() {
        _paused = false;
        _recordStart = DateTime.now();
      });
    } else {
      await _recorder.pause();
      setState(() {
        _recordedBefore = _recordedFor;
        _paused = true;
      });
    }
  }

  Future<void> _cancelRecording() async {
    _recTimer?.cancel();
    await _recorder.cancel();
    if (mounted) setState(() => _recording = false);
  }

  Future<void> _stopAndSend() async {
    _recTimer?.cancel();
    final seconds = _recordedFor.inSeconds;
    final path = await _recorder.stop();
    if (!mounted) return;
    setState(() => _recording = false);
    if (path == null || seconds < 1) {
      _toast('Hold on a little longer: voice messages need at least 1 second.');
      return;
    }
    await _sendFile(File(path), voice: true, mime: 'audio/mp4', name: 'voice-${DateTime.now().millisecondsSinceEpoch}.m4a');
  }

  Future<void> _quickReplies() async {
    try {
      final list = (await _state.api.get('/quick-replies') as List).map((e) => QuickReply.fromJson(Map<String, dynamic>.from(e as Map))).toList();
      if (!mounted) return;
      final qr = await showModalBottomSheet<QuickReply>(
        context: context,
        isScrollControlled: true,
        builder: (ctx) => SafeArea(
          child: SizedBox(
            height: MediaQuery.of(ctx).size.height * 0.6,
            child: list.isEmpty
                ? const Center(child: Text('No quick replies yet.'))
                : ListView(
                    children: [
                      for (final q in list)
                        ListTile(
                          title: Text('${q.command} · ${q.title}'),
                          subtitle: Text(q.text, maxLines: 2, overflow: TextOverflow.ellipsis),
                          trailing: q.attachments.isEmpty ? null : Text('📎 ${q.attachments.length}'),
                          onTap: () => Navigator.pop(ctx, q),
                        ),
                    ],
                  ),
          ),
        ),
      );
      if (qr != null) await _state.sendQuickReply(_id, qr.id);
    } catch (e) {
      _toast(errorText(e));
    }
  }

  Future<void> _template() async {
    final conv = _state.conversation(_id);
    if (conv == null) return;
    final sent = await showTemplateSheet(context, conversationId: _id, firstName: conv.contact.name.split(' ').first);
    if (sent == true) _toast('Template sent.');
  }

  Future<void> _menu(String action) async {
    final conv = _state.conversation(_id);
    if (conv == null) return;
    try {
      switch (action) {
        case 'resolve':
          await _state.conversationAction(_id, conv.status == 'resolved' ? 'reopen' : 'resolve');
        case 'favorite':
          await _state.conversationAction(_id, 'state', {'favorite': !conv.favorite});
        case 'archive':
          await _state.conversationAction(_id, 'state', {'archived': !conv.archived});
        case 'bot':
          await _state.conversationAction(_id, 'bot', {'active': !conv.botActive});
        case 'info':
          if (mounted) await showContactSheet(context, conv.contact);
      }
    } catch (e) {
      _toast(errorText(e));
    }
  }

  void _call() {
    final conv = _state.conversation(_id);
    if (conv == null) return;
    Navigator.of(context).push(MaterialPageRoute(fullscreenDialog: true, builder: (_) => CallScreen.outgoing(conv.contact)));
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final conv = state.conversation(_id);
    final msgs = state.messages[_id] ?? const <Message>[];
    final wa = Wa.of(context);
    final left = windowLeft(conv?.windowExpiresAt);

    return Scaffold(
      backgroundColor: wa.wallpaper,
      appBar: AppBar(
        backgroundColor: wa.bar,
        foregroundColor: wa.barText,
        iconTheme: IconThemeData(color: wa.barText),
        systemOverlayStyle: wa.dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
        surfaceTintColor: Colors.transparent,
        shape: Border(bottom: BorderSide(color: wa.border)),
        actionsIconTheme: IconThemeData(color: wa.barIcon),
        titleSpacing: 0,
        title: conv == null
            ? Text('Chat', style: TextStyle(color: wa.barText))
            : InkWell(
                onTap: () => _menu('info'),
                child: Row(children: [
                  Avatar(initials: conv.contact.initials, color: conv.contact.avatarColor, size: 40),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(conv.contact.name, style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w600, color: wa.barText), overflow: TextOverflow.ellipsis),
                      Text(
                        conv.botActive ? 'AI bot is replying' : (left == null ? 'Reply window closed' : 'Reply window · $left left'),
                        style: TextStyle(fontSize: 12.5, color: left == null && conv.botActive != true ? const Color(0xFFD97706) : wa.barSub, fontWeight: FontWeight.w500),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ]),
                  ),
                ]),
              ),
        actions: [
          IconButton(icon: const Icon(Icons.call_outlined), tooltip: 'WhatsApp call', onPressed: _call),
          PopupMenuButton<String>(
            onSelected: _menu,
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'info', child: Text('Customer info')),
              PopupMenuItem(value: 'resolve', child: Text(conv?.status == 'resolved' ? 'Reopen chat' : 'Mark resolved')),
              PopupMenuItem(value: 'favorite', child: Text(conv?.favorite == true ? 'Remove favourite' : 'Add to favourites')),
              PopupMenuItem(value: 'archive', child: Text(conv?.archived == true ? 'Unarchive' : 'Archive')),
              if (state.me?.aiAddon == true) PopupMenuItem(value: 'bot', child: Text(conv?.botActive == true ? 'Take over from AI bot' : 'Hand back to AI bot')),
            ],
          ),
        ],
      ),
      body: DecoratedBox(
        decoration: BoxDecoration(
          color: wa.wallpaper,
          image: DecorationImage(image: AssetImage(wa.doodle), repeat: ImageRepeat.repeat, scale: 1.6, alignment: Alignment.topLeft),
        ),
        child: Column(
          children: [
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator(color: Wa.green))
                  : _loadError != null
                      ? Center(child: Padding(padding: const EdgeInsets.all(24), child: _systemChip(wa, _loadError!)))
                      : ListView.builder(
                          reverse: true,
                          padding: const EdgeInsets.fromLTRB(10, 10, 10, 6),
                          itemCount: msgs.length + (state.olderCursor[_id] != null ? 1 : 0),
                          itemBuilder: (context, i) {
                            if (i == msgs.length) {
                              return Center(
                                child: TextButton(
                                  onPressed: () => state.loadOlder(_id).catchError((Object e) => _toast(errorText(e))),
                                  child: const Text('Load older messages', style: TextStyle(color: Wa.green)),
                                ),
                              );
                            }
                            final m = msgs[msgs.length - 1 - i];
                            final prev = msgs.length - 2 - i >= 0 ? msgs[msgs.length - 2 - i] : null;
                            final showDay = prev == null || dayLabel(prev.createdAt) != dayLabel(m.createdAt);
                            // first of a run from the same side gets the bubble tail
                            final first = prev == null || showDay || prev.direction != m.direction;
                            return Column(children: [
                              if (showDay) Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: _dayChip(wa, dayLabel(m.createdAt))),
                              _Bubble(message: m, wa: wa, first: first),
                            ]);
                          },
                        ),
            ),
            if (conv?.contact.blocked == true)
              SafeArea(top: false, child: Padding(padding: const EdgeInsets.all(12), child: _systemChip(wa, 'This customer is blocked. Unblock them in customer info to message.')))
            else if (conv != null && !conv.windowOpen && !_note)
              SafeArea(
                top: false,
                child: Container(
                  margin: const EdgeInsets.fromLTRB(10, 0, 10, 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: wa.composer, borderRadius: BorderRadius.circular(14)),
                  child: Column(children: [
                    Text('More than 24 hours since the customer’s last message. Send an approved template.',
                        textAlign: TextAlign.center, style: TextStyle(fontSize: 12.5, color: wa.meta)),
                    const SizedBox(height: 8),
                    Row(children: [
                      Expanded(
                        child: FilledButton.icon(
                          style: FilledButton.styleFrom(backgroundColor: Wa.green, shape: const StadiumBorder()),
                          onPressed: _template,
                          icon: const Icon(Icons.description_outlined),
                          label: const Text('Send template'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton(
                        style: OutlinedButton.styleFrom(shape: const StadiumBorder(), foregroundColor: Wa.green),
                        onPressed: () => setState(() => _note = true),
                        child: const Text('Note'),
                      ),
                    ]),
                  ]),
                ),
              )
            else
              _composer(wa),
          ],
        ),
      ),
    );
  }

  Widget _dayChip(Wa wa, String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        decoration: BoxDecoration(
          color: wa.dayChip,
          borderRadius: BorderRadius.circular(8),
          boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 1, offset: Offset(0, 1))],
        ),
        child: Text(text.toUpperCase(), style: TextStyle(fontSize: 11.5, color: wa.meta, fontWeight: FontWeight.w600)),
      );

  Widget _systemChip(Wa wa, String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(color: wa.system, borderRadius: BorderRadius.circular(8)),
        child: Text(text, textAlign: TextAlign.center, style: TextStyle(fontSize: 12.5, color: wa.dark ? const Color(0xFFFFD279) : const Color(0xFF54656F))),
      );

  Widget _chip(Wa wa, String label, IconData icon, VoidCallback onTap, {bool active = false}) => Padding(
        padding: const EdgeInsets.only(right: 6),
        child: Material(
          color: active ? wa.note : wa.chip,
          shape: StadiumBorder(side: BorderSide(color: active ? wa.noteHead.withValues(alpha: .5) : wa.chipBorder)),
          child: InkWell(
            customBorder: const StadiumBorder(),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(icon, size: 15, color: active ? wa.noteHead : wa.barIcon),
                const SizedBox(width: 5),
                Text(label, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: active ? wa.noteHead : wa.text)),
              ]),
            ),
          ),
        ),
      );

  String _mmss(Duration d) => '${d.inMinutes}:${(d.inSeconds % 60).toString().padLeft(2, '0')}';

  /// WhatsApp's recording bar: red dot, timer, live waveform, then delete / pause / send.
  Widget _recordBar(Wa wa) {
    final bars = List<double>.from(_levels);
    return Container(
      decoration: BoxDecoration(color: wa.composerBar, border: Border(top: BorderSide(color: wa.border))),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 12, 8),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Row(children: [
              AnimatedOpacity(
                opacity: _paused ? .35 : 1,
                duration: const Duration(milliseconds: 300),
                child: Container(width: 10, height: 10, decoration: const BoxDecoration(color: Color(0xFFEA0038), shape: BoxShape.circle)),
              ),
              const SizedBox(width: 10),
              Text(_mmss(_recordedFor),
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500, color: wa.text, fontFeatures: const [FontFeature.tabularFigures()])),
              const SizedBox(width: 12),
              Expanded(
                child: SizedBox(
                  height: 26,
                  child: Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                    for (final l in bars)
                      Container(
                        width: 3,
                        height: 4 + 22 * l,
                        margin: const EdgeInsets.only(left: 2),
                        decoration: BoxDecoration(color: wa.wave, borderRadius: BorderRadius.circular(2)),
                      ),
                  ]),
                ),
              ),
            ]),
            const SizedBox(height: 10),
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              IconButton(
                tooltip: 'Delete recording',
                iconSize: 26,
                onPressed: _cancelRecording,
                icon: Icon(Icons.delete_outline, color: wa.barIcon),
              ),
              InkWell(
                customBorder: const CircleBorder(),
                onTap: _pauseResume,
                child: Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: const Color(0xFFEA0038), width: 2)),
                  child: Icon(_paused ? Icons.mic : Icons.pause, color: const Color(0xFFEA0038)),
                ),
              ),
              SizedBox(
                width: 52,
                height: 52,
                child: FloatingActionButton(
                  heroTag: null,
                  elevation: 1,
                  backgroundColor: Wa.green,
                  shape: const CircleBorder(),
                  tooltip: 'Send voice message',
                  onPressed: _stopAndSend,
                  child: const Icon(Icons.send, color: Colors.white),
                ),
              ),
            ]),
          ]),
        ),
      ),
    );
  }

  Widget _composer(Wa wa) {
    if (_recording) return _recordBar(wa);
    final hasText = _text.text.trim().isNotEmpty;
    return Container(
      decoration: BoxDecoration(color: wa.composerBar, border: Border(top: BorderSide(color: wa.border))),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(6, 8, 6, 6),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            SizedBox(
              height: 34,
              child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.only(left: 2, bottom: 4), children: [
                _chip(wa, _note ? 'Note on' : 'Note', Icons.sticky_note_2_outlined, () => setState(() => _note = !_note), active: _note),
                _chip(wa, 'Quick replies', Icons.bolt_outlined, _quickReplies),
                _chip(wa, 'Template', Icons.description_outlined, _template),
              ]),
            ),
            const SizedBox(height: 2),
            Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Expanded(
                child: Container(
                  constraints: const BoxConstraints(minHeight: 46),
                  decoration: BoxDecoration(color: _note ? wa.note : wa.composer, borderRadius: BorderRadius.circular(23)),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Expanded(
                      child: TextField(
                        controller: _text,
                        minLines: 1,
                        maxLines: 5,
                        textCapitalization: TextCapitalization.sentences,
                        style: TextStyle(color: wa.text, fontSize: 16),
                        cursorColor: Wa.green,
                        decoration: InputDecoration(
                          hintText: _note ? 'Note for your team (customer can’t see it)' : 'Type a message',
                          hintStyle: TextStyle(color: wa.meta),
                          filled: false,
                          border: InputBorder.none,
                          enabledBorder: InputBorder.none,
                          focusedBorder: InputBorder.none,
                          contentPadding: const EdgeInsets.fromLTRB(18, 12, 4, 12),
                        ),
                        onChanged: (v) {
                          if (v == '/') {
                            _text.clear();
                            _quickReplies();
                          }
                          setState(() {});
                        },
                      ),
                    ),
                    IconButton(
                      tooltip: 'Attach',
                      onPressed: _attach,
                      icon: Transform.rotate(angle: -0.6, child: Icon(Icons.attach_file, color: wa.barIcon)),
                    ),
                    if (!hasText)
                      IconButton(
                        tooltip: 'Camera',
                        onPressed: _camera,
                        icon: Icon(Icons.photo_camera_outlined, color: wa.barIcon),
                      ),
                  ]),
                ),
              ),
              const SizedBox(width: 6),
              SizedBox(
                width: 46,
                height: 46,
                child: FloatingActionButton(
                  heroTag: null,
                  elevation: 0,
                  backgroundColor: Wa.green,
                  shape: const CircleBorder(),
                  tooltip: hasText ? 'Send' : 'Record voice message',
                  onPressed: hasText ? _sendText : _toggleRecord,
                  child: Icon(hasText ? Icons.send : Icons.mic, color: Colors.white),
                ),
              ),
            ]),
          ]),
        ),
      ),
    );
  }
}

/// A WhatsApp-style message bubble with a tail on the first of a run.
class _Bubble extends StatelessWidget {
  const _Bubble({required this.message, required this.wa, required this.first});
  final Message message;
  final Wa wa;
  final bool first;

  @override
  Widget build(BuildContext context) {
    final m = message;
    if (m.isSystem) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 30),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(color: wa.system, borderRadius: BorderRadius.circular(8)),
          child: Text(m.body, textAlign: TextAlign.center, style: TextStyle(fontSize: 12.5, color: wa.dark ? const Color(0xFFFFD279) : const Color(0xFF54656F))),
        ),
      );
    }
    final out = m.outgoing || m.isNote;
    final color = m.isNote ? wa.note : (m.outgoing ? wa.outBubble : wa.inBubble);
    const r = Radius.circular(8);
    final radius = BorderRadius.only(
      topLeft: !out && first ? Radius.zero : r,
      topRight: out && first ? Radius.zero : r,
      bottomLeft: r,
      bottomRight: r,
    );
    final time = Row(mainAxisSize: MainAxisSize.min, children: [
      Text(clock(m.createdAt), style: TextStyle(fontSize: 11, color: wa.meta)),
      if (m.outgoing) ...[const SizedBox(width: 3), _Ticks(status: m.status, error: m.error, wa: wa)],
    ]);
    return Padding(
      padding: EdgeInsets.only(top: first ? 6 : 1.5, left: out ? 52 : 0, right: out ? 0 : 52),
      child: Align(
        alignment: out ? Alignment.centerRight : Alignment.centerLeft,
        child: CustomPaint(
          painter: first ? _TailPainter(color: color, right: out) : null,
          child: Container(
            padding: const EdgeInsets.fromLTRB(9, 6, 8, 5),
            decoration: BoxDecoration(
              color: color,
              borderRadius: radius,
              boxShadow: const [BoxShadow(color: Color(0x1A000000), blurRadius: .5, offset: Offset(0, 1))],
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              if (m.isNote)
                Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: Text('Internal note · ${m.senderName ?? 'Team'}', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: wa.dark ? const Color(0xFFFFD279) : const Color(0xFF8A5606))),
                ),
              if (m.templateName != null) Text('Template · ${m.templateName}', style: TextStyle(fontSize: 11.5, color: wa.meta)),
              if (m.outgoing && m.senderName != null && m.templateName == null)
                Text(m.senderName!, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Wa.sender)),
              for (final f in m.attachments) Padding(padding: const EdgeInsets.only(bottom: 4), child: _Attachment(file: f, wa: wa, outgoing: m.outgoing)),
              if (m.body.isNotEmpty)
                Wrap(alignment: WrapAlignment.end, crossAxisAlignment: WrapCrossAlignment.end, spacing: 8, children: [
                  Text(m.body, style: TextStyle(fontSize: 15.5, color: wa.text, height: 1.3)),
                  Padding(padding: const EdgeInsets.only(top: 4), child: time),
                ])
              else
                Align(alignment: Alignment.centerRight, child: time),
              for (final b in m.buttons)
                Container(
                  margin: const EdgeInsets.only(top: 4),
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  width: double.infinity,
                  decoration: BoxDecoration(border: Border(top: BorderSide(color: wa.meta.withValues(alpha: .25)))),
                  child: Text(b, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF027EB5), fontWeight: FontWeight.w600)),
                ),
            ]),
          ),
        ),
      ),
    );
  }
}

/// The little triangle on the first bubble of a run, like WhatsApp.
class _TailPainter extends CustomPainter {
  _TailPainter({required this.color, required this.right});
  final Color color;
  final bool right;

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..color = color;
    final path = Path();
    if (right) {
      path
        ..moveTo(size.width - 1, 0)
        ..lineTo(size.width + 8, 0)
        ..quadraticBezierTo(size.width + 3, 4, size.width - 1, 11)
        ..close();
    } else {
      path
        ..moveTo(1, 0)
        ..lineTo(-8, 0)
        ..quadraticBezierTo(-3, 4, 1, 11)
        ..close();
    }
    canvas.drawPath(path, p);
  }

  @override
  bool shouldRepaint(_TailPainter old) => old.color != color || old.right != right;
}

class _Ticks extends StatelessWidget {
  const _Ticks({required this.status, this.error, required this.wa});
  final String status;
  final String? error;
  final Wa wa;

  @override
  Widget build(BuildContext context) {
    switch (status) {
      case 'queued':
        return Icon(Icons.schedule, size: 13, color: wa.meta);
      case 'sent':
        return Icon(Icons.done, size: 16, color: wa.meta);
      case 'delivered':
        return Icon(Icons.done_all, size: 16, color: wa.meta);
      case 'read':
        return const Icon(Icons.done_all, size: 16, color: Wa.tick);
      default:
        return Tooltip(message: error ?? 'Not delivered', child: const Icon(Icons.error_outline, size: 15, color: Color(0xFFEA0038)));
    }
  }
}

class _Attachment extends StatelessWidget {
  const _Attachment({required this.file, required this.wa, this.outgoing = false});
  final FileRef file;
  final Wa wa;
  final bool outgoing;

  @override
  Widget build(BuildContext context) {
    if (file.url.isEmpty) return Text('📎 Uploading…', style: TextStyle(color: wa.meta));
    if (file.kind == 'image' || file.kind == 'sticker') {
      return GestureDetector(
        onTap: () => launchUrl(Uri.parse(file.url), mode: LaunchMode.externalApplication),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: CachedNetworkImage(
            imageUrl: file.url,
            width: 240,
            fit: BoxFit.cover,
            placeholder: (_, __) => const SizedBox(height: 140, width: 240, child: Center(child: CircularProgressIndicator(color: Wa.green))),
          ),
        ),
      );
    }
    if (file.kind == 'audio') return AudioBubble(url: file.url, wa: wa, outgoing: outgoing, voice: file.voice, seconds: file.durationSeconds);
    // Document card: coloured tile with the file type, name, then size · type, like WhatsApp.
    final ext = file.name.contains('.') ? file.name.split('.').last.toUpperCase() : (file.kind == 'video' ? 'VIDEO' : 'FILE');
    final tile = switch (ext) {
      'PDF' => const Color(0xFFE5252A),
      'DOC' || 'DOCX' => const Color(0xFF2B5797),
      'XLS' || 'XLSX' || 'CSV' => const Color(0xFF1D6F42),
      'PPT' || 'PPTX' => const Color(0xFFD24726),
      'ZIP' || 'RAR' => const Color(0xFF7F66FF),
      _ => file.kind == 'video' ? const Color(0xFFC861FA) : const Color(0xFF54656F),
    };
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () => launchUrl(Uri.parse(file.url), mode: LaunchMode.externalApplication),
      child: Container(
        width: 250,
        padding: const EdgeInsets.fromLTRB(8, 8, 10, 8),
        decoration: BoxDecoration(color: wa.docBg, borderRadius: BorderRadius.circular(8)),
        child: Row(children: [
          Container(
            width: 36,
            height: 44,
            alignment: Alignment.bottomCenter,
            padding: const EdgeInsets.only(bottom: 5),
            decoration: BoxDecoration(color: tile, borderRadius: BorderRadius.circular(5)),
            child: file.kind == 'video'
                ? const Center(child: Icon(Icons.play_arrow, color: Colors.white))
                : Text(ext.length > 4 ? ext.substring(0, 4) : ext, style: const TextStyle(color: Colors.white, fontSize: 9.5, fontWeight: FontWeight.w800)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(file.name.isEmpty ? 'Document' : file.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: wa.text, fontSize: 14.5, fontWeight: FontWeight.w500)),
              const SizedBox(height: 2),
              Text('${file.sizeBytes > 0 ? '${fileSize(file.sizeBytes)} · ' : ''}$ext', style: TextStyle(fontSize: 11.5, color: wa.meta)),
            ]),
          ),
          const SizedBox(width: 6),
          Icon(Icons.download_outlined, color: wa.barIcon, size: 22),
        ]),
      ),
    );
  }
}
