/**
 * Browser side of WhatsApp calling (Stage A): the agent's browser is the WebRTC peer and the
 * API relays SDP to Meta. Meta expects ICE candidates inside the SDP (no trickle), so every
 * local description waits for ICE gathering to finish.
 */

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
const GATHER_TIMEOUT_MS = 4000;

export interface CallPeer {
  pc: RTCPeerConnection;
  local: MediaStream;
  audio: HTMLAudioElement;
  close: () => void;
  setMuted: (muted: boolean) => void;
}

function waitForIce(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === 'complete') done();
    };
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(done, GATHER_TIMEOUT_MS);
  });
}

async function createPeer(): Promise<CallPeer> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot use the microphone. Use Chrome, Edge or Firefox over HTTPS.');
  const local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  for (const track of local.getAudioTracks()) pc.addTrack(track, local);
  const audio = document.createElement('audio');
  audio.autoplay = true;
  audio.style.display = 'none';
  document.body.appendChild(audio);
  pc.ontrack = e => {
    audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
    void audio.play().catch(() => undefined);
  };
  return {
    pc,
    local,
    audio,
    close: () => {
      for (const t of local.getTracks()) t.stop();
      pc.close();
      audio.srcObject = null;
      audio.remove();
    },
    setMuted: muted => {
      for (const t of local.getAudioTracks()) t.enabled = !muted;
    }
  };
}

/** Incoming call: take Meta's offer, return our answer SDP with candidates. */
export async function answerOffer(sdpOffer: string): Promise<{ peer: CallPeer; sdpAnswer: string }> {
  const peer = await createPeer();
  try {
    await peer.pc.setRemoteDescription({ type: 'offer', sdp: sdpOffer });
    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    await waitForIce(peer.pc);
    return { peer, sdpAnswer: peer.pc.localDescription?.sdp ?? answer.sdp ?? '' };
  } catch (err) {
    peer.close();
    throw err;
  }
}

/** Outgoing call: make an offer for Meta. Call `applyAnswer` when the answer arrives. */
export async function createOffer(): Promise<{ peer: CallPeer; sdpOffer: string }> {
  const peer = await createPeer();
  try {
    const offer = await peer.pc.createOffer({ offerToReceiveAudio: true });
    await peer.pc.setLocalDescription(offer);
    await waitForIce(peer.pc);
    return { peer, sdpOffer: peer.pc.localDescription?.sdp ?? offer.sdp ?? '' };
  } catch (err) {
    peer.close();
    throw err;
  }
}

export async function applyAnswer(peer: CallPeer, sdpAnswer: string): Promise<void> {
  if (peer.pc.signalingState === 'have-local-offer') await peer.pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer });
}
