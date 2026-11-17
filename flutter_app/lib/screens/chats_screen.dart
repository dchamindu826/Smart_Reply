import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../state/app_state.dart';
import '../widgets/avatar.dart';
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
    final list = _filtered ?? state.conversations;
    return Scaffold(
      appBar: AppBar(title: Text(state.me?.company?.name ?? 'Chats')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
            child: TextField(
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search name, number or message', isDense: true),
              onSubmitted: (v) {
                _search = v.trim();
                _load();
              },
            ),
          ),
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              children: [
                for (final (key, label) in _filters)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: ChoiceChip(
                      label: Text(state.counts[key == 'pool' ? 'no_owner' : key] > 0 ? '$label ${state.counts[key == 'pool' ? 'no_owner' : key]}' : label),
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
          if (_loading) const LinearProgressIndicator(minHeight: 2),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async {
                await _load();
                await state.loadCounts();
              },
              child: list.isEmpty
                  ? ListView(children: const [SizedBox(height: 120), Center(child: Text('No chats here yet.'))])
                  : ListView.separated(
                      itemCount: list.length,
                      separatorBuilder: (_, __) => const Divider(height: 1, indent: 76),
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
    final left = windowLeft(conv.windowExpiresAt);
    final soon = closingSoon(conv.windowExpiresAt);
    String? ownerName;
    if (state.me?.isManager == true) {
      final id = conv.contact.ownerUserId;
      ownerName = 'Team queue';
      for (final s in state.staff) {
        if (s.id == id) ownerName = s.name.split(' ').first;
      }
    }
    return ListTile(
      leading: Avatar(initials: conv.contact.initials, color: conv.contact.avatarColor),
      title: Row(
        children: [
          Expanded(child: Text(conv.contact.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600))),
          Text(listTime(conv.lastMessageAt), style: TextStyle(fontSize: 12, color: conv.unreadCount > 0 ? Brand.green : Colors.grey)),
        ],
      ),
      subtitle: Row(
        children: [
          Expanded(child: Text(conv.lastPreview, maxLines: 1, overflow: TextOverflow.ellipsis)),
          if (soon && left != null)
            Padding(
              padding: const EdgeInsets.only(left: 6),
              child: Text('⏱ $left', style: const TextStyle(color: Colors.orange, fontSize: 12)),
            ),
          if (ownerName != null)
            Padding(
              padding: const EdgeInsets.only(left: 6),
              child: Text(ownerName, style: const TextStyle(fontSize: 11, color: Colors.grey)),
            ),
          if (conv.unreadCount > 0)
            Container(
              margin: const EdgeInsets.only(left: 6),
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(color: Brand.green, borderRadius: BorderRadius.circular(10)),
              child: Text('${conv.unreadCount}', style: const TextStyle(color: Colors.white, fontSize: 12)),
            ),
        ],
      ),
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(conversationId: conv.id))),
    );
  }
}
