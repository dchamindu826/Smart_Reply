import 'package:flutter/material.dart';

/// Smart Reply colours: green brand, WhatsApp-like chat bubbles.
class Brand {
  static const green = Color(0xFF0F9D58);
  static const dark = Color(0xFF0B3D2E);
  static const teal = Color(0xFF008069);
  static const blueTick = Color(0xFF53BDEB);
  static const outLight = Color(0xFFD9FDD3);
  static const outDark = Color(0xFF005C4B);
  static const noteLight = Color(0xFFFFF4C2);
  static const noteDark = Color(0xFF4A4120);
  static const danger = Color(0xFFEA0038);
}

const _avatarColors = <String, Color>{
  'a1': Color(0xFF0B6FD4),
  'a2': Color(0xFF0F9D58),
  'a3': Color(0xFFC810B0),
  'a4': Color(0xFFE8710A),
  'a5': Color(0xFF7B3FE4),
  'a6': Color(0xFF00897B),
  'a7': Color(0xFFD93025),
};

Color avatarColor(String key) => _avatarColors[key] ?? const Color(0xFF607D8B);

ThemeData buildTheme(Brightness brightness) {
  final scheme = ColorScheme.fromSeed(seedColor: Brand.green, brightness: brightness);
  return ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    appBarTheme: AppBarTheme(
      backgroundColor: brightness == Brightness.light ? Brand.teal : const Color(0xFF1F2C34),
      foregroundColor: Colors.white,
      elevation: 0,
    ),
    inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder()),
  );
}
