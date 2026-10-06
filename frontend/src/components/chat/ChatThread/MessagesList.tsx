'use client';

import React from 'react';
import { Message } from '@/types';
import MessageBubble from './MessageBubble';

interface MessagesListProps {
  messages: Message[];
  endRef: React.RefObject<HTMLDivElement | null>;
}

export default function MessagesList({ messages, endRef }: MessagesListProps) {
  return (
    <div className="msgs" id="msgs">
      <span className="day">Today</span>
      {messages.map((msg, idx) => (
        <MessageBubble key={idx} message={msg} />
      ))}
      <div ref={endRef} />
    </div>
  );
}
