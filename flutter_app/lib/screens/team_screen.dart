import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../state/app_state.dart';
import '../widgets/avatar.dart';
import '../widgets/ui.dart';

/// Manager: who is live, on a call, on a break or offline, right now.
class TeamScreen extends StatelessWidget {
  const TeamScreen({super.key});

  /// live | call | break | off, and the words under the name.
  static (String, String) _state(StaffMember s) {
    if (s.call.status == 'oncall') return ('call', '${s.openChats} open chats · on a call');
    if (s.call.status == 'brk' || s.chat.status == 'brk') {
      final p = s.chat.status == 'brk' ? s.chat : s.call;
      final mins = p.since == null ? '' : ' · ${DateTime.now().difference(p.since!).inMinutes} min';
      return ('break', '${p.reason.isEmpty ? 'Break' : p.reason}$mins');
    }
    if (s.chat.status == 'available' || s.call.status == 'available') {
      final only = s.call.status != 'available' ? ' · chats only' : (s.chat.status != 'available' ? ' · calls only' : '');
      return ('live', '${s.openChats} open chats$only');
    }
    return ('off', statusLabels[s.chat.status] ?? 'Offline');
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final ui = Ui.of(context);
    final staff = [...state.staff]..sort((a, b) => _rank(_state(a).$1).compareTo(_rank(_state(b).$1)));
    final counts = <String, int>{};
    for (final s in staff) {
      final k = _state(s).$1;
      counts[k == 'call' ? 'live' : k] = (counts[k == 'call' ? 'live' : k] ?? 0) + 1;
    }
    return Scaffold(
      appBar: AppBar(title: const Text('Team'), toolbarHeight: 64),
      body: RefreshIndicator(
        onRefresh: state.loadStaff,
        child: ListView(padding: const EdgeInsets.fromLTRB(12, 4, 12, 0), children: [
          Row(children: [
            _count(ui, 'ok', counts['live'] ?? 0, 'Live'),
            const SizedBox(width: 8),
            _count(ui, 'warn', counts['break'] ?? 0, 'On break'),
            const SizedBox(width: 8),
            _count(ui, 'grey', counts['off'] ?? 0, 'Offline'),
          ]),
          const SizedBox(height: 12),
          if (staff.isEmpty) Panel(child: Text('No staff yet. Invite them from the web console.', style: TextStyle(color: ui.muted))),
          for (final s in staff)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Panel(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                child: Row(children: [
                  Stack(children: [
                    Avatar(initials: s.initials, color: s.avatarColor, size: 46),
                    Positioned(
                      right: 0,
                      bottom: 0,
                      child: Container(
                        width: 13,
                        height: 13,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: ui.card, width: 2),
                          color: switch (_state(s).$1) {
                            'live' || 'call' => Brand.ok,
                            'break' => const Color(0xFFD99312),
                            _ => const Color(0xFF8DA0BA),
                          },
                        ),
                      ),
                    ),
                  ]),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(s.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
                      Text(_state(s).$2, style: TextStyle(fontSize: 12, color: ui.muted)),
                    ]),
                  ),
                  switch (_state(s).$1) {
                    'live' => const TonePill('Live', tone: 'ok'),
                    'call' => const TonePill('On call'),
                    'break' => const TonePill('On break', tone: 'warn'),
                    _ => const TonePill('Offline', tone: 'grey'),
                  },
                ]),
              ),
            ),
          dockSpace,
        ]),
      ),
    );
  }

  static int _rank(String k) => const {'call': 0, 'live': 1, 'break': 2, 'off': 3}[k] ?? 4;

  Widget _count(Ui ui, String tone, int n, String label) {
    final (bg, fg) = ui.tone(tone);
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(16)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('$n', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: fg)),
          Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: fg)),
        ]),
      ),
    );
  }
}
