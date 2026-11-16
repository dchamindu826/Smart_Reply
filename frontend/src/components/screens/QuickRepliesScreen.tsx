'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MEDIA_LIMITS, mediaKindForMime } from '@smart-reply/shared';
import { useApp } from '@/context/AppContext';
import { useSession } from '@/features/session';
import { useDeleteQuickReply, useQuickReplies, useSaveQuickReply } from '@/features/content';
import { QuickReply, Attachment } from '@/types';
import { toQuickReply } from '@/lib/adapters';
import { errorMessage } from '@/lib/api';
import { formatFileSize } from '@/lib/ui';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);

/** Check a picked file against the WhatsApp limits; returns an error message or null. */
function checkFile(f: File, type: Attachment['type']): string | null {
  const mime = (f.type || '').split(';')[0];
  const kind = mediaKindForMime(mime);
  const expected = type === 'image' ? 'image' : type === 'voice' ? 'audio' : 'document';
  if (!kind || kind !== expected) return `WhatsApp does not accept ${mime || 'this type of'} file${mime ? 's' : ''} here (${f.name}).`;
  const max = MEDIA_LIMITS[kind].max;
  if (f.size > max) return `${f.name} is ${formatFileSize(f.size)}. ${kind[0].toUpperCase() + kind.slice(1)} files can be at most ${mb(max)} MB on WhatsApp.`;
  return null;
}

export default function QuickRepliesScreen() {
  const { role, openSheet, closeSheet, addToast, reportError, currentUser } = useApp();
  const { me } = useSession();
  const isManager = role === 'manager';
  const canShare = isManager || Boolean(me?.permissions.editSharedQuickReplies);

  const quickQ = useQuickReplies();
  const del = useDeleteQuickReply();
  const quickReplies = useMemo(() => (quickQ.data ?? []).map(toQuickReply), [quickQ.data]);

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
  const mostUsed = quickReplies.reduce<QuickReply | null>((best, q) => (q.used > 0 && (!best || q.used > best.used) ? q : best), null);

  const mayEdit = (q: QuickReply) => {
    if (isManager) return true;
    if (q.scope === 'only_me') return q.ownerId === currentUser.id;
    return canShare;
  };

  const handleOpenForm = (existing: QuickReply | null) => {
    openSheet(
      <QuickReplyForm
        initial={existing}
        canShare={canShare}
        onSaved={(cmd, count, updated) => {
          addToast(updated ? `${cmd} updated.` : `${cmd} saved with ${count} attachment(s).`);
          closeSheet();
        }}
      />
    );
  };

  const handleDelete = (q: QuickReply) => {
    if (!q.id || !window.confirm(`Delete ${q.cmd}?`)) return;
    del.mutate(q.id, { onSuccess: () => addToast(`${q.cmd} deleted.`), onError: reportError });
  };

  const attachmentSummary = (q: QuickReply) => {
    const a = q.att[0];
    if (!a) return 'Text only';
    return a.type === 'image' ? 'Photo attached' : a.type === 'voice' ? 'Voice note attached' : `${(a.name.split('.').pop() || 'File').toUpperCase()} attached`;
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
          <span>Times used</span>
          <b>{totalUsed}</b>
          <small>Saves about 2 minutes each</small>
        </div>
        <div className="stat">
          <span>Most used</span>
          <b style={{ fontSize: '20px' }}>{mostUsed ? mostUsed.cmd : '—'}</b>
          <small>{mostUsed ? `${mostUsed.used} times · ${attachmentSummary(mostUsed)}` : 'Not used yet'}</small>
        </div>
        <div className="stat">
          <span>Media limits</span>
          <b style={{ fontSize: '20px' }}>
            {mb(MEDIA_LIMITS.image.max)} · {mb(MEDIA_LIMITS.audio.max)} · {mb(MEDIA_LIMITS.document.max)} MB
          </b>
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
              {quickQ.isLoading && (
                <tr>
                  <td colSpan={6}><span className="hint" style={{ margin: 0 }}>Loading…</span></td>
                </tr>
              )}
              {quickQ.isError && (
                <tr>
                  <td colSpan={6}><span className="hint" style={{ margin: 0, color: 'var(--bad)' }}>{errorMessage(quickQ.error)}</span></td>
                </tr>
              )}
              {quickQ.isSuccess && filtered.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <span className="hint" style={{ margin: 0 }}>
                      {quickReplies.length === 0 ? 'No quick replies yet. Add one to answer common questions in one tap.' : 'No quick replies match this filter.'}
                    </span>
                  </td>
                </tr>
              )}
              {filtered.map(q => (
                <tr key={q.id ?? q.cmd}>
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
                          <a key={aIdx} className="qa" href={a.url} target="_blank" rel="noreferrer" title={a.name}>
                            {a.type === 'image' ? '🖼 Image' : a.type === 'voice' ? '🎙 Voice' : `📎 ${(a.name.split('.').pop() || '').toUpperCase()}`}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <span className="hint" style={{ margin: 0 }}>—</span>
                    )}
                  </td>
                  <td className="r">{q.used}</td>
                  <td>
                    {q.by}
                    {q.scope === 'only_me' && <span className="hint" style={{ margin: 0, display: 'block' }}>Only {q.ownerId === currentUser.id ? 'me' : q.by.split(' ')[0]}</span>}
                  </td>
                  <td className="r" style={{ whiteSpace: 'nowrap' }}>
                    {mayEdit(q) && (
                      <>
                        <button className="btn sm" onClick={() => handleOpenForm(q)}>
                          Edit
                        </button>{' '}
                        <button className="btn sm dgr" disabled={del.isPending && del.variables === q.id} onClick={() => handleDelete(q)}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
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

function pickRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

function QuickReplyForm({
  initial,
  canShare,
  onSaved
}: {
  initial: QuickReply | null;
  canShare: boolean;
  onSaved: (cmd: string, attachments: number, updated: boolean) => void;
}) {
  const save = useSaveQuickReply();
  const [cmd, setCmd] = useState(initial ? initial.cmd : '/');
  const [title, setTitle] = useState(initial ? initial.t : '');
  const [text, setText] = useState(initial ? initial.x : '');
  const [scope, setScope] = useState<'everyone' | 'only_me'>(initial?.scope ?? (canShare ? 'everyone' : 'only_me'));
  const [attachments, setAttachments] = useState<Attachment[]>(initial ? [...initial.att] : []);
  const [recording, setRecording] = useState(false);
  const [recStart, setRecStart] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(
    () => () => {
      const r = recorderRef.current;
      if (r && r.state !== 'inactive') r.stop();
      r?.stream.getTracks().forEach(t => t.stop());
    },
    []
  );

  const handleRecord = async () => {
    setError(null);
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser cannot record audio. Attach a voice file instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickRecorderMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      const started = Date.now();
      rec.ondataavailable = e => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const type = (rec.mimeType || mime || 'audio/webm').split(';')[0];
        const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
        const file = new File(chunksRef.current, `voice_note.${ext}`, { type });
        const secs = Math.max(1, Math.round((Date.now() - started) / 1000));
        const problem = checkFile(file, 'voice');
        if (problem) {
          setError(problem);
          return;
        }
        setAttachments(prev => [
          ...prev,
          { type: 'voice', name: file.name, size: file.size, file, url: URL.createObjectURL(file), dur: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` }
        ]);
      };
      recorderRef.current = rec;
      rec.start();
      setRecStart(started);
      setRecording(true);
    } catch (err) {
      setError(err instanceof DOMException && err.name === 'NotAllowedError' ? 'Allow microphone access to record a voice note.' : errorMessage(err));
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>, type: Attachment['type']) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    e.target.value = '';
    setError(null);
    const problems: string[] = [];
    const added: Attachment[] = [];
    for (const f of files) {
      const problem = checkFile(f, type);
      if (problem) {
        problems.push(problem);
        continue;
      }
      added.push({ type, name: f.name, size: f.size, file: f, mime: f.type, url: URL.createObjectURL(f) });
    }
    if (problems.length) setError(problems.join(' '));
    setAttachments(prev => [...prev, ...added].slice(0, 10));
  };

  const handleSave = () => {
    setError(null);
    let cleanCmd = cmd.trim().toLowerCase().replace(/\s+/g, '-');
    if (!cleanCmd.startsWith('/')) cleanCmd = '/' + cleanCmd;
    if (!/^\/[a-z0-9][a-z0-9_-]{0,30}$/.test(cleanCmd)) {
      setError('Start the command with / and use letters, numbers, - or _ (up to 31 characters).');
      return;
    }
    if (!text.trim() && attachments.length === 0) {
      setError('Write a reply or attach a file.');
      return;
    }
    save.mutate(
      {
        id: initial?.id,
        command: cleanCmd,
        title: title.trim() || cleanCmd,
        text: text.trim(),
        scope,
        attachments: attachments.map(a => ({ fileId: a.fileId, file: a.file, name: a.name }))
      },
      {
        onSuccess: () => onSaved(cleanCmd, attachments.length, Boolean(initial)),
        onError: err => setError(errorMessage(err))
      }
    );
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
          <select className="f-in" id="qWho" value={scope} onChange={e => setScope(e.target.value as 'everyone' | 'only_me')}>
            <option value="everyone" disabled={!canShare && initial?.scope !== 'everyone'}>
              Everyone{!canShare ? ' (manager permission needed)' : ''}
            </option>
            <option value="only_me">Only me</option>
          </select>
        </div>
      </div>

      <label className="f" htmlFor="qT2">Title</label>
      <input
        className="f-in"
        id="qT2"
        value={title}
        maxLength={80}
        placeholder="e.g. Kitchen price list"
        onChange={e => setTitle(e.target.value)}
      />

      <label className="f" htmlFor="qX">Message text</label>
      <textarea
        className="f-in"
        id="qX"
        rows={3}
        maxLength={4096}
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
            accept={MEDIA_LIMITS.image.mimes.join(',')}
            multiple
            onChange={e => handleFileInput(e, 'image')}
          />
        </label>
        <label className="btn sm">
          🎙 Voice file
          <input
            type="file"
            accept={MEDIA_LIMITS.audio.mimes.join(',')}
            onChange={e => handleFileInput(e, 'voice')}
          />
        </label>
        <button
          type="button"
          className={`btn sm ${recording ? 'recon' : ''}`}
          onClick={() => void handleRecord()}
        >
          {recording ? `■ Stop` : '● Record'}
        </button>
        <label className="btn sm">
          📎 File
          <input
            type="file"
            accept={MEDIA_LIMITS.document.mimes.join(',')}
            multiple
            onChange={e => handleFileInput(e, 'file')}
          />
        </label>
      </div>
      {recording && <RecordingTimer since={recStart} />}

      <div className="att" style={{ minHeight: '10px', paddingTop: '6px' }}>
        {attachments.length ? (
          attachments.map((a, idx) => (
            <div key={idx} style={{ position: 'relative' }}>
              {a.type === 'image' ? (
                <span className="att-img">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url || ''} alt={a.name} />
                </span>
              ) : a.type === 'voice' ? (
                <span className="att-voice" title={a.name}>
                  <span className="pl">▶</span>
                  <small>{a.dur || formatFileSize(a.size)}</small>
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
        WhatsApp limits: JPG or PNG images up to {mb(MEDIA_LIMITS.image.max)} MB · voice and audio (OGG, MP3, M4A, AAC) up to {mb(MEDIA_LIMITS.audio.max)} MB · PDF, Word, Excel and PowerPoint files up to {mb(MEDIA_LIMITS.document.max)} MB.
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

      {error && (
        <div className="note w" style={{ marginTop: '12px' }}>
          <span className="ic">⚠</span>
          <div>
            <b>Not saved</b>
            {error}
          </div>
        </div>
      )}

      <button
        className="btn pri"
        style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }}
        disabled={save.isPending || recording}
        onClick={handleSave}
      >
        {save.isPending ? 'Uploading…' : 'Save quick reply'}
      </button>
    </>
  );
}

function RecordingTimer({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return (
    <p className="hint" style={{ color: 'var(--bad)' }}>
      ● Recording {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </p>
  );
}
