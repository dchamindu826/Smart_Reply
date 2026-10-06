'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { QuickReply, Attachment } from '@/types';
import { formatFileSize, COLOUR_CARD_SVG } from '@/data/mockData';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

export default function QuickRepliesScreen() {
  const {
    role,
    quickReplies,
    addQuickReply,
    updateQuickReply,
    deleteQuickReply,
    openSheet,
    closeSheet,
    addToast
  } = useApp();

  const [filter, setFilter] = useState('all');

  const filtered = quickReplies.filter(q => {
    if (filter === 'all') return true;
    if (filter === 'image') return q.att.some(a => a.type === 'image');
    if (filter === 'voice') return q.att.some(a => a.type === 'voice');
    if (filter === 'file') return q.att.some(a => a.type === 'file');
    if (filter === 'text') return q.att.length === 0;
    return true;
  });

  const totalUsed = quickReplies.reduce((n, q) => n + q.used, 0);

  const handleOpenForm = (index: number | null) => {
    const existing = index !== null ? quickReplies[index] : null;

    openSheet(
      <QuickReplyForm
        initial={existing}
        role={role}
        onSave={(qr) => {
          if (index !== null) {
            updateQuickReply(index, qr);
          } else {
            addQuickReply(qr);
          }
          closeSheet();
        }}
      />
    );
  };

  return (
    <>
      <div className="ph">
        <div>
          <h1>Quick replies &amp; /commands</h1>
          <p>
            Saved answers with photos, voice notes and files. Type the /command in a chat, or tap it above the message box.
          </p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          <button className="btn pri" onClick={() => handleOpenForm(null)}>
            Add quick reply
          </button>
        </div>
      </div>

      <div className="stats">
        <div className="stat i">
          <span>Quick replies</span>
          <b>{quickReplies.length}</b>
          <small>{quickReplies.filter(q => q.att.length > 0).length} with attachments</small>
        </div>
        <div className="stat ok">
          <span>Used this week</span>
          <b>{totalUsed}</b>
          <small>Saves about 2 minutes each</small>
        </div>
        <div className="stat">
          <span>Most used</span>
          <b style={{ fontSize: '20px' }}>/price-list</b>
          <small>37 times · PDF attached</small>
        </div>
        <div className="stat">
          <span>Media limits</span>
          <b style={{ fontSize: '20px' }}>5 · 16 · 100 MB</b>
          <small>Images · voice/audio · documents</small>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div className="seg">
            {[
              { id: 'all', label: 'All' },
              { id: 'image', label: 'With image' },
              { id: 'voice', label: 'With voice' },
              { id: 'file', label: 'With file' },
              { id: 'text', label: 'Text only' }
            ].map(tab => (
              <button
                key={tab.id}
                aria-pressed={filter === tab.id}
                className={filter === tab.id ? 'active' : ''}
                onClick={() => setFilter(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Command</th>
                <th>Reply</th>
                <th>Attachments</th>
                <th className="r">Used</th>
                <th>Added by</th>
                <th className="r" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((q, idx) => {
                const originalIndex = quickReplies.indexOf(q);
                return (
                  <tr key={q.cmd}>
                    <td><code className="cmd">{q.cmd}</code></td>
                    <td style={{ maxWidth: '380px' }}>
                      <b style={{ display: 'block', fontSize: '13.5px' }}>{q.t}</b>
                      <span style={{ fontSize: '12.5px', color: 'var(--ink-2)' }}>
                        {q.x ? q.x : <i>No text · attachment only</i>}
                      </span>
                    </td>
                    <td>
                      {q.att.length ? (
                        <div className="att">
                          {q.att.map((a, aIdx) => (
                            <span key={aIdx} className="qa">
                              {a.type === 'image' ? '🖼 Image' : a.type === 'voice' ? '🎙 Voice' : `📎 ${(a.name.split('.').pop() || '').toUpperCase()}`}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="hint" style={{ margin: 0 }}>—</span>
                      )}
                    </td>
                    <td className="r">{q.used}</td>
                    <td>{q.by}</td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn sm" onClick={() => handleOpenForm(originalIndex)}>
                        Edit
                      </button>{' '}
                      <button className="btn sm dgr" onClick={() => deleteQuickReply(originalIndex)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="note i">
        <span className="ic">◈</span>
        <div>
          <b>How attachments go out on WhatsApp</b>
          Each photo, voice note or file is sent as its own message. The reply text becomes the caption of the first photo or file. Voice notes go without a caption, so the text follows as a separate message.
        </div>
      </div>
    </>
  );
}

function QuickReplyForm({
  initial,
  role,
  onSave
}: {
  initial: QuickReply | null;
  role: string;
  onSave: (qr: QuickReply) => void;
}) {
  const [cmd, setCmd] = useState(initial ? initial.cmd : '/');
  const [title, setTitle] = useState(initial ? initial.t : '');
  const [text, setText] = useState(initial ? initial.x : '');
  const [attachments, setAttachments] = useState<Attachment[]>(initial ? [...initial.att] : []);
  const [recording, setRecording] = useState(false);

  const handleRecord = () => {
    if (recording) {
      setRecording(false);
      setAttachments(prev => [
        ...prev,
        { type: 'voice', name: 'voice_note.ogg', size: 61440, dur: '0:18', real: false }
      ]);
    } else {
      setRecording(true);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'voice' | 'file') => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const added = files.map(f => ({
      type,
      name: f.name,
      size: f.size,
      url: type === 'image' ? URL.createObjectURL(f) : undefined,
      dur: type === 'voice' ? '0:20' : undefined
    }));
    setAttachments(prev => [...prev, ...added]);
    e.target.value = '';
  };

  const handleSave = () => {
    let cleanCmd = cmd.trim().replace(/\s+/g, '-');
    if (!cleanCmd.startsWith('/')) cleanCmd = '/' + cleanCmd;
    if (cleanCmd.length < 2) return;
    if (!text && attachments.length === 0) return;

    onSave({
      cmd: cleanCmd,
      t: title.trim() || cleanCmd,
      x: text.trim(),
      att: attachments,
      used: initial ? initial.used : 0,
      by: role === 'staff' ? 'Nimal' : 'Madushan P.'
    });
  };

  return (
    <>
      <h2>{initial ? `Edit ${initial.cmd}` : 'New quick reply'}</h2>
      <p className="sub">Staff type the command in a chat, or tap it above the message box.</p>

      <div className="f-row f2">
        <div>
          <label className="f" htmlFor="qCmd">Command</label>
          <input
            className="f-in"
            id="qCmd"
            value={cmd}
            onChange={e => setCmd(e.target.value)}
          />
        </div>
        <div>
          <label className="f" htmlFor="qWho">Who can use it</label>
          <select className="f-in" id="qWho">
            <option>Everyone</option>
            <option>Only me</option>
            <option>Managers</option>
          </select>
        </div>
      </div>

      <label className="f" htmlFor="qT2">Title</label>
      <input
        className="f-in"
        id="qT2"
        value={title}
        placeholder="e.g. Kitchen price list"
        onChange={e => setTitle(e.target.value)}
      />

      <label className="f" htmlFor="qX">Message text</label>
      <textarea
        className="f-in"
        id="qX"
        rows={3}
        placeholder="Optional when you attach something"
        value={text}
        onChange={e => setText(e.target.value)}
      />

      <label className="f">Attachments</label>
      <div className="attb">
        <label className="btn sm">
          🖼 Image
          <input
            type="file"
            accept="image/jpeg,image/png"
            multiple
            onChange={e => handleFileInput(e, 'image')}
          />
        </label>
        <label className="btn sm">
          🎙 Voice file
          <input
            type="file"
            accept="audio/*"
            onChange={e => handleFileInput(e, 'voice')}
          />
        </label>
        <button
          type="button"
          className={`btn sm ${recording ? 'recon' : ''}`}
          onClick={handleRecord}
        >
          {recording ? '■ Stop' : '● Record'}
        </button>
        <label className="btn sm">
          📎 File
          <input
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
            multiple
            onChange={e => handleFileInput(e, 'file')}
          />
        </label>
      </div>

      <div className="att" style={{ minHeight: '10px', paddingTop: '6px' }}>
        {attachments.length ? (
          attachments.map((a, idx) => (
            <div key={idx} style={{ position: 'relative' }}>
              {a.type === 'image' ? (
                <span className="att-img">
                  <img src={a.url || COLOUR_CARD_SVG} alt={a.name} />
                </span>
              ) : a.type === 'voice' ? (
                <span className="att-voice">
                  <span className="pl">▶</span>
                  <small>{a.dur || '0:14'}</small>
                </span>
              ) : (
                <span className="att-file">
                  <span className="ext">{(a.name.split('.').pop() || 'FILE').toUpperCase()}</span>
                  <span>
                    <b>{a.name}</b>
                    <span>{formatFileSize(a.size)}</span>
                  </span>
                </span>
              )}
              <button
                className="rm"
                onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
              >
                ×
              </button>
            </div>
          ))
        ) : (
          <span className="hint" style={{ margin: 0 }}>No attachments yet</span>
        )}
      </div>

      <p className="hint">
        WhatsApp limits: JPG or PNG images up to 5 MB · voice and audio (OGG, MP3, M4A, AAC) up to 16 MB · PDF, Word, Excel and PowerPoint files up to 100 MB.
      </p>

      <label className="f">Preview in chat</label>
      <div className="tpv">
        <div className="bb out" style={{ maxWidth: '100%' }}>
          <span className="by">You</span>
          {attachments.length > 0 && (
            <div className="att">
              {attachments.map((a, i) => (
                <span key={i} className="qa">{a.name}</span>
              ))}
            </div>
          )}
          {text || (attachments.length ? '' : 'No text')}
          <span className="mt">now<span className="rd">✓</span></span>
        </div>
      </div>

      <button
        className="btn pri"
        style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }}
        onClick={handleSave}
      >
        Save quick reply
      </button>
    </>
  );
}
