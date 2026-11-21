import 'package:flutter/material.dart';

import '../core/theme.dart';

/// Navy header with soft brand glows, used at the top of the main screens.
class HeroHeader extends StatelessWidget {
  const HeroHeader({super.key, required this.child, this.bottom = 24});
  final Widget child;
  final double bottom;

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.of(context).padding.top;
    return Container(
      decoration: const BoxDecoration(gradient: Brand.heroGradient),
      clipBehavior: Clip.hardEdge,
      child: Stack(children: [
        Positioned(right: -80, top: -90, child: _glow(Brand.magenta, 240, .32)),
        Positioned(left: -70, bottom: -110, child: _glow(Brand.blue, 220, .28)),
        Padding(
          padding: EdgeInsets.fromLTRB(20, top + 14, 20, bottom),
          child: DefaultTextStyle.merge(style: const TextStyle(color: Colors.white), child: child),
        ),
      ]),
    );
  }

  static Widget _glow(Color c, double size, double alpha) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(shape: BoxShape.circle, gradient: RadialGradient(colors: [c.withValues(alpha: alpha), c.withValues(alpha: 0)])),
      );
}

/// White (or dark) rounded card.
class Panel extends StatelessWidget {
  const Panel({super.key, required this.child, this.padding = const EdgeInsets.all(14), this.onTap, this.shadow = false});
  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;
  final bool shadow;

  @override
  Widget build(BuildContext context) {
    final ui = Ui.of(context);
    return Material(
      color: ui.card,
      borderRadius: BorderRadius.circular(22),
      clipBehavior: Clip.antiAlias,
      elevation: 0,
      shadowColor: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        child: Container(
          decoration: shadow ? BoxDecoration(borderRadius: BorderRadius.circular(22), boxShadow: [BoxShadow(color: ui.shadow, blurRadius: 26, offset: const Offset(0, 10))]) : null,
          padding: padding,
          child: child,
        ),
      ),
    );
  }
}

/// A number with a label, for the stat grids.
class StatTile extends StatelessWidget {
  const StatTile({super.key, required this.label, required this.value, this.sub, this.subTone = 'ok', this.valueColor});
  final String label, value;
  final String? sub;
  final String subTone;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final ui = Ui.of(context);
    final (_, subColor) = ui.tone(subTone);
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(color: ui.card, borderRadius: BorderRadius.circular(22), boxShadow: [BoxShadow(color: ui.shadow, blurRadius: 26, offset: const Offset(0, 10))]),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: TextStyle(fontSize: 12, color: ui.muted)),
        const SizedBox(height: 2),
        FittedBox(fit: BoxFit.scaleDown, child: Text(value, style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: valueColor ?? ui.ink))),
        if (sub != null) Text(sub!, style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: subColor)),
      ]),
    );
  }
}

/// 2-column grid of stat tiles.
class StatGrid extends StatelessWidget {
  const StatGrid({super.key, required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (var i = 0; i < children.length; i += 2) {
      rows.add(Row(children: [
        Expanded(child: children[i]),
        const SizedBox(width: 10),
        Expanded(child: i + 1 < children.length ? children[i + 1] : const SizedBox()),
      ]));
      if (i + 2 < children.length) rows.add(const SizedBox(height: 10));
    }
    return Column(children: rows);
  }
}

/// Small rounded label: "Hot lead", "1h 20m left", "Live".
class TonePill extends StatelessWidget {
  const TonePill(this.text, {super.key, this.tone = 'blue', this.color});
  final String text;
  final String tone;

  /// A label colour from the server (hex) instead of a tone.
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final ui = Ui.of(context);
    var (bg, fg) = ui.tone(tone);
    if (color != null) {
      bg = color!.withValues(alpha: ui.dark ? .25 : .14);
      fg = ui.dark ? Color.lerp(color, Colors.white, .45)! : Color.lerp(color, Colors.black, .25)!;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
      child: Text(text, style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w800)),
    );
  }
}

/// Section heading inside a screen.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 4, 10),
      child: Row(children: [
        Expanded(child: Text(text, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800))),
        if (trailing != null) trailing!,
      ]),
    );
  }
}

/// Pink → magenta → blue button.
class GradientButton extends StatelessWidget {
  const GradientButton({super.key, required this.label, this.onPressed, this.icon});
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    return Opacity(
      opacity: enabled ? 1 : .6,
      child: Container(
        height: 54,
        decoration: BoxDecoration(
          gradient: Brand.gradient,
          borderRadius: BorderRadius.circular(18),
          boxShadow: [BoxShadow(color: Brand.magenta.withValues(alpha: .28), blurRadius: 24, offset: const Offset(0, 10))],
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: onPressed,
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Text(label, style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w800)),
              if (icon != null) ...[const SizedBox(width: 8), Icon(icon, color: Colors.white, size: 20)],
            ]),
          ),
        ),
      ),
    );
  }
}

class DockItem {
  const DockItem(this.icon, this.label, {this.badge = 0});
  final IconData icon;
  final String label;
  final int badge;
}

/// Floating pill navigation. The active item is a gradient pill with its label.
class Dock extends StatelessWidget {
  const Dock({super.key, required this.items, required this.index, required this.onTap});
  final List<DockItem> items;
  final int index;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    final ui = Ui.of(context);
    final bg = ui.paper;
    return DecoratedBox(
      // content scrolls under the dock; this fade hides it between the dock and the screen edge
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [bg.withValues(alpha: 0), bg.withValues(alpha: .92), bg],
          stops: const [0, .35, 1],
        ),
      ),
      child: SafeArea(
        top: false,
        minimum: const EdgeInsets.only(bottom: 10),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 20, 14, 4),
          child: Container(
            height: 66,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            decoration: BoxDecoration(
              color: ui.card,
              borderRadius: BorderRadius.circular(33),
              boxShadow: [BoxShadow(color: ui.dark ? Colors.black54 : const Color(0x29062043), blurRadius: 40, offset: const Offset(0, 16))],
            ),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              for (var i = 0; i < items.length; i++) _item(context, i),
            ]),
          ),
        ),
      ),
    );
  }

  Widget _item(BuildContext context, int i) {
    final it = items[i];
    final ui = Ui.of(context);
    final active = i == index;
    final badge = it.badge > 0
        ? Positioned(
            top: 4,
            right: 2,
            child: Container(
              constraints: const BoxConstraints(minWidth: 18),
              height: 18,
              padding: const EdgeInsets.symmetric(horizontal: 4),
              decoration: BoxDecoration(color: Brand.pink, borderRadius: BorderRadius.circular(9)),
              alignment: Alignment.center,
              child: Text(it.badge > 99 ? '99+' : '${it.badge}', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800)),
            ),
          )
        : null;
    if (active) {
      return Semantics(
        selected: true,
        button: true,
        label: it.label,
        child: GestureDetector(
          onTap: () => onTap(i),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 220),
            height: 50,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(gradient: Brand.gradient, borderRadius: BorderRadius.circular(25)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(it.icon, color: Colors.white, size: 21),
              const SizedBox(width: 8),
              Text(it.label, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w800)),
            ]),
          ),
        ),
      );
    }
    return Stack(clipBehavior: Clip.none, children: [
      IconButton(
        tooltip: it.label,
        onPressed: () => onTap(i),
        icon: Icon(it.icon, color: ui.muted, size: 23),
        style: IconButton.styleFrom(minimumSize: const Size(48, 48)),
      ),
      if (badge != null) badge,
    ]);
  }
}

/// Bottom space so the last item is not hidden under the dock.
const dockSpace = SizedBox(height: 110);

/// Label colours from the server ('i', 'w', 'ok', 'b', '') as pill tones.
String labelTone(String c) => const {'i': 'blue', 'w': 'warn', 'ok': 'ok', 'b': 'bad'}[c] ?? 'pink';
