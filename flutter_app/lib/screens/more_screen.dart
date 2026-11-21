import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/appearance.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../state/app_state.dart';
import '../widgets/avatar.dart';
import '../widgets/ui.dart';
import 'customers_screen.dart';
import 'my_day_screen.dart';

/// Profile, everything that is not a tab, appearance and sign out.
class MoreScreen extends StatefulWidget {
  const MoreScreen({super.key});

  @override
  State<MoreScreen> createState() => _MoreScreenState();
}

class _MoreScreenState extends State<MoreScreen> {
  Map<String, dynamic>? _ai;
  Map<String, dynamic>? _perf;
  MyBreaks? _breaks;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final state = context.read<AppState>();
    final api = state.api;
    try {
      final perf = await api.get('/me/performance', {'range': '7d'});
      final breaks = await api.get('/me/breaks');
      if (mounted) {
        setState(() {
          _perf = Map<String, dynamic>.from(perf as Map);
          _breaks = MyBreaks.fromJson(Map<String, dynamic>.from(breaks as Map));
        });
      }
    } catch (_) {}
    if (state.me?.aiAddon == true) {
      try {
        final ai = await api.get('/ai/status');
        if (mounted) setState(() => _ai = Map<String, dynamic>.from(ai as Map));
      } catch (_) {}
    }
  }

  void _toast(String t) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t)));
  }

  Future<void> _openWeb() async {
    final url = context.read<AppState>().api.baseUrl;
    await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  }

  void _push(Widget w) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => w));

  Future<void> _changeStatus(String channel) async {
    final state = context.read<AppState>();
    final pick = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Wrap(children: [
          for (final s in ['available', 'brk', 'away', 'dnd']) ListTile(title: Text(statusLabels[s]!), onTap: () => Navigator.pop(ctx, s)),
        ]),
      ),
    );
    if (pick == null || !mounted) return;
    var reason = '';
    var minutes = 0;
    if (pick == 'brk') {
      final r = await showDialog<(String, int)>(context: context, builder: (_) => const BreakDialog());
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
              const SizedBox(height: 10),
              TextField(controller: signature, decoration: const InputDecoration(labelText: 'Signature (added to your replies)')),
              SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('New chat assigned'), value: notify.newChat, onChanged: (v) => setLocal(() => notify.newChat = v)),
              SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('New message'), value: notify.newMessage, onChanged: (v) => setLocal(() => notify.newMessage = v)),
              SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Missed call'), value: notify.missedCall, onChanged: (v) => setLocal(() => notify.missedCall = v)),
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
          const SizedBox(height: 10),
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

  String _presence(Presence? p) {
    if (p == null) return '—';
    final label = statusLabels[p.status] ?? p.status;
    return p.status == 'brk' && p.reason.isNotEmpty ? '$label · ${p.reason}' : label;
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final me = state.me!;
    final ui = Ui.of(context);
    final manager = me.isManager;
    final mine = state.myMember;

    final tiles = <(IconData, String, String, VoidCallback)>[
      if (manager) (Icons.people_outline, 'Customers', 'blue', () => _push(const CustomersScreen())),
      (Icons.bolt_outlined, 'Quick replies', 'warn', () => _push(const _QuickRepliesScreen())),
      (Icons.description_outlined, 'Templates', 'blue', () => _push(const _TemplatesScreen())),
      (Icons.sell_outlined, 'Labels', 'pink', _openWeb),
      (Icons.event_available_outlined, 'Bookings', 'ok', _openWeb),
      (Icons.photo_library_outlined, 'Media', 'ok', _openWeb),
      if (manager) (Icons.campaign_outlined, 'Broadcasts', 'pink', _openWeb),
      if (manager) (Icons.inventory_2_outlined, 'Catalog', 'blue', _openWeb),
      if (manager) (Icons.bar_chart_rounded, 'Reports', 'violet', _openWeb),
    ];

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          await _load();
          await state.loadStaff();
        },
        child: ListView(padding: EdgeInsets.zero, children: [
          HeroHeader(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Avatar(initials: me.user.initials, color: me.user.avatarColor, size: 52, solid: true),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(me.user.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.white)),
                    Text('${me.user.title.isEmpty ? (manager ? 'Manager' : 'Staff') : me.user.title} · ${me.company?.name ?? ''}',
                        style: const TextStyle(fontSize: 12.5, color: Color(0xFFB9C8E2))),
                  ]),
                ),
                IconButton(onPressed: _editProfile, tooltip: 'Edit profile', icon: const Icon(Icons.edit_outlined, color: Colors.white)),
              ]),
              if (me.aiAddon) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: Colors.white.withValues(alpha: .10), borderRadius: BorderRadius.circular(18)),
                  child: Row(children: [
                    Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(gradient: const LinearGradient(colors: [Brand.blue, Brand.magenta]), borderRadius: BorderRadius.circular(12)),
                      child: const Icon(Icons.auto_awesome, color: Colors.white, size: 18),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        const Text('AI bot', style: TextStyle(fontWeight: FontWeight.w800, color: Colors.white)),
                        Text(
                          _ai == null ? 'Answers chats and calls for you' : '${_ai!['repliesThisMonth'] ?? 0} replies this month',
                          style: const TextStyle(fontSize: 12, color: Color(0xFFB9C8E2)),
                        ),
                      ]),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: _ai?['status'] == 'active' ? const Color(0x401FAE55) : Colors.white.withValues(alpha: .14),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        _ai?['status'] == 'active' ? 'Active' : '${_ai?['status'] ?? '…'}'.replaceFirstMapped(RegExp('^.'), (m) => m[0]!.toUpperCase()),
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: _ai?['status'] == 'active' ? const Color(0xFF8BF0C3) : Colors.white),
                      ),
                    ),
                  ]),
                ),
              ],
            ]),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              _label(ui, 'My status'),
              Panel(
                padding: EdgeInsets.zero,
                child: Column(children: [
                  _row(ui, Icons.call_outlined, 'Calls', trailing: Text(_presence(mine?.call), style: TextStyle(color: ui.muted)), onTap: () => _changeStatus('call')),
                  Divider(height: 1, indent: 56, color: ui.rule),
                  _row(ui, Icons.chat_bubble_outline, 'Chats', trailing: Text(_presence(mine?.chat), style: TextStyle(color: ui.muted)), onTap: () => _changeStatus('chat')),
                  if (_breaks != null) ...[
                    Divider(height: 1, indent: 56, color: ui.rule),
                    _row(ui, Icons.coffee_outlined, 'Breaks today', trailing: Text('${_breaks!.usedMinutes} of ${_breaks!.limitMinutes} min', style: TextStyle(color: ui.muted))),
                  ],
                ]),
              ),
              if (_perf != null) ...[
                const SizedBox(height: 16),
                _label(ui, 'My last 7 days'),
                Panel(
                  child: Row(children: [
                    _mini(ui, '${_perf!['chatsHandled'] ?? 0}', 'Chats'),
                    _mini(ui, replyTime(_perf!['avgFirstReplySeconds'] is num ? (_perf!['avgFirstReplySeconds'] as num).toInt() : null), 'Avg reply'),
                    _mini(ui, '${_perf!['targetPercent'] ?? 0}%', 'Target'),
                  ]),
                ),
              ],
              const SizedBox(height: 16),
              _label(ui, manager ? 'Inbox, WhatsApp & media' : 'Tools'),
              GridView.count(
                crossAxisCount: 3,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                childAspectRatio: 1.05,
                children: [
                  for (final (icon, label, tone, onTap) in tiles)
                    Panel(
                      onTap: onTap,
                      padding: const EdgeInsets.all(12),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                        Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(color: ui.tone(tone).$1, borderRadius: BorderRadius.circular(12)),
                          child: Icon(icon, size: 19, color: ui.tone(tone).$2),
                        ),
                        Text(label, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5)),
                      ]),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              _label(ui, 'Settings'),
              Panel(
                padding: EdgeInsets.zero,
                child: Column(children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [Icon(Icons.contrast_rounded, color: ui.muted), const SizedBox(width: 16), const Text('Appearance', style: TextStyle(fontWeight: FontWeight.w600))]),
                      const SizedBox(height: 10),
                      ValueListenableBuilder<ThemeMode>(
                        valueListenable: Appearance.mode,
                        builder: (context, mode, _) => SizedBox(
                          width: double.infinity,
                          child: SegmentedButton<ThemeMode>(
                            showSelectedIcon: false,
                            segments: const [
                              ButtonSegment(value: ThemeMode.system, icon: Icon(Icons.phone_android, size: 18), label: Text('Phone')),
                              ButtonSegment(value: ThemeMode.light, icon: Icon(Icons.light_mode_outlined, size: 18), label: Text('Light')),
                              ButtonSegment(value: ThemeMode.dark, icon: Icon(Icons.dark_mode_outlined, size: 18), label: Text('Dark')),
                            ],
                            selected: {mode},
                            onSelectionChanged: (v) => Appearance.set(v.first),
                          ),
                        ),
                      ),
                    ]),
                  ),
                  Divider(height: 1, indent: 56, color: ui.rule),
                  if (manager) ...[
                    _row(ui, Icons.tune, 'Business & call settings', trailing: const TonePill('Opens web', tone: 'grey'), onTap: _openWeb),
                    Divider(height: 1, indent: 56, color: ui.rule),
                  ],
                  _row(ui, Icons.lock_outline, 'Change password', onTap: _changePassword),
                  Divider(height: 1, indent: 56, color: ui.rule),
                  _row(ui, Icons.logout, 'Sign out', color: Brand.danger, onTap: () => state.signOut()),
                ]),
              ),
              const SizedBox(height: 18),
              Center(child: Text('Smart Reply by LUMI AI · ${state.api.baseUrl}', style: TextStyle(fontSize: 11, color: ui.muted))),
              dockSpace,
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _label(Ui ui, String t) => Padding(
        padding: const EdgeInsets.only(left: 4, bottom: 8),
        child: Text(t.toUpperCase(), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: .8, color: ui.muted)),
      );

  Widget _mini(Ui ui, String value, String label) => Expanded(
        child: Column(children: [
          Text(value, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
          Text(label, style: TextStyle(fontSize: 12, color: ui.muted)),
        ]),
      );

  Widget _row(Ui ui, IconData icon, String title, {Widget? trailing, VoidCallback? onTap, Color? color}) => ListTile(
        leading: Icon(icon, color: color ?? ui.muted),
        title: Text(title, style: TextStyle(fontWeight: FontWeight.w600, color: color)),
        trailing: trailing ?? (onTap == null ? null : Icon(Icons.chevron_right, color: ui.muted)),
        onTap: onTap,
      );
}

/// Read-only list of the company's quick replies (type "/" in a chat to send one).
class _QuickRepliesScreen extends StatelessWidget {
  const _QuickRepliesScreen();

  @override
  Widget build(BuildContext context) {
    final api = context.read<AppState>().api;
    final ui = Ui.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Quick replies')),
      body: FutureBuilder<dynamic>(
        future: api.get('/quick-replies'),
        builder: (context, snap) {
          if (snap.hasError) return Center(child: Text(errorText(snap.error!)));
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          final list = (snap.data as List).map((e) => QuickReply.fromJson(Map<String, dynamic>.from(e as Map))).toList();
          if (list.isEmpty) return Center(child: Text('No quick replies yet.', style: TextStyle(color: ui.muted)));
          return ListView.separated(
            padding: const EdgeInsets.all(12),
            itemCount: list.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (_, i) => Panel(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [TonePill(list[i].command, tone: 'warn'), const SizedBox(width: 8), Expanded(child: Text(list[i].title, style: const TextStyle(fontWeight: FontWeight.w700)))]),
                const SizedBox(height: 6),
                Text(list[i].text, style: TextStyle(color: ui.muted)),
              ]),
            ),
          );
        },
      ),
    );
  }
}

/// The company's WhatsApp templates and their approval state.
class _TemplatesScreen extends StatelessWidget {
  const _TemplatesScreen();

  @override
  Widget build(BuildContext context) {
    final api = context.read<AppState>().api;
    final ui = Ui.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Message templates')),
      body: FutureBuilder<dynamic>(
        future: api.get('/templates'),
        builder: (context, snap) {
          if (snap.hasError) return Center(child: Text(errorText(snap.error!)));
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          final raw = snap.data;
          final items = raw is Map ? (raw['items'] as List? ?? []) : (raw as List);
          final list = items.map((e) => Template.fromJson(Map<String, dynamic>.from(e as Map))).toList();
          if (list.isEmpty) return Center(child: Text('No templates yet.', style: TextStyle(color: ui.muted)));
          return ListView.separated(
            padding: const EdgeInsets.all(12),
            itemCount: list.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (_, i) {
              final t = list[i];
              return Panel(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(t.name, style: const TextStyle(fontWeight: FontWeight.w700))),
                    TonePill(t.status, tone: t.status == 'approved' ? 'ok' : (t.status == 'rejected' ? 'bad' : 'warn')),
                  ]),
                  const SizedBox(height: 6),
                  Text(t.body, style: TextStyle(color: ui.muted), maxLines: 4, overflow: TextOverflow.ellipsis),
                ]),
              );
            },
          );
        },
      ),
    );
  }
}
