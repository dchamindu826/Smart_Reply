import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions
} from 'expo-audio';
import { useCallback, useState } from 'react';
import type { LocalFile } from '@/lib/upload';

/** AAC in an MPEG-4 container (.m4a, audio/mp4): accepted by WhatsApp. Mono keeps files small. */
const VOICE: RecordingOptions = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64_000 };

export interface VoiceClip {
  file: LocalFile;
  seconds: number;
}

export function useVoiceRecorder() {
  const recorder = useAudioRecorder(VOICE);
  const state = useAudioRecorderState(recorder, 250);
  const [active, setActive] = useState(false);

  const start = useCallback(async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) throw new Error('Allow microphone access for Smart Reply in your phone settings to record voice notes.');
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setActive(true);
  }, [recorder]);

  const finish = useCallback(async (): Promise<VoiceClip | null> => {
    const ms = recorder.getStatus().durationMillis;
    await recorder.stop();
    setActive(false);
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    const uri = recorder.uri;
    if (!uri || ms < 800) return null;
    return { file: { uri, name: `voice-${Date.now()}.m4a`, mime: 'audio/mp4' }, seconds: Math.round(ms / 1000) };
  }, [recorder]);

  const cancel = useCallback(async () => {
    if (recorder.isRecording) await recorder.stop();
    setActive(false);
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
  }, [recorder]);

  return { active, durationMs: state.durationMillis, start, finish, cancel };
}
