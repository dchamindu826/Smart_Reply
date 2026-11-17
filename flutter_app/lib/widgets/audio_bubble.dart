import 'package:flutter/material.dart';
import 'package:just_audio/just_audio.dart';

import '../core/format.dart';

/// Play button and progress for a voice note or audio file.
class AudioBubble extends StatefulWidget {
  const AudioBubble({super.key, required this.url});
  final String url;

  @override
  State<AudioBubble> createState() => _AudioBubbleState();
}

class _AudioBubbleState extends State<AudioBubble> {
  final _player = AudioPlayer();
  bool _loaded = false;

  @override
  void dispose() {
    _player.dispose();
    super.dispose();
  }

  Future<void> _toggle() async {
    try {
      if (!_loaded) {
        await _player.setUrl(widget.url);
        _loaded = true;
      }
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

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 220,
      child: StreamBuilder<PlayerState>(
        stream: _player.playerStateStream,
        builder: (context, snap) {
          final playing = snap.data?.playing ?? false;
          return Row(children: [
            IconButton(icon: Icon(playing ? Icons.pause : Icons.play_arrow), onPressed: _toggle),
            Expanded(
              child: StreamBuilder<Duration>(
                stream: _player.positionStream,
                builder: (context, pos) {
                  final total = _player.duration ?? Duration.zero;
                  final p = pos.data ?? Duration.zero;
                  final value = total.inMilliseconds == 0 ? 0.0 : (p.inMilliseconds / total.inMilliseconds).clamp(0.0, 1.0);
                  return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                    LinearProgressIndicator(value: value),
                    const SizedBox(height: 4),
                    Text(duration((total.inMilliseconds == 0 ? p : total).inSeconds), style: const TextStyle(fontSize: 11)),
                  ]);
                },
              ),
            ),
          ]);
        },
      ),
    );
  }
}
