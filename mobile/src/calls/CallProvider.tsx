import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { Alert, Vibration } from 'react-native';
import type { Call, MeResponse } from '@smart-reply/shared';
import { qk } from '@/features/keys';
import { api } from '@/lib/api';
import { errorCode, errorMessage } from '@/lib/errors';
import { useSocket } from '@/realtime/SocketProvider';
import { CallOverlay } from './CallOverlay';
import { callReducer, idleCall, isLive, type CallPeer, type CallState } from './state';
import { answerOffer, createOffer, loadInCallManager, type AudioSession } from './webrtc';

interface CallApi {
  state: CallState;
  startCall: (peer: CallPeer) => Promise<void>;
  answer: () => Promise<void>;
  decline: (messageText?: string) => Promise<void>;
  hangup: () => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  speakerAvailable: boolean;
}

const CallContext = createContext<CallApi | null>(null);

export function useCalls(): CallApi {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCalls outside CallProvider');
  return ctx;
}

const RING_PATTERN = [0, 900, 700];

export function CallProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { socket } = useSocket();
  const myId = qc.getQueryData<MeResponse>(qk.me)?.user.id ?? null;
  const [state, dispatch] = useReducer((s: CallState, a: Parameters<typeof callReducer>[1]) => callReducer(s, a, myId), idleCall);
  const stateRef = useRef(state);
  stateRef.current = state;
  const session = useRef<AudioSession | null>(null);
  /** `call.signal` may arrive before `POST /calls` answers; keep it until we know our call id. */
  const earlyAnswers = useRef(new Map<string, string>());

  const closeAudio = useCallback(() => {
    session.current?.close();
    session.current = null;
  }, []);

  const refreshCallLists = useCallback(() => {
    void qc.invalidateQueries({ queryKey: qk.calls });
    void qc.invalidateQueries({ queryKey: qk.myDashboard });
  }, [qc]);

  const applyAnswer = useCallback(async (sdp: string) => {
    const s = session.current;
    if (!s) return;
    try {
      await s.setRemoteAnswer(sdp);
      dispatch({ type: 'connected', at: Date.now() });
    } catch (err) {
      dispatch({ type: 'end', message: errorMessage(err) });
    }
  }, []);

  // Ring while an incoming call waits.
  useEffect(() => {
    if (state.phase !== 'incoming') return;
    Vibration.vibrate(RING_PATTERN, true);
    return () => Vibration.cancel();
  }, [state.phase]);

  // Close the screen shortly after a call ends.
  useEffect(() => {
    if (state.phase !== 'ended') return;
    closeAudio();
    refreshCallLists();
    const t = setTimeout(() => dispatch({ type: 'reset' }), 1800);
    return () => clearTimeout(t);
  }, [state.phase, closeAudio, refreshCallLists]);

  useEffect(() => {
    if (!socket) return;
    const onRinging = (p: { call: Call; sdpOffer: string | null }) => dispatch({ type: 'ringing', call: p.call, sdpOffer: p.sdpOffer });
    const onUpdated = ({ call }: { call: Call }) => dispatch({ type: 'updated', call });
    const onSignal = ({ callId, sdpAnswer }: { callId: string; sdpAnswer: string }) => {
      const cur = stateRef.current;
      if (cur.call?.id === callId) void applyAnswer(sdpAnswer);
      else if (cur.phase === 'dialing') earlyAnswers.current.set(callId, sdpAnswer);
    };
    socket.on('call.ringing', onRinging);
    socket.on('call.updated', onUpdated);
    socket.on('call.signal', onSignal);
    return () => {
      socket.off('call.ringing', onRinging);
      socket.off('call.updated', onUpdated);
      socket.off('call.signal', onSignal);
    };
  }, [socket, applyAnswer]);

  // Release the microphone if the provider goes away mid-call.
  useEffect(() => closeAudio, [closeAudio]);

  const askPermission = useCallback(
    (peer: CallPeer, message: string) => {
      Alert.alert('Permission needed', message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Ask permission',
          onPress: () => {
            api
              .post<unknown>(`/contacts/${peer.contactId}/call-permission-request`)
              .then(() => {
                void qc.invalidateQueries({ queryKey: qk.contact(peer.contactId) });
                Alert.alert('Request sent', `${peer.name} will get a message asking to allow calls.`);
              })
              .catch((e: unknown) => Alert.alert('Could not send the request', errorMessage(e)));
          }
        }
      ]);
    },
    [qc]
  );

  const startCall = useCallback(
    async (peer: CallPeer) => {
      if (isLive(stateRef.current)) return;
      dispatch({ type: 'dial', peer });
      try {
        const audio = await createOffer();
        session.current = audio;
        audio.onConnectionChange(s => {
          if (s === 'failed') dispatch({ type: 'end', message: 'Connection lost' });
        });
        const call = await api.post<Call>('/calls', { contactId: peer.contactId, sdpOffer: audio.localSdp });
        dispatch({ type: 'placed', call });
        refreshCallLists();
        const early = earlyAnswers.current.get(call.id);
        earlyAnswers.current.clear();
        if (early) await applyAnswer(early);
      } catch (err) {
        closeAudio();
        const code = errorCode(err);
        dispatch({ type: 'reset' });
        if (code === 'CALL_PERMISSION_MISSING') askPermission(peer, errorMessage(err));
        else if (code === 'CALLING_NOT_ENABLED') Alert.alert('Calling is not enabled', errorMessage(err));
        else Alert.alert('Could not start the call', errorMessage(err));
      }
    },
    [applyAnswer, askPermission, closeAudio, refreshCallLists]
  );

  const answer = useCallback(async () => {
    const cur = stateRef.current;
    if (cur.phase !== 'incoming' || !cur.call || !cur.sdpOffer) return;
    Vibration.cancel();
    dispatch({ type: 'answering' });
    try {
      const audio = await answerOffer(cur.sdpOffer);
      session.current = audio;
      audio.onConnectionChange(s => {
        if (s === 'failed') dispatch({ type: 'end', message: 'Connection lost' });
      });
      await api.post<unknown>(`/calls/${cur.call.id}/answer`, { sdpAnswer: audio.localSdp });
      dispatch({ type: 'connected', at: Date.now() });
    } catch (err) {
      closeAudio();
      dispatch({ type: 'end', message: errorMessage(err) });
    }
  }, [closeAudio]);

  const decline = useCallback(async (messageText?: string) => {
    const cur = stateRef.current;
    if (!cur.call) return;
    Vibration.cancel();
    dispatch({ type: 'end', message: messageText ? 'Declined with a message' : 'Declined' });
    try {
      await api.post<unknown>(`/calls/${cur.call.id}/decline`, messageText ? { messageText } : {});
    } catch (err) {
      Alert.alert('Could not decline', errorMessage(err));
    }
  }, []);

  const hangup = useCallback(async () => {
    const cur = stateRef.current;
    closeAudio();
    dispatch({ type: 'end', message: 'Call ended' });
    if (!cur.call) return;
    try {
      await api.post<unknown>(`/calls/${cur.call.id}/hangup`);
    } catch {
      // The call may already be over on the server.
    }
  }, [closeAudio]);

  const toggleMute = useCallback(() => {
    const muted = !stateRef.current.muted;
    session.current?.setMuted(muted);
    dispatch({ type: 'mute', muted });
  }, []);

  const toggleSpeaker = useCallback(() => {
    const on = !stateRef.current.speaker;
    session.current?.setSpeaker(on);
    dispatch({ type: 'speaker', on });
  }, []);

  const speakerAvailable = loadInCallManager() !== null;
  const value = useMemo<CallApi>(
    () => ({ state, startCall, answer, decline, hangup, toggleMute, toggleSpeaker, speakerAvailable }),
    [state, startCall, answer, decline, hangup, toggleMute, toggleSpeaker, speakerAvailable]
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      <CallOverlay />
    </CallContext.Provider>
  );
}
