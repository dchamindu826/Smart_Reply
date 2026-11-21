import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../state/app_state.dart';
import '../widgets/avatar.dart';
import '../widgets/ui.dart';
import 'chat_screen.dart';
import 'home_screen.dart';

const breakReasons = ['Tea', 'Lunch', 'Prayer', 'Meeting', 'Other'];

/// Staff home: my status, my numbers today, my queue and call-backs.
class MyDayScreen extends StatefulWidget {
  const MyDayScreen({super.key});

  @override
  State<MyDayScreen> createState() => _MyDayScreenState();
}

class _MyDayScreenState extends State<MyDayScreen> {
  MyDashboard? _day;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await context.read<AppState>().api.get('/me/dashboard');
      if (!mounted) return;
      setState(() {
        _day = MyDashboard.fromJson(Map<String, dynamic>.from(res as Map));
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
  }

  /// live | break | chats | away, from my call and chat presence.
  String _mode(StaffMember? m) {
    if (m == null) return 'live';
    if (m.call.status == 'brk' || m.chat.status == 'brk') return 'break';
    if (m.chat.status == 'available' && m.call.status == 'available') return 'live';
    if (m.chat.status == 'available') return 'chats';
    return 'away';
  }

  Future<void> _setMode(String mode) async {
    final state = context.read<AppState>();
    var reason = '';
    var minutes = 0;
    if (mode == 'break') {
      final r = await showDialog<(String, int)>(context: context, builder: (_) => const BreakDialog());
      if (r == null) return;
      (reason, minutes) = r;
    }
    setState(() => _busy = true);
    try {
      final (call, chat) = switch (mode) {
        'break' => ('brk', 'brk'),
        'chats' => ('away', 'available'),
        _ => ('available', 'available'),
      };
      await state.setPresence('call', call, reason: reason, minutes: minutes);
      await state.setPresence('chat', chat, reason: reason, minutes: minutes);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning,';
    if (h < 17) return 'Good afternoon,';
    return 'Good evening,';
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final me = state.me!;
    final ui = Ui.of(context);
    final mode = _mode(state.myMember);
    final day = _day;
    final queue = state.conversations.where((c) => c.status != 'resolved' && c.contact.ownerUserId == me.user.id).toList()
      ..sort((a, b) => (a.windowExpiresAt ?? DateTime(2100)).compareTo(b.windowExpiresAt ?? DateTime(2100)));

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          await _load();
          await state.loadStaff();
          await state.loadConversations();
        },
        child: ListView(padding: EdgeInsets.zero, children: [
          HeroHeader(
            bottom: 70,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Avatar(initials: me.user.initials, color: me.user.avatarColor, size: 46, solid: true),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(_greeting(), style: const TextStyle(fontSize: 13, color: Color(0xFFB9C8E2))),
                    Text(me.user.name, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800, color: Colors.white)),
                  ]),
                ),
              ]),
              const SizedBox(height: 20),
              Container(
                padding: const EdgeInsets.all(5),
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: .10), borderRadius: BorderRadius.circular(18)),
                child: Row(children: [
                  for (final (key, label) in const [('live', 'Live'), ('break', 'On break'), ('chats', 'Chats only')])
                    Expanded(
                      child: GestureDetector(
                        onTap: _busy || mode == key ? null : () => _setMode(key),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          height: 40,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(color: mode == key ? Colors.white : Colors.transparent, borderRadius: BorderRadius.circular(14)),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            if (mode == key)
                              Container(
                                width: 8,
                                height: 8,
                                margin: const EdgeInsets.only(right: 6),
                                decoration: BoxDecoration(shape: BoxShape.circle, color: key == 'break' ? Brand.warn : Brand.ok),
                              ),
                            Text(label,
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: mode == key ? FontWeight.w800 : FontWeight.w600,
                                  color: mode == key ? (key == 'break' ? Brand.warn : Brand.ok) : const Color(0xFFDCE6F5),
                                )),
                          ]),
                        ),
                      ),
                    ),
                ]),
              ),
            ]),
          ),
          Transform.translate(
            offset: const Offset(0, -52),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: day == null
                  ? Panel(child: Text(_error ?? 'Loading your day…', style: TextStyle(color: ui.muted)))
                  : StatGrid(children: [
                      StatTile(label: 'Open chats', value: '${day.openChats}', sub: day.closingSoon > 0 ? '${day.closingSoon} closing in under 2h' : null, subTone: 'warn'),
                      StatTile(label: 'Resolved today', value: '${day.resolvedToday}', sub: day.targetPercent > 0 ? '${day.targetPercent}% of target' : null),
                      StatTile(label: 'First reply today', value: replyTime(day.avgFirstReplySeconds)),
                      StatTile(label: 'Calls today', value: '${day.callsToday}', sub: day.callsMissed > 0 ? '${day.callsMissed} missed' : null, subTone: 'bad'),
                    ]),
            ),
          ),
          Transform.translate(
            offset: const Offset(0, -34),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                SectionTitle('My queue', trailing: TextButton(onPressed: () => HomeTabs.go.value = HomeTabs.chats, child: const Text('See all'))),
                if (queue.isEmpty)
                  Panel(child: Text('No customers waiting for you.', style: TextStyle(color: ui.muted)))
                else
                  Panel(
                    padding: EdgeInsets.zero,
                    child: Column(children: [
                      for (var i = 0; i < queue.length && i < 5; i++) ...[
                        if (i > 0) Divider(height: 1, color: ui.rule),
                        _QueueRow(conv: queue[i]),
                      ],
                    ]),
                  ),
                if (day != null && day.scheduledCalls.isNotEmpty) ...[
                  const SizedBox(height: 18),
                  const SectionTitle('Scheduled calls today'),
                  for (final s in day.scheduledCalls)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Panel(
                        child: Row(children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(color: ui.tone('blue').$1, borderRadius: BorderRadius.circular(14)),
                            child: Icon(Icons.event_outlined, color: ui.tone('blue').$2, size: 20),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text('Call back · ${s.contactName}', style: const TextStyle(fontWeight: FontWeight.w700)),
                              Text('${DateFormat('h:mm a').format(s.scheduledAt)}${s.note.isEmpty ? '' : ' · ${s.note}'}', style: TextStyle(fontSize: 12.5, color: ui.muted)),
                            ]),
                          ),
                        ]),
                      ),
                    ),
                ],
              ]),
            ),
          ),
          dockSpace,
        ]),
      ),
    );
  }
}

class _QueueRow extends StatelessWidget {
  const _QueueRow({required this.conv});
  final Conversation conv;

  @override
  Widget build(BuildContext context) {
    final ui = Ui.of(context);
    final left = windowLeft(conv.windowExpiresAt);
    return InkWell(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(conversationId: conv.id))),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(children: [
          Avatar(initials: conv.contact.initials, color: conv.contact.avatarColor, size: 40),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(conv.contact.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
              Text(conv.lastPreview, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: ui.muted)),
            ]),
          ),
          const SizedBox(width: 8),
          TonePill(left == null ? 'Closed' : '$left left', tone: left == null ? 'grey' : (closingSoon(conv.windowExpiresAt) ? 'warn' : 'ok')),
        ]),
      ),
    );
  }
}

/// Pick a break reason and length.
class BreakDialog extends StatefulWidget {
  const BreakDialog({super.key});

  @override
  State<BreakDialog> createState() => _BreakDialogState();
}

class _BreakDialogState extends State<BreakDialog> {
  String _reason = breakReasons.first;
  int _minutes = 15;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Take a break'),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final r in breakReasons) ChoiceChip(label: Text(r), selected: _reason == r, onSelected: (_) => setState(() => _reason = r)),
        ]),
        const SizedBox(height: 14),
        Wrap(spacing: 6, runSpacing: 6, children: [
          for (final m in [10, 15, 30, 45, 60]) ChoiceChip(label: Text('$m min'), selected: _minutes == m, onSelected: (_) => setState(() => _minutes = m)),
        ]),
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(context, (_reason, _minutes)), child: const Text('Start break')),
      ],
    );
  }
}
