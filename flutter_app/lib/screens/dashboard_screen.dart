import 'dart:math' as math;

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

/// Manager home: today at a glance, chats with no owner, activity by hour.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  Map<String, dynamic>? _d;
  List<Conversation> _pool = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final state = context.read<AppState>();
    try {
      final results = await Future.wait([state.api.get('/dashboard'), state.fetchConversations('pool')]);
      if (!mounted) return;
      setState(() {
        _d = Map<String, dynamic>.from(results[0] as Map);
        _pool = (results[1] as List<Conversation>).where((c) => c.status != 'resolved').toList();
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
  }

  Future<void> _assign(Conversation c) async {
    final state = context.read<AppState>();
    final people = state.staff;
    final pick = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * .7),
          child: ListView(shrinkWrap: true, children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text('Assign ${c.contact.name} to', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
            ),
            for (final s in people)
              ListTile(
                leading: Avatar(initials: s.initials, color: s.avatarColor, size: 40),
                title: Text(s.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text('${s.openChats} open · ${statusLabels[s.chat.status] ?? s.chat.status}'),
                onTap: () => Navigator.pop(ctx, s.id),
              ),
          ]),
        ),
      ),
    );
    if (pick == null) return;
    try {
      await state.setOwner(c.contactId, pick, 'Assigned from the app');
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Assigned.')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(e))));
    }
  }

  int _n(Map<String, dynamic> m, String k) => m[k] is num ? (m[k] as num).toInt() : 0;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final ui = Ui.of(context);
    final today = _d == null ? null : Map<String, dynamic>.from(_d!['today'] as Map? ?? {});
    final hourly = _d == null ? const <Map<String, dynamic>>[] : ((_d!['hourly'] as List?) ?? []).whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(padding: EdgeInsets.zero, children: [
          HeroHeader(
            bottom: 70,
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${state.me?.company?.name ?? ''} · Manager', style: const TextStyle(fontSize: 13, color: Color(0xFFB9C8E2))),
                  const SizedBox(height: 2),
                  const Text('Today at a glance', style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: Colors.white)),
                ]),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: (state.me?.whatsappConnected ?? false) ? const Color(0x400B8A5C) : const Color(0x40BE3220),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  (state.me?.whatsappConnected ?? false) ? 'WhatsApp on' : 'WhatsApp off',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: (state.me?.whatsappConnected ?? false) ? const Color(0xFF8BF0C3) : const Color(0xFFFFB4A8)),
                ),
              ),
            ]),
          ),
          Transform.translate(
            offset: const Offset(0, -50),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: today == null
                  ? Panel(child: Text(_error ?? 'Loading…', style: TextStyle(color: ui.muted)))
                  : StatGrid(children: [
                      StatTile(label: 'Open chats', value: '${_n(today, 'chatsOpen')}', sub: _n(today, 'chatsClosingSoon') > 0 ? '${_n(today, 'chatsClosingSoon')} closing soon' : null, subTone: 'warn'),
                      StatTile(label: 'Unassigned', value: '${_n(today, 'chatsUnassigned')}', valueColor: _n(today, 'chatsUnassigned') > 0 ? Brand.danger : null),
                      StatTile(label: 'Avg first reply', value: replyTime(today['avgFirstReplySeconds'] is num ? (today['avgFirstReplySeconds'] as num).toInt() : null)),
                      StatTile(
                        label: 'Calls answered',
                        value: '${_n(today, 'callsAnswered')}/${_n(today, 'callsAnswered') + _n(today, 'callsMissed')}',
                        sub: _n(today, 'callsMissed') > 0 ? '${_n(today, 'callsMissed')} missed' : null,
                        subTone: 'bad',
                      ),
                      StatTile(label: 'Resolved', value: '${_n(today, 'resolved')}'),
                      StatTile(label: 'New customers', value: '${_n(today, 'newCustomers')}'),
                    ]),
            ),
          ),
          Transform.translate(
            offset: const Offset(0, -34),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Panel(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Row(children: [
                      const Expanded(child: Text('Needs a decision', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800))),
                      Text('${_pool.length} chats', style: TextStyle(fontSize: 12, color: ui.muted)),
                    ]),
                    if (_pool.isEmpty)
                      Padding(padding: const EdgeInsets.only(top: 10), child: Text('Every chat has an owner.', style: TextStyle(color: ui.muted)))
                    else
                      for (final c in _pool.take(4))
                        Padding(
                          padding: const EdgeInsets.only(top: 10),
                          child: Row(children: [
                            GestureDetector(
                              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(conversationId: c.id))),
                              child: Avatar(initials: c.contact.initials, color: c.contact.avatarColor, size: 38),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(c.contact.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                                Text('No owner · ${listTime(c.lastMessageAt)}', style: TextStyle(fontSize: 12, color: ui.muted)),
                              ]),
                            ),
                            FilledButton(onPressed: () => _assign(c), child: const Text('Assign')),
                          ]),
                        ),
                  ]),
                ),
                const SizedBox(height: 12),
                Panel(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Row(children: [
                      const Expanded(child: Text('Today by hour', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800))),
                      _legend(Brand.blue, 'Messages'),
                      const SizedBox(width: 10),
                      _legend(Brand.magenta, 'Calls'),
                    ]),
                    const SizedBox(height: 12),
                    _HourChart(hourly: hourly),
                  ]),
                ),
                if (today != null) ...[
                  const SizedBox(height: 12),
                  Panel(
                    child: Row(children: [
                      Expanded(child: _mini(ui, 'Messages in', '${_n(today, 'messagesIn')}')),
                      Container(width: 1, height: 36, color: ui.rule),
                      Expanded(child: _mini(ui, 'Messages out', '${_n(today, 'messagesOut')}')),
                    ]),
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

  Widget _legend(Color c, String t) => Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 8, height: 8, decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(2))),
        const SizedBox(width: 4),
        Text(t, style: const TextStyle(fontSize: 11)),
      ]);

  Widget _mini(Ui ui, String label, String value) => Column(children: [
        Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
        Text(label, style: TextStyle(fontSize: 12, color: ui.muted)),
      ]);
}

/// Stacked bars of messages and calls for the working hours of today.
class _HourChart extends StatelessWidget {
  const _HourChart({required this.hourly});
  final List<Map<String, dynamic>> hourly;

  @override
  Widget build(BuildContext context) {
    final ui = Ui.of(context);
    final byHour = {for (final h in hourly) (h['hour'] as num?)?.toInt() ?? -1: h};
    final hours = [for (var h = 8; h <= 20; h++) h];
    int v(int h, String k) => (byHour[h]?[k] as num?)?.toInt() ?? 0;
    final top = hours.map((h) => v(h, 'messages') + v(h, 'calls')).fold<int>(1, math.max);
    return Column(children: [
      SizedBox(
        height: 90,
        child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          for (final h in hours)
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                  Container(
                    height: 84 * v(h, 'calls') / top,
                    decoration: const BoxDecoration(color: Brand.magenta, borderRadius: BorderRadius.vertical(top: Radius.circular(4))),
                  ),
                  Container(
                    height: math.max(2, 84 * v(h, 'messages') / top),
                    decoration: BoxDecoration(
                      color: v(h, 'messages') == 0 ? ui.rule : Brand.blue,
                      borderRadius: BorderRadius.vertical(top: Radius.circular(v(h, 'calls') == 0 ? 4 : 0), bottom: const Radius.circular(2)),
                    ),
                  ),
                ]),
              ),
            ),
        ]),
      ),
      const SizedBox(height: 6),
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        for (final t in const ['8am', '11am', '2pm', '5pm', '8pm']) Text(t, style: TextStyle(fontSize: 10.5, color: ui.muted)),
      ]),
    ]);
  }
}
