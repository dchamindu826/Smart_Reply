'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Conversation, Contact, QuickReply, Attachment, Message } from '@/types';
import { getWinClass, getWinText } from '@/utils/windowTime';
import MessageAttachment from './ChatThread/MessageAttachment';
import VoiceRecordingWidget from '@/components/modals/VoiceRecordingWidget';
import { useApp } from '@/context/AppContext';
import {
  ChatsIcon,
  CallsIcon,
  AiBotIcon,
  MessageTemplatesIcon,
  CatalogIcon,
  MediaGalleryIcon,
  PaperclipIcon,
  MicIcon,
  StopIcon,
  NoteIcon,
  SendIcon,
  ClockIcon,
  LockIcon,
  InfoIcon,
  CloseIcon
} from '@/components/common/Icons';

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
  onVoiceSend?: (durStr: string, audio: Blob) => void;
  onVoiceCancel?: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(new Date()) - start(d)) / 86_400_000);
  if (days === 0) return 'TODAY';
  if (days === 1) return 'YESTERDAY';
  if (days < 7) return d.toLocaleDateString('en-GB', { weekday: 'long' }).toUpperCase();
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
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
  const { addToast, hasOlderMessages, loadOlderMessages, aiAddon, setBotActive } = useApp();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Auto-scroll when messages change
  const msgCount = conversation?.msgs.length ?? 0;
  const lastMsgId = conversation?.msgs[msgCount - 1]?.id;
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBottom(false);
  }, [conversation?.id, lastMsgId]);

  const handleCanvasScroll = () => {
    if (!canvasRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = canvasRef.current;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 100);
  };

  if (!conversation || !contact) {
    return (
      <main className="wa-col-thread" style={{ display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div style={{ color: 'var(--wa-secondary-text)', maxWidth: '320px', padding: '20px' }}>
          <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
            <ChatsIcon size={56} style={{ color: 'var(--brand-teal, #00a884)', opacity: 0.85 }} />
          </div>
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

  const renderBubble = (m: Message, idx: number) => {
          // Team Note Mode
          if (m.type === 'note') {
            return (
              <div key={m.id ?? idx} className="nt" style={{ alignSelf: 'center', width: '85%' }}>
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
              <div key={m.id ?? idx} className={`sys ${m.text.includes('Missed') ? 'b' : ''}`} style={{ alignSelf: 'center' }}>
                {m.text} · {m.time}
              </div>
            );
          }

          const isOut = m.dir === 'out';

          return (
            <div key={m.id ?? idx} className={`wa-bubble ${isOut ? 'out' : 'in'}`}>
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
                  <span
                    className="wa-ticks"
                    title={m.status === 'failed' ? (m.error ?? 'Not delivered') : m.status}
                    style={m.status === 'read' ? { color: '#53bdeb' } : m.status === 'failed' ? { color: '#ea0038' } : undefined}
                  >
                    {m.status === 'queued' ? '🕓' : m.status === 'failed' ? '⚠' : m.status === 'sent' ? '✓' : '✓✓'}
                  </span>
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
                      onClick={() => addToast(`The customer taps “${bText}” on WhatsApp.`)}
                    >
                      {bText}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
  };

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
              <span className={`wt ${winClass}`} style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <ClockIcon size={11} /> {winText}
              </span>
              <span>{isWindowOpen ? '· Free replies window open' : '· Approved templates only'}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="wa-header-call-btn"
            onClick={onCall}
            style={{ borderRadius: '20px', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px' }}
          >
            <CallsIcon size={14} /> Call
          </button>
          <button
            type="button"
            className="wa-header-resolve-btn"
            onClick={onResolve}
            style={{ borderRadius: '20px', padding: '5px 12px', fontWeight: 600, fontSize: '13px' }}
          >
            {conversation.status === 'resolved' ? 'Reopen' : 'Resolve'}
          </button>
          {aiAddon?.status === 'active' && (
            <button
              type="button"
              className="wa-header-resolve-btn"
              onClick={() => void setBotActive(conversation.id, !conversation.botActive)}
              title={conversation.botActive ? 'The AI bot answers this chat. Take over to stop it.' : 'You are answering. Hand the chat back to the AI bot.'}
              style={{ borderRadius: '20px', padding: '5px 12px', fontWeight: 600, fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              <AiBotIcon size={13} /> {conversation.botActive ? 'Take over' : 'Hand to bot'}
            </button>
          )}
          <button
            type="button"
            className="wa-icon-btn"
            title="Send Template"
            onClick={onOpenTemplates}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <MessageTemplatesIcon size={18} />
          </button>
          <button
            type="button"
            className="wa-icon-btn"
            title={contactInfoOpen ? 'Hide Contact Info' : 'Show Contact Info'}
            onClick={onToggleContactInfo}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {contactInfoOpen ? <CloseIcon size={16} /> : <InfoIcon size={18} />}
          </button>
        </div>
      </div>

      {/* 2. Messages Canvas (WhatsApp Doodle Pattern) */}
      <div className="wa-canvas" ref={canvasRef} onScroll={handleCanvasScroll}>
        {/* Yellow Notice Banner (Matching Screenshot) */}
        <div className="wa-chat-lock-banner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <LockIcon size={13} style={{ flexShrink: 0 }} />
          <span>
            WhatsApp Business messages. Reply window:{' '}
            <b><ClockIcon size={11} style={{ display: 'inline', verticalAlign: '-1px', margin: '0 2px' }} />{winText}</b> ({isWindowOpen ? 'free replies' : 'meta templates'}).
          </span>
        </div>

        {hasOlderMessages && (
          <button type="button" className="wa-date-pill" style={{ cursor: 'pointer', border: 0 }} onClick={loadOlderMessages}>
            Load older messages
          </button>
        )}

        {/* Message Bubbles */}
        {conversation.msgs.map((m, idx) => {
          const day = m.at ? dayLabel(m.at) : '';
          const prevDay = idx > 0 && conversation.msgs[idx - 1].at ? dayLabel(conversation.msgs[idx - 1].at!) : '';
          const pill = day && day !== prevDay ? <div key={`d-${m.id ?? idx}`} className="wa-date-pill">{day}</div> : null;
          const bubble = renderBubble(m, idx);
          return pill ? [pill, bubble] : bubble;
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* 3. Composer (Matching WhatsApp Web Bottom Bar - Fixed & Locked) */}
      <div className="wa-composer-wrap">
        {/* Floating Scroll to Bottom Arrow - sits cleanly above composer */}
        {showScrollBottom && (
          <button
            type="button"
            className="wa-scroll-btn"
            title="Scroll to bottom"
            onClick={() => {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
              setShowScrollBottom(false);
            }}
          >
            ⌄
          </button>
        )}
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
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          >
            <MessageTemplatesIcon size={14} /> Template
          </button>
          <button
            type="button"
            className="wa-quick-chip"
            onClick={onOpenCatalog}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
          >
            <CatalogIcon size={14} /> Catalog
          </button>
          {onOpenGallery && (
            <button
              type="button"
              className="wa-quick-chip"
              onClick={onOpenGallery}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              <MediaGalleryIcon size={14} /> Gallery
            </button>
          )}
        </div>


        {/* Pending attachments strip */}
        {pendingAttachments.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', padding: '4px 0', flexWrap: 'wrap' }}>
            {pendingAttachments.map((att, idx) => (
              <div key={idx} style={{ position: 'relative', background: 'var(--wa-panel-bg)', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--wa-border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <PaperclipIcon size={13} /> {att.name}
                </span>
                <button
                  type="button"
                  style={{ border: 0, background: 'none', cursor: 'pointer', color: '#ea0038', display: 'flex', alignItems: 'center' }}
                  onClick={() => onRemoveAttachment(idx)}
                >
                  <CloseIcon size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input Row */}
        {conversation.status !== 'resolved' && contact.blocked ? (
          <div className="wa-chat-lock-banner">This customer is blocked. Unblock them in contact info to message.</div>
        ) : null}
        <form className="wa-composer-row" onSubmit={onSubmit}>
          {/* File attach button */}
          <label
            className="wa-icon-btn"
            title="Attach Photos, Voice, Documents"
            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <PaperclipIcon size={19} />
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
            style={{ color: isRecording ? '#ea0038' : undefined, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {isRecording ? <StopIcon size={19} /> : <MicIcon size={19} />}
          </button>

          {/* Internal team note toggle */}
          <button
            type="button"
            className="wa-icon-btn"
            title="Toggle Team Internal Note"
            style={{
              color: isNoteMode ? '#a96c08' : undefined,
              background: isNoteMode ? '#fbe3de' : undefined,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onClick={onToggleNoteMode}
          >
            <NoteIcon size={18} />
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
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <SendIcon size={16} />
          </button>
        </form>
      </div>
    </main>
  );
}
