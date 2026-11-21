import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Light / dark / follow the phone. Chosen in More → Appearance and kept on this phone.
class Appearance {
  static const _key = 'theme_mode';
  static final ValueNotifier<ThemeMode> mode = ValueNotifier(ThemeMode.system);

  static Future<void> load() async {
    try {
      final p = await SharedPreferences.getInstance();
      mode.value = switch (p.getString(_key)) {
        'light' => ThemeMode.light,
        'dark' => ThemeMode.dark,
        _ => ThemeMode.system,
      };
    } catch (_) {
      // storage unavailable: follow the phone
    }
  }

  static Future<void> set(ThemeMode m) async {
    mode.value = m;
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString(_key, m.name);
    } catch (_) {}
  }
}
