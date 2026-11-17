'use client';

import React from 'react';
import { QuickReply } from '@/types';
import { MessageTemplatesIcon, CatalogIcon, MediaGalleryIcon, MicIcon, PaperclipIcon } from '@/components/common/Icons';

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
            <span style={{ opacity: 0.7, marginLeft: '4px', display: 'inline-flex', verticalAlign: 'middle' }}>
              {q.att[0].type === 'image' ? <MediaGalleryIcon size={13} /> : q.att[0].type === 'voice' ? <MicIcon size={13} /> : <PaperclipIcon size={13} />}
            </span>
          )}
        </button>
      ))}
      <button type="button" className="btn sm" onClick={onOpenTemplates} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
        <MessageTemplatesIcon size={14} />
        <span>Template</span>
      </button>
      <button type="button" className="btn sm" onClick={onOpenCatalog} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
        <CatalogIcon size={14} />
        <span>Catalog</span>
      </button>
      {onOpenGallery && (
        <button type="button" className="btn sm" onClick={onOpenGallery} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
          <MediaGalleryIcon size={14} />
          <span>Gallery</span>
        </button>
      )}
    </div>
  );
}

