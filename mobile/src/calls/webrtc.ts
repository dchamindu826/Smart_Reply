/**
 * WhatsApp Business Calling, Stage A: the phone holds the audio leg with WebRTC.
 * `react-native-webrtc` is a native module, so it exists only in a development or store build,
 * never in Expo Go. Everything here checks for it first.
 */
import { NativeModules, Platform } from 'react-native';
import type * as WebRTC from 'react-native-webrtc';

type WebRTCModule = typeof WebRTC;
type PeerConnection = InstanceType<WebRTCModule['RTCPeerConnection']>;
type Stream = Awaited<ReturnType<WebRTCModule['mediaDevices']['getUserMedia']>>;

interface InCallManagerLike {
  start(setup?: { media?: 'audio' | 'video'; auto?: boolean }): void;
  stop(): void;
  setSpeakerphoneOn(on: boolean): void;
  setForceSpeakerphoneOn(on: boolean): void;
}

let webrtc: WebRTCModule | null | undefined;
let incall: InCallManagerLike | null | undefined;

export const CALLS_NEED_DEV_BUILD =
  'Calls need the Smart Reply app built with EAS (development or store build). They do not work in Expo Go.';

export function loadWebRTC(): WebRTCModule | null {
  if (webrtc !== undefined) return webrtc;
  if (Platform.OS === 'web' || !NativeModules.WebRTCModule) {
    webrtc = null;
    return webrtc;
  }
  try {
    webrtc = require('react-native-webrtc') as WebRTCModule;
  } catch {
    webrtc = null;
  }
  return webrtc;
}

export function callingAvailable(): boolean {
  return loadWebRTC() !== null;
}

/** Optional audio routing (speaker, proximity). Missing in Expo Go and on web. */
export function loadInCallManager(): InCallManagerLike | null {
  if (incall !== undefined) return incall;
  if (!NativeModules.InCallManager) {
    incall = null;
    return incall;
  }
  try {
    const mod = require('react-native-incall-manager') as { default: InCallManagerLike };
    incall = mod.default;
  } catch {
    incall = null;
  }
  return incall;
}

/** The typings of `event-target-shim` do not resolve under bundler resolution; this is the part we use. */
interface Listenable {
  addEventListener(type: string, fn: (e: { candidate?: unknown }) => void): void;
  removeEventListener(type: string, fn: (e: { candidate?: unknown }) => void): void;
}
const events = (pc: PeerConnection) => pc as unknown as Listenable;

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
/** Meta needs every candidate inside the SDP (no trickle). Stop waiting after this long. */
const ICE_GATHER_TIMEOUT_MS = 6000;

function waitForIceGathering(pc: PeerConnection, timeoutMs = ICE_GATHER_TIMEOUT_MS): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      events(pc).removeEventListener('icegatheringstatechange', onState);
      events(pc).removeEventListener('icecandidate', onCandidate);
      resolve();
    };
    const onState = () => {
      if (pc.iceGatheringState === 'complete') finish();
    };
    const onCandidate = (e: { candidate?: unknown }) => {
      if (!e.candidate) finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    events(pc).addEventListener('icegatheringstatechange', onState);
    events(pc).addEventListener('icecandidate', onCandidate);
  });
}

export interface AudioSession {
  /** The local SDP with all ICE candidates. */
  localSdp: string;
  setRemoteAnswer(sdp: string): Promise<void>;
  setMuted(muted: boolean): void;
  setSpeaker(on: boolean): void;
  onConnectionChange(fn: (state: 'connected' | 'failed' | 'closed') => void): void;
  close(): void;
}

function createSession(rtc: WebRTCModule, pc: PeerConnection, stream: Stream, localSdp: string): AudioSession {
  const audio = loadInCallManager();
  audio?.start({ media: 'audio' });
  let closed = false;
  return {
    localSdp,
    async setRemoteAnswer(sdp) {
      await pc.setRemoteDescription(new rtc.RTCSessionDescription({ type: 'answer', sdp }));
    },
    setMuted(muted) {
      stream.getAudioTracks().forEach(t => {
        t.enabled = !muted;
      });
    },
    setSpeaker(on) {
      audio?.setForceSpeakerphoneOn(on);
      audio?.setSpeakerphoneOn(on);
    },
    onConnectionChange(fn) {
      events(pc).addEventListener('connectionstatechange', () => {
        const s = pc.connectionState;
        if (s === 'connected') fn('connected');
        else if (s === 'failed') fn('failed');
        else if (s === 'closed') fn('closed');
      });
    },
    close() {
      if (closed) return;
      closed = true;
      stream.getTracks().forEach(t => t.stop());
      try {
        pc.close();
      } catch {
        // already closed
      }
      audio?.stop();
    }
  };
}

async function openMicrophone(rtc: WebRTCModule): Promise<Stream> {
  try {
    return await rtc.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch {
    throw new Error('Allow microphone access for Smart Reply in your phone settings to take calls.');
  }
}

function requireWebRTC(): WebRTCModule {
  const rtc = loadWebRTC();
  if (!rtc) throw new Error(CALLS_NEED_DEV_BUILD);
  return rtc;
}

/** Incoming call: answer the customer's offer. */
export async function answerOffer(sdpOffer: string): Promise<AudioSession> {
  const rtc = requireWebRTC();
  const pc = new rtc.RTCPeerConnection({ iceServers: ICE_SERVERS });
  let stream: Stream | null = null;
  try {
    await pc.setRemoteDescription(new rtc.RTCSessionDescription({ type: 'offer', sdp: sdpOffer }));
    stream = await openMicrophone(rtc);
    stream.getTracks().forEach(t => pc.addTrack(t, stream as Stream));
    const answer: { type: string; sdp: string } = await pc.createAnswer();
    await pc.setLocalDescription(new rtc.RTCSessionDescription({ type: 'answer', sdp: answer.sdp }));
    await waitForIceGathering(pc);
    const sdp = pc.localDescription?.sdp;
    if (!sdp) throw new Error('Could not prepare the call audio.');
    return createSession(rtc, pc, stream, sdp);
  } catch (err) {
    stream?.getTracks().forEach(t => t.stop());
    pc.close();
    throw err;
  }
}

/** Outgoing call: build an offer to send with `POST /calls`. */
export async function createOffer(): Promise<AudioSession> {
  const rtc = requireWebRTC();
  const pc = new rtc.RTCPeerConnection({ iceServers: ICE_SERVERS });
  let stream: Stream | null = null;
  try {
    stream = await openMicrophone(rtc);
    stream.getTracks().forEach(t => pc.addTrack(t, stream as Stream));
    const offer: { type: string; sdp: string } = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(new rtc.RTCSessionDescription({ type: 'offer', sdp: offer.sdp }));
    await waitForIceGathering(pc);
    const sdp = pc.localDescription?.sdp;
    if (!sdp) throw new Error('Could not prepare the call audio.');
    return createSession(rtc, pc, stream, sdp);
  } catch (err) {
    stream?.getTracks().forEach(t => t.stop());
    pc.close();
    throw err;
  }
}
