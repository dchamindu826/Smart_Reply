'use client';

import React from 'react';
import { Contact, Staff, CallLogItem } from '@/types';

interface ContactInfoPanelProps {
  contact: Contact | null;
  staff: Staff[];
  calls: CallLogItem[];
  isStaff: boolean;
  onClose: () => void;
  onCall: () => void;
  onFocusOwner: () => void;
  onOpenLabels: () => void;
  onBlock: () => void;
  onOwnerChange: (newOwnerId: string | null) => void;
  onAddLabel: () => void;
}

export default function ContactInfoPanel({
  contact,
  staff,
  calls,
  isStaff,
  onClose,
  onCall,
  onFocusOwner,
  onOpenLabels,
  onBlock,
  onOwnerChange,
  onAddLabel
}: ContactInfoPanelProps) {
  if (!contact) return null;

  const contactCalls = calls.filter(k => k.c === contact.id && k.d !== 'ringing');

  return (
    <aside className="wa-col-info">
      {/* 1. Top Header */}
      <div className="wa-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            type="button"
            className="wa-icon-btn"
            style={{ padding: '6px', fontSize: '16px' }}
            onClick={onClose}
            aria-label="Close Contact Info"
          >
            ✕
          </button>
          <span style={{ fontWeight: 600, fontSize: '16px', color: 'var(--wa-primary-text)' }}>
            Contact Info
          </span>
        </div>
      </div>

      {/* 2. Hero Profile Card (Matching Screenshot) */}
      <div className="wa-info-hero">
        <div className={`wa-info-avatar-lg av ${contact.a}`}>
          {contact.i}
        </div>
        <div className="wa-info-name">{contact.n}</div>
        <div className="wa-info-phone">{contact.ph}</div>
        <div style={{ fontSize: '12px', color: 'var(--wa-secondary-text)', marginTop: '2px' }}>
          {contact.city} · customer since {contact.since}
        </div>

        {/* 4 Action Buttons with Circular Icons */}
        <div className="wa-info-actions">
          <button type="button" className="wa-info-act-btn" onClick={onCall}>
            <span className="icon-circle">☏</span>
            <span>Call</span>
          </button>
          <button type="button" className="wa-info-act-btn" onClick={onFocusOwner}>
            <span className="icon-circle">⚇</span>
            <span>Owner</span>
          </button>
          <button type="button" className="wa-info-act-btn" onClick={onOpenLabels}>
            <span className="icon-circle">◈</span>
            <span>Label</span>
          </button>
          <button type="button" className="wa-info-act-btn dg" onClick={onBlock}>
            <span className="icon-circle">⊘</span>
            <span>Block</span>
          </button>
        </div>
      </div>

      {/* 3. Media, Links and Documents Section (Matching Screenshot) */}
      <div className="wa-info-section">
        <div className="wa-info-section-header">
          <span>Media, Links and Documents</span>
          <span>›</span>
        </div>
        <div className="wa-media-grid">
          <div className="wa-media-item">
            <span>🖼</span>
          </div>
          <div className="wa-media-item">
            <span>🖼</span>
          </div>
          <div className="wa-media-item">
            <span>🖼</span>
          </div>
        </div>
      </div>

      {/* 4. About and phone number Section (Matching Screenshot) */}
      <div className="wa-info-section">
        <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#008069', marginBottom: '8px' }}>
          About and phone number
        </div>
        <p style={{ fontSize: '13.5px', color: 'var(--wa-primary-text)', lineHeight: 1.4, margin: '4px 0 8px' }}>
          &ldquo;Everyone should learn how to program because it teaches you how to think.&rdquo;
        </p>
        <div style={{ fontSize: '13.5px', color: 'var(--wa-secondary-text)', marginTop: '6px' }}>
          {contact.ph} · Mobile
        </div>
      </div>

      {/* 5. Customer Owner & Assignment Section (Business Feature) */}
      <div className="wa-info-section">
        <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#008069', marginBottom: '8px' }}>
          Customer owner
        </div>
        <select
          className="wa-select f-in"
          id="cuTo"
          value={contact.to || ''}
          onChange={e => onOwnerChange(e.target.value || null)}
          style={{ width: '100%', padding: '8px 10px', fontSize: '13px', borderRadius: '7px' }}
        >
          <option value="">{isStaff ? 'Release to team' : 'Unassigned'}</option>
          {staff.map(s => (
            <option key={s.id} value={s.id}>
              {s.n} · {s.stt}
            </option>
          ))}
        </select>
        <p className="hint" style={{ marginTop: '5px' }}>
          The owner receives all incoming chats and calls from {contact.ph}.
        </p>

        {contact.hist.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--wa-secondary-text)', marginBottom: '6px' }}>
              Owner history
            </div>
            {contact.hist.map((h, idx) => (
              <div key={idx} className="ln" style={{ padding: '4px 0' }}>
                <span style={{ fontSize: '12px' }}>{h[1]}</span>
                <b style={{ fontWeight: 500, fontSize: '11.5px', textAlign: 'right' }}>
                  {h[0]}<br />
                  <span style={{ color: 'var(--ink-3)' }}>{h[2]}</span>
                </b>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 6. Labels Section */}
      <div className="wa-info-section">
        <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#008069', marginBottom: '8px' }}>
          Labels
        </div>
        <div className="tags" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {contact.labels.length > 0 ? (
            contact.labels.map((lbl, idx) => (
              <span key={idx} className={`chip ${lbl[1]}`}>
                {lbl[0]}
              </span>
            ))
          ) : (
            <span className="hint">No labels assigned</span>
          )}
          <button type="button" className="chip" onClick={onAddLabel} style={{ cursor: 'pointer' }}>
            + Add
          </button>
        </div>
      </div>

      {/* 7. Chat and Call History */}
      <div className="wa-info-section" style={{ borderBottom: 0 }}>
        <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#008069', marginBottom: '8px' }}>
          Activity history
        </div>
        <div className="ln" style={{ padding: '4px 0' }}>
          <span style={{ fontSize: '12.5px' }}>Quotation Q-1042</span>
          <b className="chip ok">Open</b>
        </div>
        <div className="ln" style={{ padding: '4px 0' }}>
          <span style={{ fontSize: '12.5px' }}>Sliding wardrobe inquiry</span>
          <b className="chip">Resolved</b>
        </div>

        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--wa-primary-text)', marginTop: '12px', marginBottom: '6px' }}>
          Call history {contact.perm && <span className="chip i" style={{ marginLeft: '4px' }}>Permission ✓</span>}
        </div>
        {contactCalls.length > 0 ? (
          contactCalls.map((k, idx) => (
            <div key={idx} className="ln" style={{ padding: '4px 0' }}>
              <span style={{ fontSize: '12px' }}>
                {k.d.charAt(0).toUpperCase() + k.d.slice(1)} {k.dur ? `· ${k.dur}` : ''}
              </span>
              <b style={{ fontWeight: 500, fontSize: '11.5px' }}>{k.t}</b>
            </div>
          ))
        ) : (
          <span className="hint" style={{ fontSize: '12px' }}>No previous calls</span>
        )}
      </div>
    </aside>
  );
}
