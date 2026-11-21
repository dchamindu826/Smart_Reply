import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import '../widgets/ui.dart';
import 'call_screen.dart';
import 'calls_screen.dart';
import 'chats_screen.dart';
import 'customers_screen.dart';
import 'dashboard_screen.dart';
import 'more_screen.dart';
import 'my_day_screen.dart';
import 'team_screen.dart';

/// Lets a screen switch tabs ("See all" on My day opens Chats).
class HomeTabs {
  static final go = ValueNotifier<int?>(null);
  static const chats = 1;
  static const calls = 2;
}

/// Signed-in shell. Managers: Home · Chats · Calls · Team · More.
/// Staff: My day · Chats · Calls · Customers · More.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;
  StreamSubscription<String>? _notices;
  String? _shownCallId;
  late final AppState _state;

  @override
  void initState() {
    super.initState();
    final state = context.read<AppState>();
    _state = state;
    _notices = state.notices.listen((text) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text), duration: const Duration(seconds: 3)));
    });
    state.addListener(_onState);
    HomeTabs.go.addListener(_onGo);
    // A call may already be ringing (loaded from /calls/active before this screen existed).
    WidgetsBinding.instance.addPostFrameCallback((_) => _onState());
  }

  void _onGo() {
    final i = HomeTabs.go.value;
    if (i == null || !mounted) return;
    HomeTabs.go.value = null;
    setState(() => _tab = i);
  }

  /// Open the incoming-call screen once per ringing call.
  void _onState() {
    final ringing = _state.ringing;
    if (ringing == null || ringing.call.id == _shownCallId || !mounted) return;
    _shownCallId = ringing.call.id;
    Navigator.of(context).push(MaterialPageRoute(fullscreenDialog: true, builder: (_) => CallScreen.incoming(ringing)));
  }

  @override
  void dispose() {
    _notices?.cancel();
    _state.removeListener(_onState);
    HomeTabs.go.removeListener(_onGo);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final manager = state.me?.isManager == true;
    final unread = state.counts['unread'];
    final pages = manager
        ? const [DashboardScreen(), ChatsScreen(), CallsScreen(), TeamScreen(), MoreScreen()]
        : const [MyDayScreen(), ChatsScreen(), CallsScreen(), CustomersScreen(), MoreScreen()];
    final items = [
      manager ? const DockItem(Icons.space_dashboard_outlined, 'Home') : const DockItem(Icons.home_outlined, 'My day'),
      DockItem(Icons.chat_bubble_outline_rounded, 'Chats', badge: unread),
      const DockItem(Icons.call_outlined, 'Calls'),
      manager ? const DockItem(Icons.groups_2_outlined, 'Team') : const DockItem(Icons.people_outline, 'Customers'),
      const DockItem(Icons.grid_view_rounded, 'More'),
    ];
    return Scaffold(
      extendBody: true,
      body: Column(
        children: [
          if (!state.socketConnected)
            Container(
              width: double.infinity,
              color: Colors.orange.shade800,
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: const SafeArea(
                bottom: false,
                child: Text('Connecting… live updates paused', textAlign: TextAlign.center, style: TextStyle(color: Colors.white, fontSize: 12)),
              ),
            ),
          Expanded(child: IndexedStack(index: _tab, children: pages)),
        ],
      ),
      bottomNavigationBar: Dock(items: items, index: _tab, onTap: (i) => setState(() => _tab = i)),
    );
  }
}
