import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../state/app_state.dart';
import '../widgets/avatar.dart';
import '../widgets/ui.dart';
import 'chat_screen.dart';

const _filters = [
  ('all', 'All'),
  ('unread', 'Unread'),
  ('mine', 'Mine'),
  ('pool', 'Team queue'),
  ('expiring', 'Closing soon'),
  ('favorites', 'Favourites'),
  ('archived', 'Archived'),
  ('resolved', 'Resolved'),
];

class ChatsScreen extends StatefulWidget {
  const ChatsScreen({super.key});

  @override
  State<ChatsScreen> createState() => _ChatsScreenState();
}

class _ChatsScreenState extends State<ChatsScreen> {
  String _filter = 'all';
  String _search = '';
  List<Conversation>? _filtered;
  bool _loading = false;

  Future<void> _load() async {
    final state = context.read<AppState>();
    if (_filter == 'all' && _search.isEmpty) {
      setState(() => _filtered = null);
      try {
        await state.loadConversations();
      } catch (e) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(e))));
      }
      return;
    }
    setState(() => _loading = true);
    try {
      final list = await state.fetchConversations(_filter, search: _search.isEmpty ? null : _search);
      if (mounted) setState(() => _filtered = list);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(e))));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final ui = Ui.of(context);
    final list = _filtered ?? state.conversations;
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 64,
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Chats', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, letterSpacing: -.4)),
          if (state.me?.company?.name != null) Text(state.me!.company!.name, style: TextStyle(fontSize: 12, color: ui.muted, fontWeight: FontWeight.w500)),
        ]),
      ),
      body: Column(
        children: [
          Container(
            color: ui.card,
            padding: const EdgeInsets.fromLTRB(12, 4, 12, 0),
            child: TextField(
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search name, number or message', isDense: true),
              textInputAction: TextInputAction.search,
              onSubmitted: (v) {
                _search = v.trim();
                _load();
              },
            ),
          ),
          Container(
            color: ui.card,
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
              children: [
                for (final (key, label) in _filters)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: ChoiceChip(
                      label: Text(state.counts[key == 'pool' ? 'no_owner' : key] > 0 ? '$label · ${state.counts[key == 'pool' ? 'no_owner' : key]}' : label),
                      selected: _filter == key,
                      onSelected: (_) {
                        setState(() => _filter = key);
                        _load();
                      },
                    ),
                  ),
              ],
            ),
          ),
          Divider(height: 1, color: ui.rule),
          if (_loading) const LinearProgressIndicator(minHeight: 2),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async {
                await _load();
                await state.loadCounts();
              },
              child: list.isEmpty
                  ? ListView(children: [const SizedBox(height: 120), Center(child: Text('No chats here yet.', style: TextStyle(color: ui.muted)))])
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(12, 10, 12, 110),
                      itemCount: list.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (context, i) => _ChatTile(conv: state.conversation(list[i].id) ?? list[i]),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ChatTile extends StatelessWidget {
  const _ChatTile({required this.conv});
  final Conversation conv;

  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    final ui = Ui.of(context);
    final left = windowLeft(conv.windowExpiresAt);
    final soon = closingSoon(conv.windowExpiresAt);
    final unread = conv.unreadCount > 0;
    String? ownerName;
    if (state.me?.isManager == true) {
      final id = conv.contact.ownerUserId;
      ownerName = 'No owner';
      for (final s in state.staff) {
        if (s.id == id) ownerName = s.name.split(' ').first;
      }
    }
    return Panel(
      padding: const EdgeInsets.all(12),
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(conversationId: conv.id))),
      child: Row(children: [
        Stack(clipBehavior: Clip.none, children: [
          Avatar(initials: conv.contact.initials, color: conv.contact.avatarColor, size: 50),
          Positioned(
            right: -2,
            bottom: -2,
            child: Container(
              width: 20,
              height: 20,
              decoration: BoxDecoration(color: const Color(0xFF25D366), shape: BoxShape.circle, border: Border.all(color: ui.card, width: 2)),
              child: const Icon(Icons.chat, size: 10, color: Colors.white),
            ),
          ),
        ]),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(conv.contact.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
              Text(listTime(conv.lastMessageAt),
                  style: TextStyle(fontSize: 12, color: unread ? Brand.magenta : ui.muted, fontWeight: unread ? FontWeight.w800 : FontWeight.w500)),
            ]),
            const SizedBox(height: 1),
            Text(conv.lastPreview,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 13, color: unread ? ui.ink : ui.muted, fontWeight: unread ? FontWeight.w600 : FontWeight.w400)),
            const SizedBox(height: 6),
            Row(children: [
              Expanded(
                child: Wrap(spacing: 6, runSpacing: 4, children: [
                  for (final l in conv.contact.labels.take(2)) TonePill(l.name, tone: labelTone(l.color)),
                  if (conv.botActive) const TonePill('AI is replying', tone: 'violet'),
                  if (soon && left != null) TonePill('$left left', tone: 'warn'),
                  if (ownerName != null) TonePill(ownerName, tone: ownerName == 'No owner' ? 'bad' : 'grey'),
                ]),
              ),
              if (unread)
                Container(
                  constraints: const BoxConstraints(minWidth: 20),
                  height: 20,
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: Brand.pink, borderRadius: BorderRadius.circular(10)),
                  child: Text('${conv.unreadCount}', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
                ),
            ]),
          ]),
        ),
      ]),
    );
  }
}
