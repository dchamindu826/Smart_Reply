'use client';

import React from 'react';
import { QuickReply, Attachment } from '@/types';
import QuickReplyBar from './QuickReplyBar';
import AttachmentPreview from './AttachmentPreview';
import MessageInput from './MessageInput';

interface ChatComposerProps {
  quickReplies: QuickReply[];
  onSelectQuickReply: (qr: QuickReply) => void;
  onOpenTemplates: () => void;
  onOpenCatalog: () => void;
  onOpenGallery?: () => void;
  pendingAttachments: Attachment[];
  onRemoveAttachment: (idx: number) => void;
  inputText: string;
  onInputChange: (val: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  isNoteMode: boolean;
  onToggleNoteMode: () => void;
  isWindowOpen: boolean;
  isRecording: boolean;
  onToggleRecording: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  activeContactName?: string;
}

export default function ChatComposer({
  quickReplies,
  onSelectQuickReply,
  onOpenTemplates,
  onOpenCatalog,
  onOpenGallery,
  pendingAttachments,
  onRemoveAttachment,
  inputText,
  onInputChange,
  onSubmit,
  isNoteMode,
  onToggleNoteMode,
  isWindowOpen,
  isRecording,
  onToggleRecording,
  onFileSelect,
  activeContactName
}: ChatComposerProps) {
  return (
    <div className={`cmp ${isNoteMode ? 'nmode' : ''}`}>
      <QuickReplyBar
        quickReplies={quickReplies}
        onSelectQuickReply={onSelectQuickReply}
        onOpenTemplates={onOpenTemplates}
        onOpenCatalog={onOpenCatalog}
        onOpenGallery={onOpenGallery}
      />


      <AttachmentPreview
        attachments={pendingAttachments}
        onRemove={onRemoveAttachment}
      />

      <MessageInput
        inputText={inputText}
        onInputChange={onInputChange}
        onSubmit={onSubmit}
        isNoteMode={isNoteMode}
        onToggleNoteMode={onToggleNoteMode}
        isWindowOpen={isWindowOpen}
        isRecording={isRecording}
        onToggleRecording={onToggleRecording}
        onFileSelect={onFileSelect}
        activeContactName={activeContactName}
      />
    </div>
  );
}
