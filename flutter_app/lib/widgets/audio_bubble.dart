import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:just_audio/just_audio.dart';

import '../core/format.dart';
import '../core/theme.dart';

/// A WhatsApp voice note: avatar with a mic badge, play button, waveform you can seek, and the length.
class AudioBubble extends StatefulWidget {
  const AudioBubble({super.key, required this.url, required this.wa, this.outgoing = false, this.voice = true, this.seconds});
  final String url;
  final Wa wa;
  final bool outgoing;
  final bool voice;
  final int? seconds;

  @override
  State<AudioBubble> createState() => _AudioBubbleState();
}

class _AudioBubbleState extends State<AudioBubble> {
  final _player = AudioPlayer();
  bool _loaded = false;
  late final List<double> _bars;

  @override
  void initState() {
    super.initState();
    // A steady-looking waveform made from the URL, so each note keeps its own shape.
    final rnd = math.Random(widget.url.hashCode);
    _bars = List.generate(30, (i) => 0.2 + rnd.nextDouble() * 0.8);
  }

  @override
  void dispose() {
    _player.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (_loaded) return;
    await _player.setUrl(widget.url);
    _loaded = true;
  }

  Future<void> _toggle() async {
    try {
      await _load();
      if (_player.playing) {
        await _player.pause();
      } else {
        if (_player.processingState == ProcessingState.completed) await _player.seek(Duration.zero);
        await _player.play();
      }
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not play this audio.')));
    }
  }

  Future<void> _seek(double fraction) async {
    try {
      await _load();
      final total = _player.duration;
      if (total == null) return;
      await _player.seek(total * fraction.clamp(0.0, 1.0));
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final wa = widget.wa;
    final played = widget.outgoing ? (wa.dark ? const Color(0xFF6FE3C8) : const Color(0xFF00A884)) : const Color(0xFF00A884);
    final idle = wa.wave;
    return SizedBox(
      width: 250,
      child: StreamBuilder<PlayerState>(
        stream: _player.playerStateStream,
        builder: (context, snap) {
          final playing = snap.data?.playing ?? false;
          final busy = snap.data?.processingState == ProcessingState.loading || snap.data?.processingState == ProcessingState.buffering;
          final avatar = Stack(clipBehavior: Clip.none, children: [
            CircleAvatar(
              radius: 22,
              backgroundColor: widget.outgoing ? const Color(0xFF1FA855) : const Color(0xFFDFE5E7),
              child: Icon(widget.voice ? Icons.person : Icons.headphones, color: Colors.white, size: 28),
            ),
            if (widget.voice)
              Positioned(
                right: -3,
                bottom: -2,
                child: Icon(Icons.mic, size: 18, color: widget.outgoing ? const Color(0xFF53BDEB) : Wa.green),
              ),
          ]);
          final controls = Expanded(
            child: StreamBuilder<Duration>(
              stream: _player.positionStream,
              builder: (context, pos) {
                final total = _player.duration ?? Duration(seconds: widget.seconds ?? 0);
                final p = pos.data ?? Duration.zero;
                final value = total.inMilliseconds == 0 ? 0.0 : (p.inMilliseconds / total.inMilliseconds).clamp(0.0, 1.0);
                final showing = playing || p > Duration.zero ? p : total;
                return Row(children: [
                  SizedBox(
                    width: 36,
                    height: 36,
                    child: busy
                        ? Padding(padding: const EdgeInsets.all(9), child: CircularProgressIndicator(strokeWidth: 2, color: wa.barIcon))
                        : IconButton(
                            padding: EdgeInsets.zero,
                            iconSize: 32,
                            icon: Icon(playing ? Icons.pause : Icons.play_arrow, color: wa.barIcon),
                            onPressed: _toggle,
                          ),
                  ),
                  Expanded(
                    child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const SizedBox(height: 12),
                      LayoutBuilder(
                        builder: (context, box) => GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTapDown: (d) => _seek(d.localPosition.dx / box.maxWidth),
                          onHorizontalDragUpdate: (d) => _seek(d.localPosition.dx / box.maxWidth),
                          child: SizedBox(
                            height: 24,
                            child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
                              for (var i = 0; i < _bars.length; i++)
                                Expanded(
                                  child: Center(
                                    child: Container(
                                      width: 2.6,
                                      height: 4 + 18 * _bars[i],
                                      decoration: BoxDecoration(
                                        color: (i + .5) / _bars.length <= value ? played : idle,
                                        borderRadius: BorderRadius.circular(2),
                                      ),
                                    ),
                                  ),
                                ),
                            ]),
                          ),
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(duration(showing.inSeconds), style: TextStyle(fontSize: 11, color: wa.meta)),
                    ]),
                  ),
                ]);
              },
            ),
          );
          // WhatsApp puts the avatar on the left for incoming notes and on the right for yours.
          return Row(children: widget.outgoing ? [controls, const SizedBox(width: 8), avatar] : [avatar, const SizedBox(width: 8), controls]);
        },
      ),
    );
  }
}
