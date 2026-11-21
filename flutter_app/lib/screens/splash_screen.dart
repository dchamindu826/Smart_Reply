import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/theme.dart';

/// Opening animation: the mark pops in, "SmartReply" rises letter by letter,
/// a gradient line grows and "by LUMI AI Solutions" fades in. White in light
/// mode, deep navy in dark mode. [onDone] fires after it has played (~2 s).
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key, this.onDone});
  final VoidCallback? onDone;

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with TickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 2100));
  late final AnimationController _dots = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..repeat();

  static const _replyGradient = LinearGradient(colors: [Color(0xFF1E90FF), Color(0xFF6A3DE8), Brand.pink]);
  static const _lumiGradient = LinearGradient(colors: [Color(0xFF00B4F0), Brand.blue, Brand.magenta]);

  @override
  void initState() {
    super.initState();
    _c.forward().whenComplete(() {
      if (mounted) widget.onDone?.call();
    });
  }

  @override
  void dispose() {
    _c.dispose();
    _dots.dispose();
    super.dispose();
  }

  double _p(double from, double to, [Curve curve = Curves.easeOutCubic]) {
    final v = ((_c.value - from) / (to - from)).clamp(0.0, 1.0);
    return curve.transform(v);
  }

  Widget _letter(String ch, double start, TextStyle style) {
    final t = _p(start, start + .2);
    return Opacity(opacity: t, child: Transform.translate(offset: Offset(0, 18 * (1 - t)), child: Text(ch, style: style)));
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final bg = dark ? Brand.darkPaper : Colors.white;
    final first = dark ? Colors.white : Brand.navy;
    final muted = dark ? const Color(0xFF9DB0CB) : Brand.muted;
    const title = TextStyle(fontSize: 38, fontWeight: FontWeight.w800, letterSpacing: -0.8, height: 1.1);
    final small = TextStyle(fontSize: 13.5, letterSpacing: 2.2, color: muted, fontWeight: FontWeight.w500);
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
      child: Scaffold(
        backgroundColor: bg,
        body: AnimatedBuilder(
          animation: Listenable.merge([_c, _dots]),
          builder: (context, _) {
            final mark = _p(0, .33, Curves.easeOutBack);
            final line = _p(.6, .84);
            final by = _p(.74, 1);
            return Stack(children: [
              Center(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Opacity(
                    opacity: _p(0, .2),
                    child: Transform.rotate(
                      angle: -8 * math.pi / 180 * (1 - mark),
                      child: Transform.scale(scale: .6 + .4 * mark, child: Image.asset('assets/logo_mark.png', width: 132)),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    for (var i = 0; i < 5; i++) _letter('Smart'[i], .2 + i * .035, title.copyWith(color: first)),
                    ShaderMask(
                      blendMode: BlendMode.srcIn,
                      shaderCallback: (r) => _replyGradient.createShader(r),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        for (var i = 0; i < 5; i++) _letter('Reply'[i], .38 + i * .035, title.copyWith(color: Colors.white)),
                      ]),
                    ),
                  ]),
                  const SizedBox(height: 12),
                  Transform.scale(
                    scaleX: line,
                    child: Container(width: 120, height: 3, decoration: BoxDecoration(gradient: Brand.gradient, borderRadius: BorderRadius.circular(2))),
                  ),
                  const SizedBox(height: 12),
                  Opacity(
                    opacity: by,
                    child: Transform.translate(
                      offset: Offset(0, 6 * (1 - by)),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Text('BY ', style: small),
                        ShaderMask(
                          blendMode: BlendMode.srcIn,
                          shaderCallback: (r) => _lumiGradient.createShader(r),
                          child: Text('LUMI AI', style: small.copyWith(color: Colors.white, fontWeight: FontWeight.w800)),
                        ),
                        Text(' SOLUTIONS', style: small),
                      ]),
                    ),
                  ),
                ]),
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 70,
                child: Opacity(
                  opacity: _p(.9, 1),
                  child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [for (var i = 0; i < 3; i++) _dot(i)]),
                ),
              ),
            ]);
          },
        ),
      ),
    );
  }

  Widget _dot(int i) {
    const colors = [Brand.magenta, Color(0xFF6A3DE8), Brand.blue];
    final phase = (_dots.value - i * .17) % 1.0;
    final k = (math.sin(phase * 2 * math.pi) + 1) / 2;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4),
      child: Transform.scale(
        scale: .8 + .35 * k,
        child: Container(width: 8, height: 8, decoration: BoxDecoration(shape: BoxShape.circle, color: colors[i].withValues(alpha: .25 + .75 * k))),
      ),
    );
  }
}
