'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import {
  sounds,
  startCallRingtone,
  stopCallRingtone,
  playCallAnswerSound,
  playCallEndSound
} from '@/utils/soundEffects';

export default function IncomingCallWidget() {
  const {
    ringingCall,
    contacts,
    ivr,
    staff,
    answerIncomingCall,
    declineIncomingCall,
    forwardIncomingCall
  } = useApp();

  const [view, setView] = useState<'call' | 'message' | 'forward'>('call');
  const [customMsg, setCustomMsg] = useState('');
  const [isMuted, setIsMuted] = useState(sounds.getMuted());

  const caller = ringingCall ? contacts[ringingCall.c] : null;

  // Reset view when call changes
  useEffect(() => {
    if (ringingCall) {
      setView('call');
      setCustomMsg('');
    }
  }, [ringingCall]);

  // Page title flashing to prevent missing calls
  useEffect(() => {
    if (!ringingCall || !caller) return;
    const originalTitle = document.title;
    let flip = false;
    const titleInterval = setInterval(() => {
      document.title = flip ? `📞 (1) Incoming Call · ${caller.n}` : originalTitle;
      flip = !flip;
    }, 1200);

    return () => {
      clearInterval(titleInterval);
      document.title = originalTitle;
    };
  }, [ringingCall, caller]);

  // WhatsApp Incoming Call Ringtone loop
  useEffect(() => {
    if (!ringingCall || isMuted) {
      stopCallRingtone();
      return;
    }

    startCallRingtone(2500);

    return () => {
      stopCallRingtone();
    };
  }, [ringingCall, isMuted]);

  const handleToggleMute = () => {
    const nextMuted = sounds.toggleMuted();
    setIsMuted(nextMuted);
  };

  const handleAnswer = () => {
    stopCallRingtone();
    playCallAnswerSound();
    answerIncomingCall();
  };

  const handleDecline = (msg?: string) => {
    stopCallRingtone();
    playCallEndSound();
    declineIncomingCall(msg);
  };

  const handleForward = (dest: string) => {
    stopCallRingtone();
    playCallEndSound();
    forwardIncomingCall(dest);
  };

  if (!ringingCall || !caller) {
    return null;
  }

  const cannedMessages = [
    'Can’t talk right now. I’ll call you back in 10 minutes.',
    'I’m with a customer. Please send your question on WhatsApp.',
    'We’ll call you back within the hour.'
  ];

  const handleSendCustomMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customMsg.trim()) return;
    declineIncomingCall(customMsg.trim());
    setView('call');
  };

  const ivrText = ivr.on
    ? `IVR ${ivr.opts[0]?.k} · ${ivr.opts[0]?.t.toUpperCase()}`
    : 'SALES QUEUE';

  return (
    <div
      className="wa-call-box"
      id="wa-incoming-call-box"
      role="dialog"
      aria-label="Incoming WhatsApp Call"
      aria-live="assertive"
    >
      {/* Top Brand Header */}
      <div className="wa-call-box-header">
        <div className="wa-call-box-brand">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="#25D366">
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19.01L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.8 13.47 3.8 11.91C3.81 7.37 7.5 3.67 12.05 3.67M9.22 7.59C9.04 7.59 8.75 7.66 8.5 7.93C8.25 8.2 7.55 8.85 7.55 10.18C7.55 11.51 8.52 12.79 8.66 12.98C8.8 13.17 10.57 15.9 13.33 16.97C15.62 17.86 16.09 17.68 16.59 17.64C17.09 17.59 18.21 16.98 18.44 16.33C18.67 15.68 18.67 15.13 18.6 15.01C18.53 14.89 18.34 14.82 18.06 14.68C17.78 14.54 16.42 13.87 16.16 13.78C15.9 13.69 15.72 13.64 15.53 13.92C15.34 14.2 14.81 14.82 14.65 15.01C14.49 15.2 14.33 15.22 14.05 15.08C13.77 14.94 12.87 14.65 11.8 13.7C10.97 12.96 10.41 12.05 10.25 11.77C10.09 11.49 10.23 11.34 10.37 11.2C10.5 11.08 10.66 10.87 10.8 10.71C10.94 10.55 10.99 10.43 11.08 10.25C11.17 10.06 11.12 9.9 11.05 9.76C10.98 9.62 10.42 8.25 10.19 7.69C9.96 7.15 9.73 7.22 9.56 7.21C9.4 7.21 9.22 7.59 9.22 7.59Z" />
          </svg>
          <span>WhatsApp Audio Call</span>
        </div>

        <div className="wa-call-box-meta">
          <div className="wa-call-box-badge">
            <span className="wa-call-pulse-dot" />
            <span>Ringing</span>
          </div>

          <button
            type="button"
            className="wa-call-audio-toggle"
            onClick={handleToggleMute}
            title={isMuted ? 'Unmute Ringtone' : 'Mute Ringtone'}
            aria-label={isMuted ? 'Unmute Ringtone' : 'Mute Ringtone'}
          >
            {isMuted ? (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Main View: Incoming Call Details */}
      {view === 'call' && (
        <div className="wa-call-box-body">
          <div className="wa-call-caller-row">
            {/* Pulsing Avatar with Wave Ripples */}
            <div className="wa-call-avatar-container">
              <span className="wa-call-wave" />
              <span className="wa-call-wave w2" />
              <div className={`wa-call-avatar-circle av ${caller.a}`}>
                {caller.i}
              </div>
            </div>

            {/* Caller Details */}
            <div className="wa-call-caller-info">
              <div className="wa-call-ivr-tag">
                {ivrText}
              </div>
              <div className="wa-call-name" title={caller.n}>
                {caller.n}
              </div>
              <div className="wa-call-phone">
                {caller.ph}
              </div>
              <div className="wa-call-context-pill" title={`${caller.city} · slide wardrobe inquiry`}>
                {caller.city} · slide wardrobe inquiry
              </div>
            </div>
          </div>

          {/* Secondary Sub-actions (Message & Forward) */}
          <div className="wa-call-sub-toolbar">
            <button
              type="button"
              className="wa-call-sub-btn"
              onClick={() => setView('message')}
              title="Decline and reply with a quick WhatsApp message"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
              </svg>
              <span>Message</span>
            </button>

            <button
              type="button"
              className="wa-call-sub-btn"
              onClick={() => setView('forward')}
              title="Forward or transfer this call"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
              </svg>
              <span>Forward</span>
            </button>
          </div>

          {/* Primary Action Buttons (Decline & Answer) */}
          <div className="wa-call-main-actions">
            <button
              type="button"
              className="wa-call-action-btn decline"
              onClick={() => handleDecline()}
              id="wa-call-decline-btn"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.99.99 0 0 1 0-1.41C2.7 9.4 6.94 8 12 8s9.3 1.4 11.71 3.67c.39.39.39 1.02 0 1.41l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85a.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
              </svg>
              <span>Decline</span>
            </button>

            <button
              type="button"
              className="wa-call-action-btn answer"
              onClick={handleAnswer}
              id="wa-call-answer-btn"
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-2.2 2.2a15.045 15.045 0 0 1-6.59-6.59l2.2-2.21a.96.96 0 0 0 .25-1.01A11.36 11.36 0 0 1 8.57 3.9c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.52c0-.55-.45-1-.99-1z" />
              </svg>
              <span>Answer</span>
            </button>
          </div>
        </div>
      )}

      {/* Sub-view: Decline with Message */}
      {view === 'message' && (
        <div className="wa-call-subpanel">
          <div className="wa-call-subpanel-header">
            <div className="wa-call-subpanel-title">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="#00a884">
                <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
              </svg>
              <span>Quick WhatsApp Reply</span>
            </div>
            <button
              type="button"
              className="wa-call-subpanel-back"
              onClick={() => setView('call')}
            >
              ← Back
            </button>
          </div>

          <div style={{ fontSize: '11.5px', color: '#8696a0' }}>
            Call will be declined and message sent to {caller.n.split(' ')[0]} instantly:
          </div>

          {cannedMessages.map((text, idx) => (
            <div
              key={idx}
              className="wa-call-msg-item"
              onClick={() => handleDecline(text)}
            >
              <span>{text}</span>
              <button type="button" className="wa-call-msg-send-btn">
                Send
              </button>
            </div>
          ))}

          <form onSubmit={handleSendCustomMessage} className="wa-call-custom-msg">
            <input
              type="text"
              className="wa-call-custom-input"
              placeholder="Type custom reply..."
              value={customMsg}
              onChange={e => setCustomMsg(e.target.value)}
              autoFocus
            />
            <button
              type="submit"
              className="wa-call-custom-send"
              disabled={!customMsg.trim()}
            >
              Send
            </button>
          </form>
        </div>
      )}

      {/* Sub-view: Forward / Transfer */}
      {view === 'forward' && (
        <div className="wa-call-subpanel">
          <div className="wa-call-subpanel-header">
            <div className="wa-call-subpanel-title">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="#00a884">
                <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
              </svg>
              <span>Forward Incoming Call</span>
            </div>
            <button
              type="button"
              className="wa-call-subpanel-back"
              onClick={() => setView('call')}
            >
              ← Back
            </button>
          </div>

          <div style={{ fontSize: '11.5px', color: '#8696a0' }}>
            Route call while staying free for other inquiries:
          </div>

          {/* Sales Queue */}
          <div
            className="wa-call-fwd-item"
            onClick={() => handleForward('queue')}
          >
            <div className="wa-call-fwd-info">
              <div style={{ fontWeight: 600, fontSize: '13px', color: '#e9edef' }}>
                Sales Queue
              </div>
              <span style={{ fontSize: '11px', color: '#8696a0' }}>
                Ring all available agents
              </span>
            </div>
            <span className="wa-call-fwd-badge">Queue</span>
          </div>

          {/* Staff Members */}
          {staff.map(s => {
            const isOff = /brk|away|dnd/.test(s.call.st);
            return (
              <div
                key={s.id}
                className="wa-call-fwd-item"
                onClick={() => !isOff && handleForward(s.id)}
                style={{ opacity: isOff ? 0.6 : 1, cursor: isOff ? 'not-allowed' : 'pointer' }}
              >
                <div className="wa-call-fwd-info">
                  <i className={`av st ${s.st}`} style={{ width: '28px', height: '28px', fontSize: '11px' }}>
                    {s.i}
                  </i>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '12.5px', color: '#e9edef' }}>
                      {s.n}
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#8696a0' }}>
                      {s.stt}
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: isOff ? '#f15c6d' : '#00a884',
                    background: isOff ? 'rgba(241, 92, 109, 0.12)' : 'rgba(0, 168, 132, 0.12)',
                    padding: '2px 7px',
                    borderRadius: '6px'
                  }}
                >
                  {isOff ? 'Unavailable' : 'Transfer'}
                </span>
              </div>
            );
          })}

          {/* Voice note request */}
          <div
            className="wa-call-fwd-item"
            onClick={() => handleForward('vm')}
          >
            <div className="wa-call-fwd-info">
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#e9edef' }}>
                  Ask for Voice Note
                </div>
                <span style={{ fontSize: '11px', color: '#8696a0' }}>
                  Auto-replies asking caller to record audio
                </span>
              </div>
            </div>
            <span className="wa-call-fwd-badge">Voice Note</span>
          </div>
        </div>
      )}
    </div>
  );
}
