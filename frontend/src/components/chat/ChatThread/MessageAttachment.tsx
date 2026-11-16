'use client';

import React from 'react';
import { Attachment } from '@/types';
import { formatFileSize } from '@/lib/ui';

interface MessageAttachmentProps {
  attachment: Attachment;
}

export default function MessageAttachment({ attachment }: MessageAttachmentProps) {
  if (attachment.type === 'image') {
    return (
      <a className="att-img" href={attachment.url || undefined} target="_blank" rel="noreferrer">
        {attachment.url ? <img src={attachment.url} alt={attachment.name} loading="lazy" /> : null}
      </a>
    );
  }

  if (attachment.type === 'voice') {
    return (
      <span className="att-voice">
        <button
          type="button"
          className="pl"
          aria-label="Play voice message"
          onClick={e => {
            const p = e.currentTarget.parentNode as HTMLElement;
            const audio = p.querySelector('audio');
            if (!audio) return;
            if (audio.paused) {
              void audio.play();
              p.classList.add('play');
            } else {
              audio.pause();
              p.classList.remove('play');
            }
          }}
        >
          ▶
        </button>
        {attachment.url ? (
          <audio
            src={attachment.url}
            preload="none"
            onEnded={e => (e.currentTarget.parentNode as HTMLElement).classList.remove('play')}
          />
        ) : null}
        <span className="wave">
          {Array.from({ length: 22 }).map((_, wIdx) => (
            <i key={wIdx} style={{ height: `${6 + ((wIdx * 37) % 17)}px` }} />
          ))}
        </span>
        <small>{attachment.dur || ''}</small>
      </span>
    );
  }

  const ext = (attachment.name.split('.').pop() || 'FILE').toUpperCase().slice(0, 4);
  const extClass = /XLS|CSV/.test(ext) ? 'x' : /DOC|TXT/.test(ext) ? 'w' : '';

  if (attachment.mime?.startsWith('video/') && attachment.url) {
    return (
      <span className="att-img">
        <video src={attachment.url} controls preload="metadata" style={{ maxWidth: '100%', borderRadius: 6 }} />
      </span>
    );
  }

  return (
    <a className="att-file" href={attachment.url || undefined} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
      <span className={`ext ${extClass}`}>{ext}</span>
      <span>
        <b>{attachment.name}</b>
        <span>{formatFileSize(attachment.size)}</span>
      </span>
    </a>
  );
}
