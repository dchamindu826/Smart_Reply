import { describe, expect, it } from 'vitest';
import { Vad, downsample48to16, rms, upsample, wav } from './audio';
import { CallMedia, offeredOpusType } from './media';

function tone(ms: number, rate: number, hz = 440, amp = 8000): Int16Array {
  const n = Math.round((rate * ms) / 1000);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.round(amp * Math.sin((2 * Math.PI * hz * i) / rate));
  return out;
}

describe('audio helpers', () => {
  it('resamples between 48, 24 and 16 kHz', () => {
    expect(downsample48to16(tone(20, 48000)).length).toBe(320);
    const up = upsample(tone(20, 24000), 2);
    expect(up.out.length).toBe(960);
    expect(rms(up.out)).toBeGreaterThan(4000);
  });

  it('writes a WAV header', () => {
    const w = wav(tone(10, 16000), 16000);
    expect(w.subarray(0, 4).toString()).toBe('RIFF');
    expect(w.readUInt32LE(24)).toBe(16000);
    expect(w.length).toBe(44 + 320);
  });

  it('finds an utterance between silences', () => {
    const vad = new Vad({ endSilenceMs: 400 });
    const events: string[] = [];
    let audioMs = 0;
    const feed = (pcm: Int16Array) => {
      for (let i = 0; i + 320 <= pcm.length; i += 320) {
        const e = vad.push(pcm.subarray(i, i + 320));
        if (e) {
          events.push(e.kind);
          if (e.kind === 'end') audioMs = (e.audio.length / 16000) * 1000;
        }
      }
    };
    feed(new Int16Array(16000)); // 1 s quiet
    feed(tone(800, 16000, 300));
    feed(new Int16Array(16000));
    expect(events).toEqual(['start', 'end']);
    expect(audioMs).toBeGreaterThan(800);
    expect(audioMs).toBeLessThan(1700);
  });
});

describe('call media', () => {
  it('reads the Opus payload type from an offer', () => {
    expect(offeredOpusType('m=audio 9 UDP/TLS/RTP/SAVPF 111 126\r\na=rtpmap:111 opus/48000/2\r\n')).toBe(111);
    expect(offeredOpusType('a=rtpmap:96 OPUS/48000/2')).toBe(96);
  });

  it('answers an offer and carries audio both ways', async () => {
    // "Meta" side: a peer that makes the offer, like WhatsApp does for a user-initiated call.
    const meta = await CallMedia.offer();
    const { media: ours, sdpAnswer } = await CallMedia.answer(meta.sdpOffer);
    expect(sdpAnswer).toContain('a=candidate');
    expect(sdpAnswer).toMatch(/a=rtpmap:111 opus\/48000/i);
    await meta.applyAnswer(sdpAnswer);
    await Promise.all([ours.connected(10000), meta.media.connected(10000)]);

    const heardByUs: Int16Array[] = [];
    ours.onAudio(pcm => heardByUs.push(pcm));
    const heardByMeta: Int16Array[] = [];
    meta.media.onAudio(pcm => heardByMeta.push(pcm));

    meta.media.play(tone(600, 48000), 48000);
    ours.play(tone(600, 24000), 24000);
    await Promise.all([meta.media.drained(), ours.drained()]);
    await new Promise(r => setTimeout(r, 200));

    const loud = (frames: Int16Array[]) => frames.filter(f => rms(f) > 2000).length;
    expect(loud(heardByUs)).toBeGreaterThan(20);
    expect(loud(heardByMeta)).toBeGreaterThan(20);

    // Barge-in: clearing drops queued speech at once.
    ours.play(tone(2000, 24000), 24000);
    expect(ours.playing).toBe(true);
    ours.clearPlayback();
    expect(ours.playing).toBe(false);

    await ours.close();
    await meta.media.close();
    expect(ours.isClosed).toBe(true);
  });
});
