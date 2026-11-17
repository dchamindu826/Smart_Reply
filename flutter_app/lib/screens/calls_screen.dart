import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../state/app_state.dart';
import '../widgets/avatar.dart';
import 'call_screen.dart';

class CallsScreen extends StatefulWidget {
  const CallsScreen({super.key});

  @override
  State<CallsScreen> createState() => _CallsScreenState();
}

class _CallsScreenState extends State<CallsScreen> {
  static const _filters = [('all', 'All'), ('missed', 'Missed'), ('incoming', 'Incoming'), ('outgoing', 'Outgoing')];
  String _filter = 'all';
  List<Call>? _calls;
  List<ScheduledCall>? _scheduled;
  String? _error;
  StreamSubscription<Call>? _sub;

  @override
  void initState() {
    super.initState();
    _load();
    _sub = context.read<AppState>().callUpdates.listen((_) {
      if (mounted) _load();
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    final api = context.read<AppState>().api;
    try {
      final res = Map<String, dynamic>.from(await api.get('/calls', {'filter': _filter, 'limit': 100}) as Map);
      final sched = await api.get('/scheduled-calls') as List;
      if (!mounted) return;
      setState(() {
        _calls = ApiPage.fromJson(res, Call.fromJson).items;
        _scheduled = sched.map((e) => ScheduledCall.fromJson(Map<String, dynamic>.from(e as Map))).where((s) => s.status == 'pending').toList();
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
  }

  Future<void> _callBack(String contactId) async {
    final state = context.read<AppState>();
    try {
      final conv = await state.conversationForContact(contactId);
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(fullscreenDialog: true, builder: (_) => CallScreen.outgoing(conv.contact)));
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(e))));
    }
  }

  Future<void> _scheduledAction(ScheduledCall s, String action) async {
    final api = context.read<AppState>().api;
    try {
      if (action == 'done') {
        await api.post('/scheduled-calls/${s.id}/done');
      } else {
        await api.delete('/scheduled-calls/${s.id}');
      }
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(e))));
    }
  }

  IconData _icon(Call c) {
    if (c.outcome == 'missed' || c.outcome == 'rejected' || c.outcome == 'failed') return Icons.call_missed;
    return c.direction == 'in' ? Icons.call_received : Icons.call_made;
  }

  @override
  Widget build(BuildContext context) {
    final calls = _calls;
    return Scaffold(
      appBar: AppBar(title: const Text('Calls')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(children: [
          SizedBox(
            height: 52,
            child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.all(8), children: [
              for (final (k, label) in _filters)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: ChoiceChip(
                    label: Text(label),
                    selected: _filter == k,
                    onSelected: (_) {
                      setState(() => _filter = k);
                      _load();
                    },
                  ),
                ),
            ]),
          ),
          if (_error != null) Padding(padding: const EdgeInsets.all(16), child: Text(_error!)),
          if ((_scheduled ?? []).isNotEmpty) ...[
            const Padding(padding: EdgeInsets.fromLTRB(16, 8, 16, 4), child: Text('Scheduled', style: TextStyle(fontWeight: FontWeight.w600))),
            for (final s in _scheduled!)
              ListTile(
                leading: const Icon(Icons.event, color: Brand.green),
                title: Text(s.contactName),
                subtitle: Text('${DateFormat('d MMM, HH:mm').format(s.scheduledAt)}${s.note.isEmpty ? '' : ' · ${s.note}'}'),
                trailing: PopupMenuButton<String>(
                  onSelected: (a) => a == 'call' ? _callBack(s.contactId) : _scheduledAction(s, a),
                  itemBuilder: (_) => const [
                    PopupMenuItem(value: 'call', child: Text('Call now')),
                    PopupMenuItem(value: 'done', child: Text('Mark done')),
                    PopupMenuItem(value: 'cancel', child: Text('Cancel')),
                  ],
                ),
              ),
            const Divider(),
          ],
          if (calls == null && _error == null) const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
          if (calls != null && calls.isEmpty) const Padding(padding: EdgeInsets.all(32), child: Center(child: Text('No calls yet.'))),
          for (final c in calls ?? const <Call>[])
            ListTile(
              leading: Avatar(initials: c.contactInitials, color: 'a1'),
              title: Text(c.contactName),
              subtitle: Row(children: [
                Icon(_icon(c), size: 16, color: c.outcome == 'missed' ? Brand.danger : Colors.grey),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    '${listTime(c.startedAt)} ${clock(c.startedAt)}${c.durationSeconds != null ? ' · ${duration(c.durationSeconds)}' : ''}${c.handledByName != null ? ' · ${c.handledByName}' : ''}',
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ]),
              trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                if (c.recordingUrl != null)
                  IconButton(icon: const Icon(Icons.play_circle_outline), onPressed: () => launchUrl(Uri.parse(c.recordingUrl!))),
                IconButton(icon: const Icon(Icons.call, color: Brand.green), onPressed: () => _callBack(c.contactId)),
              ]),
              onTap: c.note.isEmpty && c.summary == null
                  ? null
                  : () => showDialog(
                        context: context,
                        builder: (ctx) => AlertDialog(
                          title: Text(c.contactName),
                          content: Text([if (c.note.isNotEmpty) 'Note: ${c.note}', if (c.summary != null) 'Summary: ${c.summary}'].join('\n\n')),
                        ),
                      ),
            ),
        ]),
      ),
    );
  }
}
