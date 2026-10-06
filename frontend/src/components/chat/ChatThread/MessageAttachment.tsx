'use client';

import React from 'react';
import { Attachment } from '@/types';
import { formatFileSize } from '@/data/mockData';

interface MessageAttachmentProps {
  attachment: Attachment;
}

export default function MessageAttachment({ attachment }: MessageAttachmentProps) {
  if (attachment.type === 'image') {
    return (
      <span className="att-img">
        <img src={attachment.url || ''} alt={attachment.name} />
      </span>
    );
  }

  if (attachment.type === 'voice') {
    return (
      <span className="att-voice">
        <button
          type="button"
          className="pl"
          onClick={e => {
            const p = e.currentTarget.parentNode as HTMLElement;
            p?.classList.toggle('play');
          }}
        >
          ▶
        </button>
        <span className="wave">
          {Array.from({ length: 22 }).map((_, wIdx) => (
            <i key={wIdx} style={{ height: `${6 + ((wIdx * 37) % 17)}px` }} />
          ))}
        </span>
        <small>{attachment.dur || '0:14'}</small>
      </span>
    );
  }

  const ext = (attachment.name.split('.').pop() || 'FILE').toUpperCase().slice(0, 4);
  const extClass = /XLS|CSV/.test(ext) ? 'x' : /DOC|TXT/.test(ext) ? 'w' : '';

  return (
    <span className="att-file">
      <span className={`ext ${extClass}`}>{ext}</span>
      <span>
        <b>{attachment.name}</b>
        <span>{formatFileSize(attachment.size)}</span>
      </span>
    </span>
  );
}
