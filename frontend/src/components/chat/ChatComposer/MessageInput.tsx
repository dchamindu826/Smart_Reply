'use client';

import React, { useRef } from 'react';

interface MessageInputProps {
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

export default function MessageInput({
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
}: MessageInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const firstName = activeContactName?.split(' ')[0] || 'customer';

  const isDisabled = !isWindowOpen && !isNoteMode;

  const placeholder = isNoteMode
    ? 'Internal note: only your team sees this'
    : isWindowOpen
    ? `Reply to ${firstName}, or type / for commands`
    : 'Window closed: send an approved template';

  return (
    <form className="row" style={{ flexWrap: 'nowrap', gap: '6px' }} onSubmit={onSubmit}>
      <input
        className="f-in"
        style={{ flex: 1, minWidth: 0 }}
        autoComplete="off"
        disabled={isDisabled}
        placeholder={placeholder}
        value={inputText}
        onChange={e => onInputChange(e.target.value)}
      />

      {/* Attachment button */}
      <label
        className="tbtn"
        title="Attach image, voice or file"
        style={{
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          opacity: isDisabled ? 0.4 : 1,
          pointerEvents: isDisabled ? 'none' : 'auto'
        }}
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

      {/* Voice note record button */}
      <button
        type="button"
        className={`tbtn ${isRecording ? 'recon' : ''}`}
        title={isRecording ? 'Stop recording' : 'Record voice note'}
        disabled={isDisabled}
        onClick={onToggleRecording}
      >
        🎙
      </button>

      {/* Internal note toggle */}
      <button
        type="button"
        className={`tbtn ${isNoteMode ? 'on' : ''}`}
        title="Toggle Internal Team Note"
        onClick={onToggleNoteMode}
      >
        ✎
      </button>

      <button className="btn pri" type="submit" style={{ flex: 'none' }}>
        Send
      </button>
    </form>
  );
}
