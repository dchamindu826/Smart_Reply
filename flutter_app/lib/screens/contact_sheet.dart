import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/format.dart';
import '../models/models.dart';
import '../state/app_state.dart';
import '../widgets/avatar.dart';

/// Customer details: owner, labels, call permission, history, block.
Future<void> showContactSheet(BuildContext context, Contact contact) {
  return showModalBottomSheet(context: context, isScrollControlled: true, builder: (_) => _ContactSheet(contact: contact));
}

class _ContactSheet extends StatefulWidget {
  const _ContactSheet({required this.contact});
  final Contact contact;

  @override
  State<_ContactSheet> createState() => _ContactSheetState();
}

class _ContactSheetState extends State<_ContactSheet> {
  List<OwnerHistoryEntry>? _history;

  @override
  void initState() {
    super.initState();
    final api = context.read<AppState>().api;
    api.get('/contacts/${widget.contact.id}/owner-history').then((res) {
      if (mounted) setState(() => _history = (res as List).map((e) => OwnerHistoryEntry.fromJson(Map<String, dynamic>.from(e as Map))).toList());
    }).catchError((Object _) {
      if (mounted) setState(() => _history = []);
    });
  }

  Future<void> _run(Future<void> Function() action, String done) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await action();
      messenger.showSnackBar(SnackBar(content: Text(done)));
      if (mounted) Navigator.pop(context);
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(errorText(e))));
    }
  }

  Future<void> _changeOwner() async {
    final state = context.read<AppState>();
    final me = state.me!;
    final c = widget.contact;
    final people = state.staff.where((s) => s.id != c.ownerUserId).toList();
    final picked = await showDialog<String>(
      context: context,
      builder: (ctx) => SimpleDialog(
        title: const Text('Who owns this customer?'),
        children: [
          if (c.ownerUserId != null) SimpleDialogOption(onPressed: () => Navigator.pop(ctx, '__pool'), child: const Text('Back to the team queue')),
          for (final p in people)
            if (me.isManager || p.id == me.user.id || c.ownerUserId == me.user.id)
              SimpleDialogOption(onPressed: () => Navigator.pop(ctx, p.id), child: Text('${p.name}${p.id == me.user.id ? ' (me)' : ''}')),
        ],
      ),
    );
    if (picked == null) return;
    await _run(() => state.setOwner(c.id, picked == '__pool' ? null : picked, ''), 'Owner changed.');
  }

  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    final c = widget.contact;
    final me = state.me!;
    String ownerName = 'Team queue';
    for (final s in state.staff) {
      if (s.id == c.ownerUserId) ownerName = s.name;
    }
    final canChangeOwner = me.isManager || c.ownerUserId == null || c.ownerUserId == me.user.id;
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.8,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          Center(child: Avatar(initials: c.initials, color: c.avatarColor, size: 72)),
          const SizedBox(height: 8),
          Center(child: Text(c.name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600))),
          Center(child: Text([c.phone, if (c.city.isNotEmpty) c.city].join(' · '))),
          const SizedBox(height: 12),
          if (c.labels.isNotEmpty) Wrap(spacing: 6, children: [for (final l in c.labels) Chip(label: Text(l.name))]),
          ListTile(
            leading: const Icon(Icons.person_pin_outlined),
            title: const Text('Owner'),
            subtitle: Text(ownerName),
            trailing: canChangeOwner
                ? TextButton(
                    onPressed: c.ownerUserId == null && !me.isManager
                        ? () => _run(() => state.setOwner(c.id, me.user.id, 'Taken from the team queue'), 'This customer is now yours.')
                        : _changeOwner,
                    child: Text(c.ownerUserId == null && !me.isManager ? 'Take' : 'Change'),
                  )
                : null,
          ),
          ListTile(
            leading: const Icon(Icons.call_outlined),
            title: const Text('WhatsApp call permission'),
            subtitle: Text(switch (c.permStatus) {
              'permanent' => 'Always allowed',
              'temporary' => 'Allowed until ${c.permExpiresAt == null ? '—' : listTime(c.permExpiresAt)}',
              'requested' => 'Requested',
              _ => 'Not yet',
            }),
            trailing: c.canCall
                ? null
                : TextButton(
                    onPressed: () => _run(() => state.api.post('/contacts/${c.id}/call-permission-request'), 'Permission request sent on WhatsApp.'),
                    child: const Text('Ask'),
                  ),
          ),
          ListTile(
            leading: const Icon(Icons.campaign_outlined),
            title: const Text('Marketing messages'),
            subtitle: Text(c.marketingOptIn ? 'Agreed' : 'Not agreed'),
          ),
          if (c.notes.isNotEmpty) ListTile(leading: const Icon(Icons.notes), title: const Text('Notes'), subtitle: Text(c.notes)),
          const Divider(),
          const Padding(padding: EdgeInsets.symmetric(vertical: 6), child: Text('Owner history', style: TextStyle(fontWeight: FontWeight.w600))),
          if (_history == null) const LinearProgressIndicator(),
          if (_history != null && _history!.isEmpty) const Text('No changes yet.'),
          for (final h in _history ?? const <OwnerHistoryEntry>[])
            ListTile(
              dense: true,
              title: Text(h.toName == null ? 'Back to team queue' : (h.fromName == null ? 'Assigned to ${h.toName}' : '${h.fromName} → ${h.toName}')),
              subtitle: Text('${listTime(h.at)} · ${h.actorName}${h.reason.isEmpty ? '' : ' · ${h.reason}'}'),
            ),
          const Divider(),
          TextButton.icon(
            onPressed: () => _run(
              () => c.blocked ? state.api.delete('/contacts/${c.id}/block') : state.api.post('/contacts/${c.id}/block'),
              c.blocked ? 'Unblocked.' : 'Blocked.',
            ),
            icon: Icon(Icons.block, color: c.blocked ? null : Colors.red),
            label: Text(c.blocked ? 'Unblock' : 'Block this customer', style: TextStyle(color: c.blocked ? null : Colors.red)),
          ),
        ]),
      ),
    );
  }
}
