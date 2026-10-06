'use client';

import React from 'react';
import { Attachment } from '@/types';
import { formatFileSize } from '@/data/mockData';

interface AttachmentPreviewProps {
  attachments: Attachment[];
  onRemove: (index: number) => void;
}

export default function AttachmentPreview({
  attachments,
  onRemove
}: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="pend">
      <div className="att">
        {attachments.map((att, idx) => (
          <div key={idx} style={{ position: 'relative' }}>
            {att.type === 'image' ? (
              <span className="att-img">
                <img src={att.url} alt={att.name} />
              </span>
            ) : att.type === 'voice' ? (
              <span className="att-voice">
                <span className="pl">▶</span>
                <small>{att.dur || '0:14'}</small>
              </span>
            ) : (
              <span className="att-file">
                <span className="ext">{(att.name.split('.').pop() || 'FILE').toUpperCase()}</span>
                <span>
                  <b>{att.name}</b>
                  <span>{formatFileSize(att.size)}</span>
                </span>
              </span>
            )}
            <button
              type="button"
              className="rm"
              onClick={() => onRemove(idx)}
              aria-label="Remove attachment"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
