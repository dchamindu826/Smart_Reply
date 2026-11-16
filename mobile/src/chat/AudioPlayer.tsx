import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { FileRef } from '@smart-reply/shared';
import { duration } from '@/lib/time';
import { mediaSource } from '@/lib/urls';
import { useTheme } from '@/ui/theme';

/** Voice note / audio player. The file is only loaded on first play. */
export function AudioPlayer({ file }: { file: FileRef }) {
  const t = useTheme();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const loaded = useRef(false);

  const toggle = () => {
    if (!loaded.current) {
      const src = file.url.startsWith('file:') ? { uri: file.url } : mediaSource(file.url);
      player.replace(src);
      loaded.current = true;
    }
    if (status.playing) player.pause();
    else {
      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.2)) void player.seekTo(0);
      player.play();
    }
  };

  const total = status.duration > 0 ? status.duration : (file.durationSeconds ?? 0);
  const progress = total > 0 ? Math.min(1, status.currentTime / total) : 0;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause voice note' : 'Play voice note'}
        onPress={toggle}
        style={[styles.btn, { backgroundColor: t.primary }]}
      >
        <Ionicons name={status.playing ? 'pause' : 'play'} size={20} color={t.onPrimary} />
      </Pressable>
      <View style={styles.track}>
        <View style={[styles.bar, { backgroundColor: t.rule }]}>
          <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: t.primary }]} />
        </View>
        <Text style={[styles.time, { color: t.text2 }]}>
          {status.playing || status.currentTime > 0 ? duration(status.currentTime) : duration(total)}
          {file.voice ? '  ·  Voice note' : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minWidth: 210, paddingVertical: 4 },
  btn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  track: { flex: 1, marginLeft: 10 },
  bar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4 },
  time: { fontSize: 12, marginTop: 6 }
});
