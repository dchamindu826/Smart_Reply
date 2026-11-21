import 'package:flutter/material.dart';

/// Smart Reply brand (same family as the web app and SmartHR): navy, blue, magenta, pink.
class Brand {
  static const navy = Color(0xFF002D70);
  static const deepNavy = Color(0xFF001A45);
  static const blue = Color(0xFF0B6FD4);
  static const magenta = Color(0xFFC810B0);
  static const pink = Color(0xFFE40675);
  static const ink = Color(0xFF062043);
  static const muted = Color(0xFF5B7191);
  static const paper = Color(0xFFF1F5FA);
  static const rule = Color(0xFFE0E7F0);
  static const ok = Color(0xFF0B8A5C);
  static const warn = Color(0xFFA96C08);
  static const danger = Color(0xFFBE3220);

  /// Dark mode surfaces.
  static const darkPaper = Color(0xFF050F1F);
  static const darkCard = Color(0xFF0B1D35);
  static const darkCard2 = Color(0xFF112845);

  static const gradient = LinearGradient(colors: [pink, magenta, blue], stops: [0, 0.5, 1]);
  static const heroGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [deepNavy, navy, Color(0xFF23126B)],
    stops: [0, 0.7, 1],
  );

  // Kept for older screens.
  static const green = Color(0xFF00A884);
  static const dark = deepNavy;
  static const teal = Color(0xFF008069);
  static const blueTick = Color(0xFF53BDEB);
  static const outLight = Color(0xFFD9FDD3);
  static const outDark = Color(0xFF005C4B);
  static const noteLight = Color(0xFFFFF4C2);
  static const noteDark = Color(0xFF4A4120);
}

/// WhatsApp's own colours, used only inside a chat so it feels like WhatsApp.
class Wa {
  final bool dark;
  const Wa(this.dark);
  factory Wa.of(BuildContext context) => Wa(Theme.of(context).brightness == Brightness.dark);

  Color get bar => dark ? const Color(0xFF202C33) : const Color(0xFFF0F2F5);
  Color get barText => dark ? const Color(0xFFE9EDEF) : const Color(0xFF111B21);
  Color get barSub => const Color(0xFF00A884);
  Color get barIcon => dark ? const Color(0xFFAEBAC1) : const Color(0xFF54656F);
  Color get border => dark ? const Color(0xFF2A3942) : const Color(0xFFE0E5E9);
  Color get chip => dark ? const Color(0xFF202C33) : Colors.white;
  Color get chipBorder => dark ? const Color(0xFF3B4A54) : const Color(0xFFCBD5E1);
  Color get wave => dark ? const Color(0xFF8696A0) : const Color(0xFFA5B3BB);
  Color get docBg => dark ? const Color(0x33000000) : const Color(0xFFF5F6F6);
  Color get noteHead => dark ? const Color(0xFFFFD279) : const Color(0xFF8A5606);
  Color get wallpaper => dark ? const Color(0xFF0B141A) : const Color(0xFFEFEAE2);
  String get doodle => dark ? 'assets/wa_doodle_dark.jpg' : 'assets/wa_doodle_light.jpg';
  Color get inBubble => dark ? const Color(0xFF202C33) : Colors.white;
  Color get outBubble => dark ? const Color(0xFF005C4B) : const Color(0xFFD9FDD3);
  Color get note => dark ? const Color(0xFF3D3517) : const Color(0xFFFFF4C2);
  Color get text => dark ? const Color(0xFFE9EDEF) : const Color(0xFF111B21);
  Color get meta => dark ? const Color(0xFF8696A0) : const Color(0xFF54656F);
  Color get dayChip => dark ? const Color(0xFF182229) : Colors.white;
  Color get system => dark ? const Color(0xFF182229) : const Color(0xFFFFEECD);
  Color get composer => dark ? const Color(0xFF2A3942) : Colors.white;
  Color get composerBar => dark ? const Color(0xFF202C33) : const Color(0xFFF0F2F5);
  static const green = Color(0xFF00A884);
  static const tick = Color(0xFF53BDEB);
  static const sender = Color(0xFF06CF9C);
}

const _avatarColors = <String, Color>{
  'a1': Color(0xFF0B6FD4),
  'a2': Color(0xFF0B8A5C),
  'a3': Color(0xFFC810B0),
  'a4': Color(0xFFE8710A),
  'a5': Color(0xFF7B3FE4),
  'a6': Color(0xFF00897B),
  'a7': Color(0xFFD93025),
};

Color avatarColor(String key) => _avatarColors[key] ?? const Color(0xFF607D8B);

/// Colours the app's own screens use (cards, text, lines) for light and dark.
class Ui {
  final bool dark;
  const Ui(this.dark);
  factory Ui.of(BuildContext context) => Ui(Theme.of(context).brightness == Brightness.dark);

  Color get paper => dark ? Brand.darkPaper : Brand.paper;
  Color get card => dark ? Brand.darkCard : Colors.white;
  Color get card2 => dark ? Brand.darkCard2 : const Color(0xFFF5F8FC);
  Color get ink => dark ? const Color(0xFFE8EFF8) : Brand.ink;
  Color get muted => dark ? const Color(0xFF9DB0CB) : Brand.muted;
  Color get rule => dark ? const Color(0xFF1C3554) : Brand.rule;
  Color get shadow => dark ? Colors.black.withValues(alpha: 0.35) : const Color(0x14062043);

  /// Soft tinted pill: background and text for a tone.
  (Color, Color) tone(String t) {
    switch (t) {
      case 'ok':
        return dark ? (const Color(0xFF0E3B2C), const Color(0xFF7FE0B5)) : (const Color(0xFFE0F3EB), const Color(0xFF0B6E49));
      case 'warn':
        return dark ? (const Color(0xFF3D2D0A), const Color(0xFFFFCB6B)) : (const Color(0xFFFBEFD6), const Color(0xFF8A5606));
      case 'bad':
        return dark ? (const Color(0xFF431A14), const Color(0xFFFFA295)) : (const Color(0xFFFBE3DE), const Color(0xFFA32A1B));
      case 'pink':
        return dark ? (const Color(0xFF3D1037), const Color(0xFFFF9BE6)) : (const Color(0xFFF8E1F4), const Color(0xFFA40D90));
      case 'violet':
        return dark ? (const Color(0xFF2A1F4D), const Color(0xFFC6B3FF)) : (const Color(0xFFEDE7FB), const Color(0xFF5B2FB8));
      case 'grey':
        return dark ? (const Color(0xFF1C3554), const Color(0xFFB7C6DC)) : (const Color(0xFFE0E7F0), const Color(0xFF3B4F6B));
      default:
        return dark ? (const Color(0xFF0F2E57), const Color(0xFF8CC2FF)) : (const Color(0xFFE4EFFC), const Color(0xFF0B5BB0));
    }
  }
}

ThemeData buildTheme(Brightness brightness) {
  final dark = brightness == Brightness.dark;
  final ui = Ui(dark);
  final scheme = ColorScheme.fromSeed(
    seedColor: Brand.blue,
    brightness: brightness,
    primary: dark ? const Color(0xFF6FB2FF) : Brand.blue,
    secondary: Brand.magenta,
    surface: ui.card,
    error: Brand.danger,
  );
  return ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    scaffoldBackgroundColor: ui.paper,
    textTheme: (dark ? Typography.material2021().white : Typography.material2021().black).apply(bodyColor: ui.ink, displayColor: ui.ink),
    appBarTheme: AppBarTheme(
      backgroundColor: ui.card,
      foregroundColor: ui.ink,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(color: ui.ink, fontSize: 20, fontWeight: FontWeight.w800),
    ),
    cardTheme: CardThemeData(color: ui.card, elevation: 0, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22))),
    dividerTheme: DividerThemeData(color: ui.rule, space: 1),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: ui.card2,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: ui.rule)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: ui.rule)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: Brand.blue, width: 1.6)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: dark ? const Color(0xFF1E5FB0) : Brand.navy,
        foregroundColor: Colors.white,
        minimumSize: const Size(44, 46),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: ui.card,
      selectedColor: dark ? const Color(0xFF1E5FB0) : Brand.navy,
      labelStyle: TextStyle(
        color: WidgetStateColor.resolveWith((s) => s.contains(WidgetState.selected) ? Colors.white : ui.ink),
        fontWeight: FontWeight.w700,
      ),
      secondaryLabelStyle: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
      side: BorderSide(color: ui.rule),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      showCheckmark: false,
    ),
    bottomSheetTheme: BottomSheetThemeData(backgroundColor: ui.card, surfaceTintColor: Colors.transparent, showDragHandle: true),
    dialogTheme: DialogThemeData(backgroundColor: ui.card, surfaceTintColor: Colors.transparent),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
  );
}
