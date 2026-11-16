'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Contact } from '@/types';
import {
  playRecordStartBeep,
  playTrashSound,
  playSentSound
} from '@/utils/soundEffects';

interface VoiceRecordingWidgetProps {
  contact: Contact;
  onSend: (durationStr: string, audio: Blob) => void;
  onCancel: () => void;
}

export default function VoiceRecordingWidget({
  contact,
  onSend,
  onCancel
}: VoiceRecordingWidgetProps) {
  const [seconds, setSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [waveBars, setWaveBars] = useState<number[]>(() =>
    Array.from({ length: 34 }, () => 6 + Math.floor(Math.random() * 12))
  );

  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Play start beep on mount
  useEffect(() => {
    playRecordStartBeep();
  }, []);

  // Timer interval
  useEffect(() => {
    if (isPaused || isClosing) return;

    const timer = setInterval(() => {
      setSeconds(s => s + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isPaused, isClosing]);

  // Record from the microphone. The waveform follows the real input level.
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const pausedRef = useRef(false);
  const [micError, setMicError] = useState('');
  pausedRef.current = isPaused;

  useEffect(() => {
    let cancelled = false;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMicError('This browser cannot record audio.');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then(stream => {
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        audioStreamRef.current = stream;
        const mime = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported(m));
        const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        recorder.ondataavailable = e => {
          if (e.data.size) chunksRef.current.push(e.data);
        };
        recorder.start(250);
        recorderRef.current = recorder;
        try {
          const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new AudioCtx();
          audioContextRef.current = ctx;
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          analyserRef.current = analyser;
          ctx.createMediaStreamSource(stream).connect(analyser);
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateMicWave = () => {
            if (!pausedRef.current) {
              analyser.getByteFrequencyData(dataArray);
              const newBars: number[] = [];
              for (let i = 0; i < 34; i++) {
                const val = dataArray[Math.floor((i / 34) * dataArray.length)] || 0;
                newBars.push(Math.max(5, Math.min(44, Math.floor((val / 255) * 44) + 4)));
              }
              setWaveBars(newBars);
            }
            animFrameRef.current = requestAnimationFrame(updateMicWave);
          };
          animFrameRef.current = requestAnimationFrame(updateMicWave);
        } catch {
          // The waveform is decoration; recording still works without it.
        }
      })
      .catch(() => setMicError('Microphone access was blocked. Allow the microphone in the browser and try again.'));

    return () => {
      cancelled = true;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
      audioStreamRef.current?.getTracks().forEach(t => t.stop());
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') audioContextRef.current.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const r = recorderRef.current;
    if (!r) return;
    if (isPaused && r.state === 'recording') r.pause();
    if (!isPaused && r.state === 'paused') r.resume();
  }, [isPaused]);

  /** Stop recording and hand back the audio file. */
  const finishRecording = (): Promise<Blob | null> =>
    new Promise(resolve => {
      const r = recorderRef.current;
      if (!r || r.state === 'inactive') {
        resolve(chunksRef.current.length ? new Blob(chunksRef.current, { type: r?.mimeType || 'audio/webm' }) : null);
        return;
      }
      r.onstop = () => resolve(new Blob(chunksRef.current, { type: r.mimeType || 'audio/webm' }));
      r.stop();
    });

  const handleDiscard = () => {
    setIsClosing(true);
    playTrashSound();
    setTimeout(() => {
      onCancel();
    }, 200);
  };

  const handleSend = () => {
    setIsClosing(true);
    const durStr = formatTime(Math.max(1, seconds));
    void finishRecording().then(blob => {
      if (!blob || blob.size === 0) {
        onCancel();
        return;
      }
      playSentSound();
      onSend(durStr, blob);
    });
  };

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="wa-voice-box"
      id="wa-voice-recording-widget"
      role="dialog"
      aria-label="Recording WhatsApp Voice Note"
      style={{
        transition: 'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
        opacity: isClosing ? 0 : 1,
        transform: isClosing ? 'translateY(24px) scale(0.95)' : 'translateY(0) scale(1)',
        pointerEvents: isClosing ? 'none' : 'auto'
      }}
    >
      {micError ? (
        <div style={{ padding: '8px 12px', color: '#ea0038', fontSize: '12.5px' }} role="alert">
          {micError}
        </div>
      ) : null}
      {/* Top Header */}
      <div className="wa-voice-header">
        <div className="wa-voice-brand">
          <span style={{ fontSize: '18px', color: '#00a884' }}>🎙</span>
          <span>WhatsApp Voice Studio</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            className="wa-voice-rec-badge"
            style={{
              color: isPaused ? '#f59e0b' : '#ea0038',
              backgroundColor: isPaused ? 'rgba(245, 158, 11, 0.14)' : 'rgba(234, 0, 56, 0.14)'
            }}
          >
            <span
              className="wa-voice-red-dot"
              style={{
                backgroundColor: isPaused ? '#f59e0b' : '#ea0038',
                animation: isPaused ? 'none' : undefined
              }}
            />
            {isPaused ? 'PAUSED' : 'REC · LIVE'}
          </div>

          <button
            type="button"
            className="wa-call-audio-toggle"
            title="Cancel recording"
            onClick={handleDiscard}
            style={{ fontSize: '16px', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="wa-voice-body">
        {/* Recipient Contact Avatar with Ripple */}
        <div className="wa-voice-avatar-wrap">
          {!isPaused && (
            <>
              <div className="wa-voice-ripple" />
              <div className="wa-voice-ripple r2" />
            </>
          )}
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: contact.a || '#00a884',
              color: '#ffffff',
              fontSize: '20px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
              border: '2px solid rgba(255, 255, 255, 0.2)'
            }}
          >
            {contact.i || contact.n.charAt(0)}
          </div>
        </div>

        {/* Contact Info Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div
            style={{
              fontSize: '15px',
              fontWeight: 700,
              color: '#e9edef',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <span>{contact.n}</span>
            <span
              style={{
                fontSize: '10.5px',
                padding: '1px 6px',
                borderRadius: '8px',
                background: 'rgba(0, 168, 132, 0.2)',
                color: '#00a884',
                fontWeight: 600
              }}
            >
              Direct
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#8696a0' }}>
            {contact.ph} · Recording voice message
          </div>
        </div>

        {/* Digital Live Monospace Timer */}
        <div className="wa-voice-timer">
          {formatTimer(seconds)}
        </div>

        {/* Dynamic Voice Waveform Equalizer */}
        <div className="wa-voice-waveform">
          {waveBars.map((height, idx) => (
            <div
              key={idx}
              className="wa-voice-bar"
              style={{
                height: `${height}px`,
                backgroundColor: isPaused
                  ? '#8696a0'
                  : idx % 3 === 0
                  ? '#00a884'
                  : idx % 2 === 0
                  ? '#25d366'
                  : '#06cf9c',
                opacity: isPaused ? 0.45 : 1
              }}
            />
          ))}
        </div>

        {/* Action Controls */}
        <div className="wa-voice-actions">
          {/* Trash / Discard Button */}
          <button
            type="button"
            className="wa-voice-btn-trash"
            title="Discard voice message (Trash)"
            onClick={handleDiscard}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
          </button>

          {/* Pause / Resume Button */}
          <button
            type="button"
            className="wa-voice-btn-pause"
            title={isPaused ? 'Resume recording' : 'Pause recording'}
            onClick={() => setIsPaused(p => !p)}
            style={{
              backgroundColor: isPaused ? 'rgba(0, 168, 132, 0.2)' : '#202c33',
              color: isPaused ? '#00a884' : '#e9edef'
            }}
          >
            {isPaused ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </svg>
            )}
          </button>

          {/* Send Button */}
          <button
            type="button"
            className="wa-voice-btn-send"
            title="Send WhatsApp voice message"
            onClick={handleSend}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
            <span>Send Note</span>
          </button>
        </div>
      </div>

      {/* Downward pointer arrow aimed right at the recording mic button */}
      <div className="wa-voice-box-arrow" />
    </div>
  );
}
