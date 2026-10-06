'use client';

import React from 'react';
import { QuickReply } from '@/types';

interface QuickReplyBarProps {
  quickReplies: QuickReply[];
  onSelectQuickReply: (qr: QuickReply) => void;
  onOpenTemplates: () => void;
  onOpenCatalog: () => void;
  onOpenGallery?: () => void;
}

export default function QuickReplyBar({
  quickReplies,
  onSelectQuickReply,
  onOpenTemplates,
  onOpenCatalog,
  onOpenGallery
}: QuickReplyBarProps) {
  return (
    <div className="qk">
      {quickReplies.slice(0, 5).map(q => (
        <button
          key={q.cmd}
          type="button"
          className="btn sm"
          title={q.t}
          onClick={() => onSelectQuickReply(q)}
        >
          {q.cmd}
          {q.att.length > 0 && (
            <span style={{ opacity: 0.6, marginLeft: '3px' }}>
              {q.att[0].type === 'image' ? '🖼' : q.att[0].type === 'voice' ? '🎙' : '📎'}
            </span>
          )}
        </button>
      ))}
      <button type="button" className="btn sm" onClick={onOpenTemplates}>
        ▤ Template
      </button>
      <button type="button" className="btn sm" onClick={onOpenCatalog}>
        ▣ Catalog
      </button>
      {onOpenGallery && (
        <button type="button" className="btn sm" onClick={onOpenGallery}>
          🖼 Gallery
        </button>
      )}
    </div>
  );
}

