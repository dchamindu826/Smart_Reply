'use client';

import React from 'react';
import { Message } from '@/types';
import MessageAttachment from './MessageAttachment';

interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  // 1. Internal Team Note
  if (message.type === 'note') {
    return (
      <div className="nt">
        <b>Internal note · {message.sender || 'Team'} · customer can’t see</b>
        {message.attachments?.length ? (
          <div className="att">
            {message.attachments.map((att, aIdx) => (
              <MessageAttachment key={aIdx} attachment={att} />
            ))}
          </div>
        ) : null}
        {message.text}
      </div>
    );
  }

  // 2. System status notification
  if (message.dir === 'sys') {
    return (
      <div className={`sys ${message.text.includes('Missed') ? 'b' : ''}`}>
        {message.text} · {message.time}
      </div>
    );
  }

  // 3. Regular chat message (inbound or outbound)
  const isOut = message.dir === 'out';

  return (
    <div className={`bb ${isOut ? 'out' : 'in'}`}>
      {message.type === 'tpl' ? (
        <span className="tp">Template · {message.sender}</span>
      ) : isOut && message.sender ? (
        <span className="by">{message.sender}</span>
      ) : null}

      {/* Attachments rendering */}
      {message.attachments?.length ? (
        <div className="att">
          {message.attachments.map((att, aIdx) => (
            <MessageAttachment key={aIdx} attachment={att} />
          ))}
        </div>
      ) : null}

      {message.text}

      <span className="mt">
        {message.time}
        {isOut && <span className="rd">{message.read ? '✓✓' : '✓'}</span>}
      </span>

      {message.buttons && (
        <div className="bt">
          {message.buttons.map((bText, bIdx) => (
            <span key={bIdx}>{bText}</span>
          ))}
        </div>
      )}
    </div>
  );
}
