/**
 * Small, dependency-free PCM helpers for the voice agent. All audio is mono 16-bit little-endian.
 *
 * Rates in use: WhatsApp (Opus) 48 kHz · speech recognition and Gemini input 16 kHz ·
 * Gemini speech output 24 kHz.
 */

/** 48 kHz → 16 kHz: a 3-tap average (simple low-pass) then keep every third sample. */
export function downsample48to16(pcm48: Int16Array): Int16Array {
  const n = Math.floor(pcm48.length / 3);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const j = i * 3;
    out[i] = Math.round((pcm48[j] + pcm48[j + 1] + pcm48[j + 2]) / 3);
  }
  return out;
}

/**
 * Up-samples by an integer factor with linear interpolation. `last` is the final sample of the
 * previous chunk so chunk joins stay smooth; pass the returned `last` to the next call.
 */
export function upsample(pcm: Int16Array, factor: number, last = 0): { out: Int16Array; last: number } {
  const out = new Int16Array(pcm.length * factor);
  let prev = last;
  for (let i = 0; i < pcm.length; i++) {
    const cur = pcm[i];
    for (let k = 0; k < factor; k++) {
      out[i * factor + k] = Math.round(prev + ((cur - prev) * (k + 1)) / factor);
    }
    prev = cur;
  }
  return { out, last: prev };
}

/** Root mean square of a frame, 0–32767. */
export function rms(pcm: Int16Array): number {
  if (pcm.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / pcm.length);
}

/** Scale the volume (used for the speaking-rate-neutral loudness setting). */
export function gain(pcm: Int16Array, g: number): Int16Array {
  if (g === 1) return pcm;
  const out = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[i] * g)));
  return out;
}

export function bufferToPcm(buf: Buffer | Uint8Array): Int16Array {
  const even = buf.byteLength - (buf.byteLength % 2);
  const copy = new Uint8Array(even);
  copy.set(buf.subarray(0, even));
  return new Int16Array(copy.buffer);
}

export function pcmToBuffer(pcm: Int16Array): Buffer {
  return Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
}

export function concatPcm(parts: Int16Array[]): Int16Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Int16Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A WAV file around mono 16-bit PCM. */
export function wav(pcm: Int16Array, rate: number): Buffer {
  const data = pcmToBuffer(pcm);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** Sample rate from a Gemini audio mime type such as `audio/L16;codec=pcm;rate=24000`. */
export function rateOf(mime: string | undefined, fallback = 24000): number {
  const m = /rate=(\d+)/i.exec(mime ?? '');
  return m ? Number(m[1]) : fallback;
}

/**
 * Energy-based voice activity detection on 16 kHz frames (any length). Tracks the noise floor,
 * reports when speech starts and when an utterance ends after `endSilenceMs` of quiet.
 */
export class Vad {
  private floor = 300;
  private speechMs = 0;
  private silenceMs = 0;
  private active = false;
  private utterance: Int16Array[] = [];
  private utteranceMs = 0;
  private preroll: Int16Array[] = [];
  private prerollMs = 0;

  constructor(
    private readonly opts: { startMs?: number; endSilenceMs?: number; maxUtteranceMs?: number; minLevel?: number; prerollMs?: number } = {}
  ) {}

  get speaking(): boolean {
    return this.active;
  }

  /** Feed a frame. Returns `start` when speech begins, `end` with the utterance when it finishes. */
  push(frame: Int16Array): { kind: 'start' } | { kind: 'end'; audio: Int16Array } | null {
    const ms = (frame.length / 16000) * 1000;
    const level = rms(frame);
    const threshold = Math.max(this.opts.minLevel ?? 600, this.floor * 3);
    const loud = level > threshold;
    if (!this.active) {
      // Learn the background level only while nobody is talking.
      if (!loud) this.floor = this.floor * 0.95 + level * 0.05;
      this.preroll.push(frame);
      this.prerollMs += ms;
      while (this.prerollMs > (this.opts.prerollMs ?? 300) && this.preroll.length > 1) {
        const f = this.preroll.shift()!;
        this.prerollMs -= (f.length / 16000) * 1000;
      }
      this.speechMs = loud ? this.speechMs + ms : 0;
      if (this.speechMs >= (this.opts.startMs ?? 80)) {
        this.active = true;
        this.silenceMs = 0;
        this.utterance = [...this.preroll];
        this.utteranceMs = this.prerollMs;
        this.preroll = [];
        this.prerollMs = 0;
        return { kind: 'start' };
      }
      return null;
    }
    this.utterance.push(frame);
    this.utteranceMs += ms;
    this.silenceMs = loud ? 0 : this.silenceMs + ms;
    if (this.silenceMs >= (this.opts.endSilenceMs ?? 700) || this.utteranceMs >= (this.opts.maxUtteranceMs ?? 15000)) {
      const audio = concatPcm(this.utterance);
      this.reset();
      return { kind: 'end', audio };
    }
    return null;
  }

  reset(): void {
    this.active = false;
    this.speechMs = 0;
    this.silenceMs = 0;
    this.utterance = [];
    this.utteranceMs = 0;
  }
}
