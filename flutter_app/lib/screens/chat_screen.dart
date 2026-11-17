import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
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
    final choice = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Wrap(children: [
          ListTile(leading: const Icon(Icons.photo_camera), title: const Text('Camera'), onTap: () => Navigator.pop(ctx, 'camera')),
          ListTile(leading: const Icon(Icons.photo), title: const Text('Photo or video'), onTap: () => Navigator.pop(ctx, 'gallery')),
          ListTile(leading: const Icon(Icons.insert_drive_file), title: const Text('Document'), onTap: () => Navigator.pop(ctx, 'doc')),
        ]),
      ),
    );
    if (choice == null) return;
    final caption = _text.text.trim();
    if (choice == 'doc') {
      final res = await FilePicker.platform.pickFiles();
      final path = res?.files.single.path;
      if (path == null) return;
      _text.clear();
      await _sendFile(File(path), caption: caption, name: res!.files.single.name);
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

  Future<void> _toggleRecord() async {
    if (_recording) {
      final path = await _recorder.stop();
      final seconds = DateTime.now().difference(_recordStart ?? DateTime.now()).inSeconds;
      if (!mounted) return;
      setState(() => _recording = false);
      if (path == null || seconds < 1) return;
      await _sendFile(File(path), voice: true, mime: 'audio/mp4', name: 'voice-${DateTime.now().millisecondsSinceEpoch}.m4a');
      return;
    }
    if (!await _recorder.hasPermission()) {
      _toast('Allow the microphone to record voice messages.');
      return;
    }
    final dir = await getTemporaryDirectory();
    await _recorder.start(const RecordConfig(encoder: AudioEncoder.aacLc, numChannels: 1), path: '${dir.path}/voice-${DateTime.now().millisecondsSinceEpoch}.m4a');
    if (!mounted) return;
    setState(() {
      _recording = true;
      _recordStart = DateTime.now();
    });
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
    final dark = Theme.of(context).brightness == Brightness.dark;
    final left = windowLeft(conv?.windowExpiresAt);

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: conv == null
            ? const Text('Chat')
            : InkWell(
                onTap: () => _menu('info'),
                child: Row(children: [
                  Avatar(initials: conv.contact.initials, color: conv.contact.avatarColor, size: 36),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(conv.contact.name, style: const TextStyle(fontSize: 16), overflow: TextOverflow.ellipsis),
                      Text(left == null ? 'Reply window closed' : 'Reply window $left', style: const TextStyle(fontSize: 12)),
                    ]),
                  ),
                ]),
              ),
        actions: [
          IconButton(icon: const Icon(Icons.call), tooltip: 'WhatsApp call', onPressed: _call),
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
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _loadError != null
                    ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_loadError!, textAlign: TextAlign.center)))
                    : ListView.builder(
                        reverse: true,
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
                        itemCount: msgs.length + (state.olderCursor[_id] != null ? 1 : 0),
                        itemBuilder: (context, i) {
                          if (i == msgs.length) {
                            return Center(
                              child: TextButton(
                                onPressed: () => state.loadOlder(_id).catchError((Object e) => _toast(errorText(e))),
                                child: const Text('Load older messages'),
                              ),
                            );
                          }
                          final m = msgs[msgs.length - 1 - i];
                          final prev = msgs.length - 2 - i >= 0 ? msgs[msgs.length - 2 - i] : null;
                          final showDay = prev == null || dayLabel(prev.createdAt) != dayLabel(m.createdAt);
                          return Column(children: [
                            if (showDay)
                              Padding(
                                padding: const EdgeInsets.symmetric(vertical: 8),
                                child: Chip(label: Text(dayLabel(m.createdAt), style: const TextStyle(fontSize: 12)), visualDensity: VisualDensity.compact),
                              ),
                            _Bubble(message: m, dark: dark),
                          ]);
                        },
                      ),
          ),
          if (conv?.contact.blocked == true)
            const Padding(padding: EdgeInsets.all(12), child: Text('This customer is blocked. Unblock them in customer info to message.'))
          else if (conv != null && !conv.windowOpen && !_note)
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: Column(children: [
                  const Text('More than 24 hours since the customer’s last message. Send an approved template.', textAlign: TextAlign.center, style: TextStyle(fontSize: 12)),
                  const SizedBox(height: 6),
                  Row(children: [
                    Expanded(child: FilledButton.icon(onPressed: _template, icon: const Icon(Icons.description_outlined), label: const Text('Send template'))),
                    const SizedBox(width: 8),
                    OutlinedButton(onPressed: () => setState(() => _note = true), child: const Text('Note')),
                  ]),
                ]),
              ),
            )
          else
            _composer(),
        ],
      ),
    );
  }

  Widget _composer() {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(6, 4, 6, 6),
        child: Column(children: [
          Row(children: [
            FilterChip(label: const Text('Internal note'), selected: _note, onSelected: (v) => setState(() => _note = v), visualDensity: VisualDensity.compact),
            const SizedBox(width: 6),
            ActionChip(label: const Text('/ Quick replies'), onPressed: _quickReplies, visualDensity: VisualDensity.compact),
            const SizedBox(width: 6),
            ActionChip(label: const Text('Template'), onPressed: _template, visualDensity: VisualDensity.compact),
          ]),
          Row(children: [
            IconButton(icon: const Icon(Icons.attach_file), onPressed: _recording ? null : _attach),
            Expanded(
              child: _recording
                  ? const Text('● Recording… tap stop to send', style: TextStyle(color: Brand.danger))
                  : TextField(
                      controller: _text,
                      minLines: 1,
                      maxLines: 5,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: InputDecoration(
                        hintText: _note ? 'Note for your team (customer can’t see it)' : 'Message',
                        isDense: true,
                        filled: _note,
                        fillColor: _note ? Brand.noteLight.withValues(alpha: 0.5) : null,
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
            if (_text.text.trim().isNotEmpty)
              IconButton(icon: const Icon(Icons.send, color: Brand.green), onPressed: _sendText)
            else
              IconButton(icon: Icon(_recording ? Icons.stop_circle : Icons.mic, color: _recording ? Brand.danger : Brand.green), onPressed: _toggleRecord),
          ]),
        ]),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message, required this.dark});
  final Message message;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    final m = message;
    if (m.isSystem) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 24),
        child: Text(m.body, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, color: Colors.grey)),
      );
    }
    final out = m.outgoing || m.isNote;
    final color = m.isNote
        ? (dark ? Brand.noteDark : Brand.noteLight)
        : m.outgoing
            ? (dark ? Brand.outDark : Brand.outLight)
            : (dark ? const Color(0xFF202C33) : Colors.white);
    return Align(
      alignment: out ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
        margin: const EdgeInsets.symmetric(vertical: 2),
        padding: const EdgeInsets.fromLTRB(10, 6, 10, 4),
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(8)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          if (m.isNote) const Text('Internal note', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
          if (m.templateName != null) Text('Template · ${m.templateName}', style: const TextStyle(fontSize: 11, color: Colors.grey)),
          if (out && !m.isNote && m.senderName != null && m.templateName == null)
            Text(m.senderName!, style: const TextStyle(fontSize: 11, color: Brand.teal)),
          for (final f in m.attachments) Padding(padding: const EdgeInsets.only(bottom: 4), child: _Attachment(file: f)),
          if (m.body.isNotEmpty) Text(m.body),
          for (final b in m.buttons)
            Container(
              margin: const EdgeInsets.only(top: 4),
              padding: const EdgeInsets.symmetric(vertical: 6),
              width: double.infinity,
              decoration: BoxDecoration(border: Border(top: BorderSide(color: Colors.grey.withValues(alpha: 0.3)))),
              child: Text(b, textAlign: TextAlign.center, style: const TextStyle(color: Brand.teal)),
            ),
          Row(mainAxisSize: MainAxisSize.min, children: [
            Text(clock(m.createdAt), style: const TextStyle(fontSize: 11, color: Colors.grey)),
            if (m.outgoing) ...[const SizedBox(width: 4), _Ticks(status: m.status, error: m.error)],
          ]),
        ]),
      ),
    );
  }
}

class _Ticks extends StatelessWidget {
  const _Ticks({required this.status, this.error});
  final String status;
  final String? error;

  @override
  Widget build(BuildContext context) {
    switch (status) {
      case 'queued':
        return const Icon(Icons.schedule, size: 14, color: Colors.grey);
      case 'sent':
        return const Icon(Icons.done, size: 15, color: Colors.grey);
      case 'delivered':
        return const Icon(Icons.done_all, size: 15, color: Colors.grey);
      case 'read':
        return const Icon(Icons.done_all, size: 15, color: Brand.blueTick);
      default:
        return Tooltip(message: error ?? 'Not delivered', child: const Icon(Icons.error_outline, size: 15, color: Brand.danger));
    }
  }
}

class _Attachment extends StatelessWidget {
  const _Attachment({required this.file});
  final FileRef file;

  @override
  Widget build(BuildContext context) {
    if (file.url.isEmpty) return const Text('📎 Uploading…');
    if (file.kind == 'image' || file.kind == 'sticker') {
      return GestureDetector(
        onTap: () => launchUrl(Uri.parse(file.url), mode: LaunchMode.externalApplication),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: CachedNetworkImage(imageUrl: file.url, width: 240, fit: BoxFit.cover, placeholder: (_, __) => const SizedBox(height: 120, child: Center(child: CircularProgressIndicator()))),
        ),
      );
    }
    if (file.kind == 'audio') return AudioBubble(url: file.url);
    return InkWell(
      onTap: () => launchUrl(Uri.parse(file.url), mode: LaunchMode.externalApplication),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(file.kind == 'video' ? Icons.movie_outlined : Icons.insert_drive_file_outlined),
        const SizedBox(width: 6),
        Flexible(child: Text('${file.name} · ${fileSize(file.sizeBytes)}', overflow: TextOverflow.ellipsis)),
      ]),
    );
  }
}
