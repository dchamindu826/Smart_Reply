import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../state/app_state.dart';
import '../widgets/avatar.dart';

const _breakReasons = ['Tea', 'Lunch', 'Prayer', 'Meeting', 'Other'];

class MeScreen extends StatefulWidget {
  const MeScreen({super.key});

  @override
  State<MeScreen> createState() => _MeScreenState();
}

class _MeScreenState extends State<MeScreen> {
  MyDashboard? _day;
  MyBreaks? _breaks;
  Map<String, dynamic>? _perf;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = context.read<AppState>().api;
    try {
      final results = await Future.wait([api.get('/me/dashboard'), api.get('/me/breaks'), api.get('/me/performance', {'range': '7d'})]);
      if (!mounted) return;
      setState(() {
        _day = MyDashboard.fromJson(Map<String, dynamic>.from(results[0] as Map));
        _breaks = MyBreaks.fromJson(Map<String, dynamic>.from(results[1] as Map));
        _perf = Map<String, dynamic>.from(results[2] as Map);
      });
    } catch (e) {
      _toast(errorText(e));
    }
  }

  void _toast(String t) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t)));
  }

  Future<void> _changeStatus(String channel) async {
    final state = context.read<AppState>();
    final pick = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Wrap(children: [
          for (final s in ['available', 'brk', 'away', 'dnd'])
            ListTile(title: Text(statusLabels[s]!), onTap: () => Navigator.pop(ctx, s)),
        ]),
      ),
    );
    if (pick == null) return;
    var reason = '';
    var minutes = 0;
    if (pick == 'brk') {
      if (!mounted) return;
      final r = await showDialog<(String, int)>(context: context, builder: (_) => const _BreakDialog());
      if (r == null) return;
      (reason, minutes) = r;
    }
    try {
      await state.setPresence(channel, pick, reason: reason, minutes: minutes);
      await _load();
    } catch (e) {
      _toast(errorText(e));
    }
  }

  Future<void> _editProfile() async {
    final state = context.read<AppState>();
    final user = state.me!.user;
    final name = TextEditingController(text: user.name);
    final signature = TextEditingController(text: user.signature);
    // Edit a copy so Cancel leaves the signed-in user's settings untouched.
    final notify = NotifySettings.fromJson(user.notify.toJson());
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setLocal) => AlertDialog(
          title: const Text('Profile'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
              const SizedBox(height: 8),
              TextField(controller: signature, decoration: const InputDecoration(labelText: 'Signature (added to your replies)')),
              SwitchListTile(title: const Text('New chat assigned'), value: notify.newChat, onChanged: (v) => setLocal(() => notify.newChat = v)),
              SwitchListTile(title: const Text('New message'), value: notify.newMessage, onChanged: (v) => setLocal(() => notify.newMessage = v)),
              SwitchListTile(title: const Text('Missed call'), value: notify.missedCall, onChanged: (v) => setLocal(() => notify.missedCall = v)),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
          ],
        ),
      ),
    );
    if (saved != true) return;
    try {
      await state.api.patch('/me', {'name': name.text.trim(), 'signature': signature.text.trim(), 'notify': notify.toJson()});
      await state.refreshMe();
      _toast('Profile saved.');
    } catch (e) {
      _toast(errorText(e));
    }
  }

  Future<void> _changePassword() async {
    final current = TextEditingController();
    final next = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Change password'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: current, obscureText: true, decoration: const InputDecoration(labelText: 'Current password')),
          const SizedBox(height: 8),
          TextField(controller: next, obscureText: true, decoration: const InputDecoration(labelText: 'New password (8+ characters)')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Change')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await context.read<AppState>().api.post('/me/password', {'currentPassword': current.text, 'newPassword': next.text});
      _toast('Password changed. Other devices are signed out.');
    } catch (e) {
      _toast(errorText(e));
    }
  }

  Widget _stat(String label, String value) => Expanded(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700, color: Brand.green)),
              Text(label, style: const TextStyle(fontSize: 12)),
            ]),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final me = state.me!;
    final mine = state.myMember;
    final day = _day;
    final perf = _perf;
    return Scaffold(
      appBar: AppBar(title: const Text('Me')),
      body: RefreshIndicator(
        onRefresh: () async {
          await _load();
          await state.loadStaff();
        },
        child: ListView(padding: const EdgeInsets.all(12), children: [
          ListTile(
            leading: Avatar(initials: me.user.initials, color: me.user.avatarColor),
            title: Text(me.user.name, style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text('${me.user.title.isEmpty ? (me.isManager ? 'Manager' : 'Staff') : me.user.title} · ${me.company?.name ?? ''}'),
            trailing: IconButton(icon: const Icon(Icons.edit_outlined), onPressed: _editProfile),
          ),
          Card(
            child: Column(children: [
              ListTile(
                leading: const Icon(Icons.call_outlined),
                title: const Text('Calls'),
                subtitle: Text(_presenceText(mine?.call)),
                trailing: TextButton(onPressed: () => _changeStatus('call'), child: const Text('Change')),
              ),
              ListTile(
                leading: const Icon(Icons.chat_bubble_outline),
                title: const Text('Chats'),
                subtitle: Text(_presenceText(mine?.chat)),
                trailing: TextButton(onPressed: () => _changeStatus('chat'), child: const Text('Change')),
              ),
              if (_breaks != null)
                ListTile(
                  leading: const Icon(Icons.coffee_outlined),
                  title: Text('Breaks today: ${_breaks!.usedMinutes} of ${_breaks!.limitMinutes} min'),
                  subtitle: _breaks!.entries.isEmpty
                      ? null
                      : Text(_breaks!.entries.map((b) => '${b.reason} ${clock(b.startedAt)} (${b.minutes} min)').join(' · ')),
                ),
            ]),
          ),
          const Padding(padding: EdgeInsets.fromLTRB(4, 12, 4, 4), child: Text('My day', style: TextStyle(fontWeight: FontWeight.w600))),
          if (day == null)
            const LinearProgressIndicator()
          else ...[
            Row(children: [_stat('Open chats', '${day.openChats}'), _stat('Unread', '${day.unread}'), _stat('Closing soon', '${day.closingSoon}')]),
            Row(children: [_stat('Calls today', '${day.callsToday}'), _stat('Missed', '${day.callsMissed}'), _stat('Resolved', '${day.resolvedToday}')]),
          ],
          if (perf != null) ...[
            const Padding(padding: EdgeInsets.fromLTRB(4, 12, 4, 4), child: Text('Last 7 days', style: TextStyle(fontWeight: FontWeight.w600))),
            Row(children: [
              _stat('Chats handled', '${perf['chatsHandled'] ?? 0}'),
              _stat('Avg first reply', replyTime(perf['avgFirstReplySeconds'] is num ? (perf['avgFirstReplySeconds'] as num).toInt() : null)),
              _stat('Target', '${perf['targetPercent'] ?? 0}%'),
            ]),
          ],
          if (me.isManager) ...[
            const Padding(padding: EdgeInsets.fromLTRB(4, 12, 4, 4), child: Text('Team right now', style: TextStyle(fontWeight: FontWeight.w600))),
            for (final s in state.staff)
              ListTile(
                leading: Avatar(initials: s.initials, color: s.avatarColor, size: 36),
                title: Text(s.name),
                subtitle: Text('Calls: ${_presenceText(s.call)} · Chats: ${_presenceText(s.chat)}'),
                trailing: Text('${s.openChats} open'),
              ),
          ],
          const SizedBox(height: 12),
          ListTile(leading: const Icon(Icons.lock_outline), title: const Text('Change password'), onTap: _changePassword),
          ListTile(
            leading: const Icon(Icons.logout, color: Brand.danger),
            title: const Text('Sign out', style: TextStyle(color: Brand.danger)),
            onTap: () => state.signOut(),
          ),
          const SizedBox(height: 24),
          Center(child: Text('Smart Reply by LUMI AI · ${state.api.baseUrl}', style: const TextStyle(fontSize: 11, color: Colors.grey))),
        ]),
      ),
    );
  }

  String _presenceText(Presence? p) {
    if (p == null) return '—';
    final label = statusLabels[p.status] ?? p.status;
    return p.status == 'brk' && p.reason.isNotEmpty ? '$label · ${p.reason}' : label;
  }
}

class _BreakDialog extends StatefulWidget {
  const _BreakDialog();

  @override
  State<_BreakDialog> createState() => _BreakDialogState();
}

class _BreakDialogState extends State<_BreakDialog> {
  String _reason = _breakReasons.first;
  int _minutes = 15;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Take a break'),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        Wrap(spacing: 6, children: [
          for (final r in _breakReasons) ChoiceChip(label: Text(r), selected: _reason == r, onSelected: (_) => setState(() => _reason = r)),
        ]),
        const SizedBox(height: 12),
        Wrap(spacing: 6, children: [
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
