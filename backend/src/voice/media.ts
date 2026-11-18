/**
 * The server side of a WhatsApp call (Stage B media). Answers Meta's SDP offer with a WebRTC peer
 * (werift, pure TypeScript), decodes the caller's Opus audio to 16 kHz PCM and plays PCM back as
 * paced 20 ms Opus frames.
 *
 * Meta does not trickle ICE: the answer we hand to `pre_accept`/`accept` must already hold our
 * candidates, so we wait for gathering to finish before returning it.
 */
import OpusScript from 'opusscript';
import { MediaStreamTrack, RTCPeerConnection, RtpHeader, RtpPacket, useOPUS } from 'werift';
import { bufferToPcm, downsample48to16, upsample } from './audio';

export interface MediaOptions {
  /** Public IPv4 to advertise (the server's address). */
  publicIp?: string;
  portRange?: [number, number];
}

const FRAME = 960; // 20 ms at 48 kHz
const FRAME_MS = 20;

export class CallMedia {
  private readonly encoder = new OpusScript(48000, 1, OpusScript.Application.VOIP);
  private readonly decoder = new OpusScript(48000, 1);
  private readonly silence: Buffer;
  private queue: Int16Array[] = [];
  private queueOffset = 0;
  private queued = 0;
  private upLast = 0;
  private seq = Math.floor(Math.random() * 0xffff);
  private ts = Math.floor(Math.random() * 0xffffffff);
  private timer: NodeJS.Timeout | null = null;
  private startedAt = 0;
  private sentFrames = 0;
  private wasPlaying = false;
  private closed = false;
  private drainWaiters: (() => void)[] = [];
  private audioHandler: ((pcm16k: Int16Array) => void) | null = null;
  private closeHandlers: ((reason: string) => void)[] = [];
  private payloadType = 111;
  /** Frames received from the caller (for health checks and tests). */
  received = 0;

  private constructor(
    private readonly pc: RTCPeerConnection,
    private readonly track: MediaStreamTrack
  ) {
    this.silence = Buffer.from(this.encoder.encode(Buffer.alloc(FRAME * 2), FRAME));
    pc.connectionStateChange.subscribe(state => {
      if (state === 'connected') this.startPacing();
      if (state === 'failed' || state === 'closed') this.finish(state === 'failed' ? 'media_failed' : 'closed');
    });
    pc.iceConnectionStateChange.subscribe(state => {
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.finish(state === 'failed' ? 'media_failed' : 'closed');
      }
    });
  }

  /** Answer an SDP offer. Resolves with the media session and our complete SDP answer. */
  static async answer(offerSdp: string, opts: MediaOptions = {}): Promise<{ media: CallMedia; sdpAnswer: string }> {
    const pc = new RTCPeerConnection({
      codecs: { audio: [useOPUS({ payloadType: offeredOpusType(offerSdp) ?? 111 })] },
      iceAdditionalHostAddresses: opts.publicIp ? [opts.publicIp] : undefined,
      icePortRange: opts.portRange,
      iceUseIpv6: false
    });
    const track = new MediaStreamTrack({ kind: 'audio' });
    const media = new CallMedia(pc, track);
    pc.onTrack.subscribe(remote => {
      remote.onReceiveRtp.subscribe(packet => media.onRtp(packet.payload));
    });
    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
      const transceiver = pc.getTransceivers().find(t => t.kind === 'audio');
      if (!transceiver) throw new Error('The offer has no audio');
      await transceiver.sender.replaceTrack(track);
      transceiver.setDirection('sendrecv');
      await pc.setLocalDescription(await pc.createAnswer());
      await waitGathering(pc, 5000);
      media.payloadType = transceiver.sender.codec?.payloadType ?? media.payloadType;
      const sdpAnswer = pc.localDescription?.sdp;
      if (!sdpAnswer) throw new Error('No SDP answer');
      return { media, sdpAnswer };
    } catch (err) {
      await media.close();
      throw err;
    }
  }

  /** Make an SDP offer (business-initiated calls, and the loop-back test). */
  static async offer(opts: MediaOptions = {}): Promise<{ media: CallMedia; sdpOffer: string; applyAnswer: (sdp: string) => Promise<void> }> {
    const pc = new RTCPeerConnection({
      codecs: { audio: [useOPUS({ payloadType: 111 })] },
      iceAdditionalHostAddresses: opts.publicIp ? [opts.publicIp] : undefined,
      icePortRange: opts.portRange,
      iceUseIpv6: false
    });
    const track = new MediaStreamTrack({ kind: 'audio' });
    const media = new CallMedia(pc, track);
    pc.onTrack.subscribe(remote => remote.onReceiveRtp.subscribe(packet => media.onRtp(packet.payload)));
    pc.addTransceiver(track, { direction: 'sendrecv' });
    await pc.setLocalDescription(await pc.createOffer());
    await waitGathering(pc, 5000);
    return {
      media,
      sdpOffer: pc.localDescription!.sdp,
      applyAnswer: async sdp => {
        await pc.setRemoteDescription({ type: 'answer', sdp });
      }
    };
  }

  /** Resolves when the media path is up (DTLS done), rejects after `ms`. */
  connected(ms = 15000): Promise<void> {
    if (this.pc.connectionState === 'connected') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        sub.unSubscribe();
        reject(new Error('Call audio did not connect'));
      }, ms);
      const sub = this.pc.connectionStateChange.subscribe(state => {
        if (state === 'connected') {
          clearTimeout(t);
          sub.unSubscribe();
          resolve();
        } else if (state === 'failed' || state === 'closed') {
          clearTimeout(t);
          sub.unSubscribe();
          reject(new Error(`Call audio ${state}`));
        }
      });
    });
  }

  /** Caller audio, 16 kHz mono PCM in 20 ms frames. */
  onAudio(handler: (pcm16k: Int16Array) => void): void {
    this.audioHandler = handler;
  }

  onClose(handler: (reason: string) => void): void {
    this.closeHandlers.push(handler);
  }

  /** Queue speech for the caller. `rate` must divide 48000 (24000, 16000 or 48000). */
  play(pcm: Int16Array, rate: number): void {
    if (this.closed || pcm.length === 0) return;
    const factor = 48000 / rate;
    let at48: Int16Array;
    if (factor === 1) at48 = pcm;
    else if (Number.isInteger(factor)) {
      const r = upsample(pcm, factor, this.upLast);
      this.upLast = r.last;
      at48 = r.out;
    } else throw new Error(`Unsupported rate ${rate}`);
    this.queue.push(at48);
    this.queued += at48.length;
  }

  /** Drop everything not yet played (the caller started talking). */
  clearPlayback(): void {
    this.queue = [];
    this.queueOffset = 0;
    this.queued = 0;
    this.upLast = 0;
    this.resolveDrain();
  }

  /** True while queued speech is still being sent. */
  get playing(): boolean {
    return this.queued > 0;
  }

  /** Milliseconds of speech still queued. */
  get queuedMs(): number {
    return (this.queued / 48000) * 1000;
  }

  /** Resolves when the play queue is empty. */
  drained(): Promise<void> {
    if (!this.playing) return Promise.resolve();
    return new Promise(resolve => this.drainWaiters.push(resolve));
  }

  async close(): Promise<void> {
    this.finish('closed');
    try {
      await this.pc.close();
    } catch {
      /* already closed */
    }
  }

  get isClosed(): boolean {
    return this.closed;
  }

  /* ───────── internals ───────── */

  private onRtp(payload: Buffer): void {
    if (this.closed || payload.length === 0) return;
    this.received++;
    let pcm48: Int16Array;
    try {
      pcm48 = bufferToPcm(this.decoder.decode(payload));
    } catch {
      return; // a bad packet; skip it
    }
    this.audioHandler?.(downsample48to16(pcm48));
  }

  private startPacing(): void {
    if (this.timer || this.closed) return;
    this.startedAt = Date.now();
    this.sentFrames = 0;
    // Send as many frames as are due; a late timer catches up instead of drifting.
    this.timer = setInterval(() => {
      const due = Math.floor((Date.now() - this.startedAt) / FRAME_MS);
      let n = 0;
      while (this.sentFrames < due && n < 10) {
        this.sendFrame();
        this.sentFrames++;
        n++;
      }
      if (this.sentFrames < due) this.sentFrames = due; // fell far behind: skip, do not burst
    }, 10);
  }

  private nextFrame(): Int16Array | null {
    if (this.queued < 1) return null;
    const out = new Int16Array(FRAME);
    let filled = 0;
    while (filled < FRAME && this.queue.length) {
      const head = this.queue[0];
      const take = Math.min(FRAME - filled, head.length - this.queueOffset);
      out.set(head.subarray(this.queueOffset, this.queueOffset + take), filled);
      filled += take;
      this.queueOffset += take;
      if (this.queueOffset >= head.length) {
        this.queue.shift();
        this.queueOffset = 0;
      }
    }
    this.queued = Math.max(0, this.queued - filled);
    return out;
  }

  private sendFrame(): void {
    if (this.closed) return;
    const frame = this.nextFrame();
    const playing = frame !== null;
    const payload = frame ? Buffer.from(this.encoder.encode(Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength), FRAME)) : this.silence;
    const header = new RtpHeader({
      payloadType: this.payloadType,
      sequenceNumber: this.seq,
      timestamp: this.ts >>> 0,
      marker: playing && !this.wasPlaying
    });
    this.seq = (this.seq + 1) & 0xffff;
    this.ts = (this.ts + FRAME) >>> 0;
    this.wasPlaying = playing;
    try {
      this.track.writeRtp(new RtpPacket(header, payload));
    } catch {
      /* transport not ready */
    }
    if (!this.playing) this.resolveDrain();
  }

  private resolveDrain(): void {
    const w = this.drainWaiters;
    this.drainWaiters = [];
    for (const r of w) r();
  }

  private finish(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.resolveDrain();
    for (const h of this.closeHandlers) {
      try {
        h(reason);
      } catch {
        /* ignore */
      }
    }
    try {
      this.encoder.delete();
      this.decoder.delete();
    } catch {
      /* ignore */
    }
  }
}

/** Opus payload type from the offer's `a=rtpmap:<pt> opus/48000/2` line. */
export function offeredOpusType(sdp: string): number | null {
  const m = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp);
  return m ? Number(m[1]) : null;
}

function waitGathering(pc: RTCPeerConnection, ms: number): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    const t = setTimeout(() => {
      sub.unSubscribe();
      resolve(); // use what we have
    }, ms);
    const sub = pc.iceGatheringStateChange.subscribe(state => {
      if (state === 'complete') {
        clearTimeout(t);
        sub.unSubscribe();
        resolve();
      }
    });
  });
}
