import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'core/api.dart';
import 'core/appearance.dart';
import 'core/push.dart';
import 'core/theme.dart';
import 'screens/chat_screen.dart';
import 'screens/home_screen.dart';
import 'screens/sign_in_screen.dart';
import 'screens/splash_screen.dart';
import 'state/app_state.dart';

final navigatorKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Appearance.load();
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

class SmartReplyApp extends StatefulWidget {
  const SmartReplyApp({super.key});

  @override
  State<SmartReplyApp> createState() => _SmartReplyAppState();
}

class _SmartReplyAppState extends State<SmartReplyApp> {
  /// The opening animation plays once per launch, even if sign-in is instant.
  bool _intro = true;
  static final _light = buildTheme(Brightness.light);
  static final _dark = buildTheme(Brightness.dark);

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final Widget home;
    if (_intro || state.booting) {
      home = SplashScreen(key: const ValueKey('splash'), onDone: () => setState(() => _intro = false));
    } else if (state.me == null) {
      home = const SignInScreen(key: ValueKey('signin'));
    } else {
      home = const HomeScreen(key: ValueKey('home'));
    }
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: Appearance.mode,
      builder: (context, mode, _) => MaterialApp(
        title: 'Smart Reply',
        navigatorKey: navigatorKey,
        debugShowCheckedModeBanner: false,
        theme: _light,
        darkTheme: _dark,
        themeMode: mode,
        home: AnimatedSwitcher(duration: const Duration(milliseconds: 450), child: home),
      ),
    );
  }
}
