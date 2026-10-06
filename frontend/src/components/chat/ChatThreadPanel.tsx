'use client';

import React, { useRef, useEffect } from 'react';
import { Conversation, Contact, QuickReply, Attachment } from '@/types';
import { getWinClass, getWinText } from '@/utils/windowTime';
import MessageAttachment from './ChatThread/MessageAttachment';
import VoiceRecordingWidget from '@/components/modals/VoiceRecordingWidget';
import { useApp } from '@/context/AppContext';

interface ChatThreadPanelProps {
  conversation?: Conversation;
  contact?: Contact | null;
  onCall: () => void;
  onResolve: () => void;
  onToggleContactInfo: () => void;
  contactInfoOpen: boolean;
  // Composer props
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
  isRecording: boolean;
  onToggleRecording: () => void;
  onVoiceSend?: (durStr: string) => void;
  onVoiceCancel?: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function ChatThreadPanel({
  conversation,
  contact,
  onCall,
  onResolve,
  onToggleContactInfo,
  contactInfoOpen,
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
  isRecording,
  onToggleRecording,
  onVoiceSend,
  onVoiceCancel,
  onFileSelect
}: ChatThreadPanelProps) {
  const { simulateCustomerReply, addToast } = useApp();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation?.msgs]);

  if (!conversation || !contact) {
    return (
      <main className="wa-col-thread" style={{ display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div style={{ color: 'var(--wa-secondary-text)', maxWidth: '320px', padding: '20px' }}>
          <div style={{ fontSize: '54px', marginBottom: '12px' }}>💬</div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--wa-primary-text)' }}>
            WhatsApp Web
          </h2>
          <p style={{ fontSize: '13.5px', marginTop: '6px', lineHeight: 1.5 }}>
            Select a conversation on the left to start chatting, send quotations, or place voice calls.
          </p>
        </div>
      </main>
    );
  }

  const isWindowOpen = conversation.exp ? conversation.exp - Date.now() > 0 : false;
  const winClass = getWinClass(conversation.exp);
  const winText = getWinText(conversation.exp);

  return (
    <main className="wa-col-thread">
      {/* 1. Header (Matching WhatsApp Web Top Bar) */}
      <div className="wa-header">
        <div className="wa-user-meta" onClick={onToggleContactInfo} style={{ cursor: 'pointer' }}>
          <div className={`wa-user-avatar av ${contact.a} md`}>
            {contact.i}
          </div>
          <div>
            <div className="wa-user-name">{contact.n}</div>
            <div className="wa-user-sub">
              <span className={`wt ${winClass}`} style={{ fontSize: '11px', padding: '1px 5px', borderRadius: '4px' }}>
                ◷ {winText}
              </span>
              <span>{isWindowOpen ? '· Free replies window open' : '· Approved templates only'}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="wa-header-test-btn"
            onClick={() => simulateCustomerReply(conversation.id)}
            style={{
              borderRadius: '20px',
              padding: '5px 13px',
              background: '#00a884',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 600,
              fontSize: '12.5px',
              boxShadow: '0 2px 8px rgba(0, 168, 132, 0.4)',
              transition: 'all 0.15s ease'
            }}
            title="Simulate incoming customer WhatsApp reply to test notification sound"
            id="test-reply-header-btn"
          >
            <span>💬</span> Test Reply
          </button>
          <button
            type="button"
            className="wa-header-call-btn"
            onClick={onCall}
            style={{ borderRadius: '20px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 600, fontSize: '13px' }}
          >
            <span>☏</span> Call
          </button>
          <button
            type="button"
            className="wa-header-resolve-btn"
            onClick={onResolve}
            style={{ borderRadius: '20px', padding: '5px 12px', fontWeight: 600, fontSize: '13px' }}
          >
            Resolve
          </button>
          <button
            type="button"
            className="wa-icon-btn"
            title="Send Template"
            onClick={onOpenTemplates}
          >
            ▤
          </button>
          <button
            type="button"
            className="wa-icon-btn"
            title={contactInfoOpen ? 'Hide Contact Info' : 'Show Contact Info'}
            onClick={onToggleContactInfo}
          >
            {contactInfoOpen ? '✕' : 'ℹ'}
          </button>
        </div>
      </div>

      {/* 2. Messages Canvas (WhatsApp Doodle Pattern) */}
      <div className="wa-canvas">
        {/* Yellow Notice Banner (Matching Screenshot) */}
        <div className="wa-chat-lock-banner">
          🔒 Messages are end-to-end encrypted. Reply window: <b>◷ {winText}</b> ({isWindowOpen ? 'free replies' : 'meta templates'}).
        </div>

        {/* Date Pill */}
        <div className="wa-date-pill">TODAY</div>

        {/* Message Bubbles */}
        {conversation.msgs.map((m, idx) => {
          // Team Note Mode
          if (m.type === 'note') {
            return (
              <div key={idx} className="nt" style={{ alignSelf: 'center', width: '85%' }}>
                <b>Internal note · {m.sender || 'Team'} · customer cannot see</b>
                {m.attachments?.length ? (
                  <div className="att" style={{ margin: '6px 0' }}>
                    {m.attachments.map((att, aIdx) => (
                      <MessageAttachment key={aIdx} attachment={att} />
                    ))}
                  </div>
                ) : null}
                <div>{m.text}</div>
              </div>
            );
          }

          // System notification
          if (m.dir === 'sys') {
            return (
              <div key={idx} className={`sys ${m.text.includes('Missed') ? 'b' : ''}`} style={{ alignSelf: 'center' }}>
                {m.text} · {m.time}
              </div>
            );
          }

          const isOut = m.dir === 'out';

          return (
            <div key={idx} className={`wa-bubble ${isOut ? 'out' : 'in'}`}>
              {/* Template badge or sender */}
              {m.type === 'tpl' ? (
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--magenta)', marginBottom: '3px' }}>
                  Template · {m.sender}
                </div>
              ) : isOut && m.sender ? (
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#008069', marginBottom: '3px' }}>
                  {m.sender}
                </div>
              ) : null}

              {/* Attachments */}
              {m.attachments?.length ? (
                <div className="att" style={{ marginBottom: '6px' }}>
                  {m.attachments.map((att, aIdx) => (
                    <MessageAttachment key={aIdx} attachment={att} />
                  ))}
                </div>
              ) : null}

              {/* Message text */}
              <span>{m.text}</span>

              {/* Timestamp & double ticks */}
              <span className="wa-bubble-meta">
                <span>{m.time}</span>
                {isOut && (
                  <span className="wa-ticks">{m.read ? '✓✓' : '✓'}</span>
                )}
              </span>

              {/* Interactive buttons if any */}
              {m.buttons && (
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px', borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '6px' }}>
                  {m.buttons.map((bText, bIdx) => (
                    <button
                      key={bIdx}
                      type="button"
                      className="wa-bubble-btn"
                      style={{ flex: 1, cursor: 'pointer' }}
                      onClick={() => {
                        if (bText.toLowerCase().includes('call')) {
                          onCall();
                        } else if (bText.toLowerCase().includes('quote')) {
                          addToast('Viewing quotation Q-1042 · Rs. 185,000 (Valid until 30 Sep).');
                        } else {
                          addToast(`Action: ${bText}`);
                        }
                      }}
                    >
                      {bText}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Floating Scroll to Bottom Arrow */}
      <button
        type="button"
        className="wa-scroll-btn"
        title="Scroll to bottom"
        onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
      >
        ⌄
      </button>

      {/* 3. Composer (Matching WhatsApp Web Bottom Bar) */}
      <div className="wa-composer-wrap" style={{ position: 'relative' }}>
        {/* Floating Voice Recording Studio anchored directly above recording button */}
        {isRecording && contact && (
          <VoiceRecordingWidget
            contact={contact}
            onSend={onVoiceSend || (() => {})}
            onCancel={onVoiceCancel || onToggleRecording}
          />
        )}

        {/* Quick Replies Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', paddingBottom: '4px' }}>
          {quickReplies.slice(0, 6).map(q => (
            <button
              key={q.cmd}
              type="button"
              className="wa-quick-chip"
              title={q.t}
              onClick={() => onSelectQuickReply(q)}
            >
              {q.cmd}
            </button>
          ))}
          <button
            type="button"
            className="wa-quick-chip"
            onClick={onOpenTemplates}
          >
            ▤ Template
          </button>
          <button
            type="button"
            className="wa-quick-chip"
            onClick={onOpenCatalog}
          >
            ▣ Catalog
          </button>
          {onOpenGallery && (
            <button
              type="button"
              className="wa-quick-chip"
              onClick={onOpenGallery}
            >
              🖼 Gallery
            </button>
          )}
          <button
            type="button"
            className="wa-quick-chip"
            style={{
              borderColor: '#00a884',
              color: '#00a884',
              fontWeight: 600,
              background: 'rgba(0, 168, 132, 0.08)'
            }}
            onClick={() => simulateCustomerReply(conversation.id)}
            title="Simulate incoming customer WhatsApp message & hear notification sound"
          >
            💬 Test Customer Reply
          </button>
        </div>


        {/* Pending attachments strip */}
        {pendingAttachments.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', padding: '4px 0', flexWrap: 'wrap' }}>
            {pendingAttachments.map((att, idx) => (
              <div key={idx} style={{ position: 'relative', background: 'var(--wa-panel-bg)', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--wa-border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px' }}>📎 {att.name}</span>
                <button
                  type="button"
                  style={{ border: 0, background: 'none', cursor: 'pointer', color: '#ea0038', fontWeight: 700 }}
                  onClick={() => onRemoveAttachment(idx)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input Row */}
        <form className="wa-composer-row" onSubmit={onSubmit}>
          {/* File attach button */}
          <label
            className="wa-icon-btn"
            title="Attach Photos, Voice, Documents"
            style={{ cursor: 'pointer', fontSize: '20px' }}
          >
            📎
            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept="image/jpeg,image/png,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
              hidden
              onChange={onFileSelect}
            />
          </label>

          {/* Voice note recorder button */}
          <button
            type="button"
            className={`wa-icon-btn ${isRecording ? 'recon' : ''}`}
            title={isRecording ? 'Stop recording voice note' : 'Record WhatsApp voice note'}
            onClick={onToggleRecording}
            style={{ fontSize: '19px', color: isRecording ? '#ea0038' : undefined }}
          >
            🎙
          </button>

          {/* Internal team note toggle */}
          <button
            type="button"
            className="wa-icon-btn"
            title="Toggle Team Internal Note"
            style={{
              fontSize: '18px',
              color: isNoteMode ? '#a96c08' : undefined,
              background: isNoteMode ? '#fbe3de' : undefined
            }}
            onClick={onToggleNoteMode}
          >
            ✎
          </button>

          {/* Text input */}
          <input
            type="text"
            className="wa-composer-input"
            autoComplete="off"
            placeholder={
              isNoteMode
                ? 'Internal note: only your team sees this'
                : isWindowOpen
                ? 'Type a message here ..'
                : 'Reply window closed: send an approved template'
            }
            value={inputText}
            onChange={e => onInputChange(e.target.value)}
          />

          {/* Circular green Send button */}
          <button
            type="submit"
            className="wa-send-btn"
            title="Send"
          >
            ➤
          </button>
        </form>
      </div>
    </main>
  );
}
