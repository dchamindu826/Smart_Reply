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
  onSend: (durationStr: string) => void;
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

  // Audio mic input or animated waveform fallback
  useEffect(() => {
    if (isClosing) return;

    let isUsingMic = false;

    // Try acquiring real microphone stream
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then(stream => {
          audioStreamRef.current = stream;
          try {
            const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            const ctx = new AudioCtx();
            audioContextRef.current = ctx;
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64;
            analyserRef.current = analyser;

            const source = ctx.createMediaStreamSource(stream);
            source.connect(analyser);
            isUsingMic = true;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const updateMicWave = () => {
              if (isPaused) {
                animFrameRef.current = requestAnimationFrame(updateMicWave);
                return;
              }

              analyser.getByteFrequencyData(dataArray);

              const newBars: number[] = [];
              for (let i = 0; i < 34; i++) {
                const sampleIdx = Math.floor((i / 34) * dataArray.length);
                const val = dataArray[sampleIdx] || 0;
                // Scale value between 4px and 44px
                const height = Math.max(5, Math.min(44, Math.floor((val / 255) * 44) + 4));
                newBars.push(height);
              }
              setWaveBars(newBars);
              animFrameRef.current = requestAnimationFrame(updateMicWave);
            };

            animFrameRef.current = requestAnimationFrame(updateMicWave);
          } catch {
            // Web Audio fallback
          }
        })
        .catch(() => {
          // Fallback to simulation if mic access denied
        });
    }

    // Fallback simulation timer if mic is not active
    const simInterval = setInterval(() => {
      if (!isUsingMic && !isPaused) {
        setWaveBars(
          Array.from({ length: 34 }, (_, idx) => {
            const base = Math.sin(idx * 0.4 + Date.now() / 250);
            const rand = Math.random() * 0.6;
            const h = Math.max(6, Math.floor((base + 1.2 + rand) * 11));
            return Math.min(44, h);
          })
        );
      }
    }, 90);

    return () => {
      clearInterval(simInterval);
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [isPaused, isClosing]);

  const handleDiscard = () => {
    setIsClosing(true);
    playTrashSound();
    setTimeout(() => {
      onCancel();
    }, 200);
  };

  const handleSend = () => {
    setIsClosing(true);
    playSentSound();
    const durStr = formatTime(Math.max(1, seconds));
    setTimeout(() => {
      onSend(durStr);
    }, 200);
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
