'use client';

import React from 'react';
import { Contact } from '@/types';

interface IncomingCallBannerProps {
  caller: Contact;
  ivrLabel?: string;
  onForward: () => void;
  onMessage: () => void;
  onDecline: () => void;
  onAnswer: () => void;
}

export default function IncomingCallBanner({
  caller,
  ivrLabel,
  onForward,
  onMessage,
  onDecline,
  onAnswer
}: IncomingCallBannerProps) {
  return (
    <div className="ring" id="ring">
      <i className={`av ${caller.a} md`}>{caller.i}</i>
      <div className="bd">
        <small>
          INCOMING WHATSAPP CALL · {ivrLabel || 'RINGING SALES QUEUE'}
        </small>
        <b>{caller.n}</b>
        <span>{caller.ph} · slide wardrobe inquiry</span>
      </div>
      <button type="button" className="btn gh" onClick={onForward}>
        ⇄ Forward
      </button>
      <button type="button" className="btn gh" onClick={onMessage}>
        ✉ Message
      </button>
      <button type="button" className="btn no" onClick={onDecline}>
        Decline
      </button>
      <button type="button" className="btn yes" onClick={onAnswer}>
        Answer
      </button>
    </div>
  );
}
