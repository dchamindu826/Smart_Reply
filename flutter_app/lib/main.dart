import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/api.dart';
import 'core/push.dart';
import 'core/theme.dart';
import 'screens/chat_screen.dart';
import 'screens/home_screen.dart';
import 'screens/sign_in_screen.dart';
import 'state/app_state.dart';

final navigatorKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Push.init();
  final tokens = TokenStore();
  final state = AppState(api: Api(await ServerConfig.load(), tokens), tokens: tokens);
  // Signed out (button, revoked session, expired refresh): drop any chat or call screen on top.
  state.addListener(() {
    if (!state.booting && state.me == null) navigatorKey.currentState?.popUntil((r) => r.isFirst);
  });
  Push.onOpenChat = (id) => state.me == null
      ? null
      : navigatorKey.currentState?.push(MaterialPageRoute(builder: (_) => ChatScreen(conversationId: id)));
  runApp(ChangeNotifierProvider.value(value: state, child: const SmartReplyApp()));
  await state.boot();
  if (state.me != null) await Push.register(state.api);
}

class SmartReplyApp extends StatelessWidget {
  const SmartReplyApp({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return MaterialApp(
      title: 'Smart Reply',
      navigatorKey: navigatorKey,
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      home: state.booting
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : state.me == null
              ? const SignInScreen()
              : const HomeScreen(),
    );
  }
}
