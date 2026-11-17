import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/app_state.dart';
import 'call_screen.dart';
import 'calls_screen.dart';
import 'chats_screen.dart';
import 'customers_screen.dart';
import 'me_screen.dart';

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
    // A call may already be ringing (loaded from /calls/active before this screen existed).
    WidgetsBinding.instance.addPostFrameCallback((_) => _onState());
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
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final unread = state.counts['unread'];
    final pages = const [ChatsScreen(), CallsScreen(), CustomersScreen(), MeScreen()];
    return Scaffold(
      body: Column(
        children: [
          if (!state.socketConnected)
            Container(
              width: double.infinity,
              color: Colors.orange.shade700,
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: const SafeArea(
                bottom: false,
                child: Text('Connecting… live updates paused', textAlign: TextAlign.center, style: TextStyle(color: Colors.white, fontSize: 12)),
              ),
            ),
          Expanded(child: IndexedStack(index: _tab, children: pages)),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          NavigationDestination(
            icon: Badge(isLabelVisible: unread > 0, label: Text('$unread'), child: const Icon(Icons.chat_bubble_outline)),
            label: 'Chats',
          ),
          const NavigationDestination(icon: Icon(Icons.call_outlined), label: 'Calls'),
          const NavigationDestination(icon: Icon(Icons.people_outline), label: 'Customers'),
          const NavigationDestination(icon: Icon(Icons.person_outline), label: 'Me'),
        ],
      ),
    );
  }
}
