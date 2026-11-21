import 'package:flutter/material.dart';

import '../core/theme.dart';

/// Initials in a soft circle tinted with the person's colour.
class Avatar extends StatelessWidget {
  const Avatar({super.key, required this.initials, required this.color, this.size = 44, this.solid = false});
  final String initials;
  final String color;
  final double size;

  /// Filled with the colour (white initials), for dark headers.
  final bool solid;

  @override
  Widget build(BuildContext context) {
    final c = avatarColor(color);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(shape: BoxShape.circle, color: solid ? c : c.withValues(alpha: dark ? .28 : .14)),
      child: Text(
        initials,
        style: TextStyle(
          color: solid ? Colors.white : (dark ? Color.lerp(c, Colors.white, .5) : c),
          fontWeight: FontWeight.w800,
          fontSize: size * 0.34,
        ),
      ),
    );
  }
}
