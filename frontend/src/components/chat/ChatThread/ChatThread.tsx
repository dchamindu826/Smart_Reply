'use client';

import React from 'react';
import { Conversation, Contact, QuickReply, Attachment } from '@/types';
import ThreadHeader from './ThreadHeader';
import MessagesList from './MessagesList';
import ChatComposer from '../ChatComposer/ChatComposer';

interface ChatThreadProps {
  conversation?: Conversation;
  contact?: Contact | null;
  onCall: () => void;
  onResolve: () => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  // Composer props
  quickReplies: QuickReply[];
  onSelectQuickReply: (qr: QuickReply) => void;
  onOpenTemplates: () => void;
  onOpenCatalog: () => void;
  pendingAttachments: Attachment[];
  onRemoveAttachment: (idx: number) => void;
  inputText: string;
  onInputChange: (val: string) => void;
  onSubmit: (e?: React.FormEvent) => void;
  isNoteMode: boolean;
  onToggleNoteMode: () => void;
  isRecording: boolean;
  onToggleRecording: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function ChatThread({
  conversation,
  contact,
  onCall,
  onResolve,
  messagesEndRef,
  quickReplies,
  onSelectQuickReply,
  onOpenTemplates,
  onOpenCatalog,
  pendingAttachments,
  onRemoveAttachment,
  inputText,
  onInputChange,
  onSubmit,
  isNoteMode,
  onToggleNoteMode,
  isRecording,
  onToggleRecording,
  onFileSelect
}: ChatThreadProps) {
  if (!conversation || !contact) {
    return (
      <section className="ib-t">
        <div className="empty">
          <b>Select a conversation</b>
          Choose a customer from the left list.
        </div>
      </section>
    );
  }

  const isWindowOpen = conversation.exp ? conversation.exp - Date.now() > 0 : false;

  return (
    <section className="ib-t">
      <ThreadHeader
        contact={contact}
        conv={conversation}
        onCall={onCall}
        onResolve={onResolve}
      />

      <MessagesList
        messages={conversation.msgs}
        endRef={messagesEndRef}
      />

      <ChatComposer
        quickReplies={quickReplies}
        onSelectQuickReply={onSelectQuickReply}
        onOpenTemplates={onOpenTemplates}
        onOpenCatalog={onOpenCatalog}
        pendingAttachments={pendingAttachments}
        onRemoveAttachment={onRemoveAttachment}
        inputText={inputText}
        onInputChange={onInputChange}
        onSubmit={onSubmit}
        isNoteMode={isNoteMode}
        onToggleNoteMode={onToggleNoteMode}
        isWindowOpen={isWindowOpen}
        isRecording={isRecording}
        onToggleRecording={onToggleRecording}
        onFileSelect={onFileSelect}
        activeContactName={contact.n}
      />
    </section>
  );
}
