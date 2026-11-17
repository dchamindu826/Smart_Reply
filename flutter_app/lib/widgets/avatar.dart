import 'package:flutter/material.dart';

import '../core/theme.dart';

class Avatar extends StatelessWidget {
  const Avatar({super.key, required this.initials, required this.color, this.size = 44});
  final String initials;
  final String color;
  final double size;

  @override
  Widget build(BuildContext context) {
    return CircleAvatar(
      radius: size / 2,
      backgroundColor: avatarColor(color),
      child: Text(initials, style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: size * 0.36)),
    );
  }
}
