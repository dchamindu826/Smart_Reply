'use client';

import React, { useRef, useState } from 'react';
import type { FileRef, IvrMenu } from '@smart-reply/shared';
import { useApp } from '@/context/AppContext';
import { IvrInput, useIvrMenu, useSaveIvr, useServerDraft, useTestIvr, useUploadIvrGreeting } from '@/features/calls';
import { mmss } from '@/lib/adapters';
import { useSession } from '@/features/session';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

const KEYS = '1234567890*#';
const sortOpts = (opts: IvrInput['options']) => [...opts].sort((a, b) => KEYS.indexOf(a.digit) - KEYS.indexOf(b.digit));

interface Draft extends IvrInput {
  /** What to show for the greeting: the saved file, or the name of one just uploaded. */
  audio: { name: string; url: string | null; dur: string | null } | null;
}

function toDraft(m: IvrMenu): Draft {
  return {
    enabled: m.enabled,
    greetingMode: m.greetingMode,
    greetingText: m.greetingText,
    greetingFileId: m.greetingAudio?.id ?? null,
    waitSeconds: m.waitSeconds,
    noInputDestination: m.noInputDestination,
    afterHoursEnabled: m.afterHoursEnabled,
    options: sortOpts(m.options),
    audio: m.greetingAudio ? fileView(m.greetingAudio) : null
  };
}

function fileView(f: FileRef): Draft['audio'] {
  return { name: f.name, url: f.url, dur: f.durationSeconds ? mmss(f.durationSeconds) : null };
}

function toBody(d: Draft): IvrInput {
  return {
    enabled: d.enabled,
    greetingMode: d.greetingMode,
    greetingText: d.greetingText,
    greetingFileId: d.greetingFileId,
    waitSeconds: d.waitSeconds,
    noInputDestination: d.noInputDestination,
    afterHoursEnabled: d.afterHoursEnabled,
    options: d.options.map(o => ({ digit: o.digit, label: o.label.trim(), destination: o.destination }))
  };
}

export default function IVRScreen() {
  const { quickReplies, addToast, reportError } = useApp();
  const { me } = useSession();
  const businessNumber = me?.company?.displayPhone ?? 'your number';
  const FORWARDING_DESTINATIONS = useApp().forwardingDestinations;

  const ivrQ = useIvrMenu();
  const save = useSaveIvr();
  const test = useTestIvr();
  const upload = useUploadIvrGreeting();

  const [ivr, setIvr, resetDraft] = useServerDraft(ivrQ.data, toDraft);
  const [testPath, setTestPath] = useState<{ key: string; path: string[] } | null>(null);

  // Record a greeting in the browser.
  const recorder = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);

  const qrDest = (id: string) => `quick_reply:${id}`;
  const ivrDest = (to: string) => {
    if (to.startsWith('quick_reply:')) {
      const q = quickReplies.find(x => x.id === to.slice(12));
      return `Send ${q?.cmd ?? 'a deleted quick reply'} on WhatsApp, then hang up`;
    }
    return FORWARDING_DESTINATIONS[to] || to;
  };
  const ivrTargets = [...Object.keys(FORWARDING_DESTINATIONS), ...quickReplies.filter(q => q.id).map(q => qrDest(q.id as string))];
  const withCurrent = (targets: string[], current: string) => (targets.includes(current) ? targets : [current, ...targets]);

  if (ivrQ.isPending || !ivr) {
    return (
      <>
        <div className="ph">
          <div>
            <h1>IVR menu</h1>
            <p>What callers hear before anyone’s phone rings. They pick with the keypad and the call goes to the right person.</p>
          </div>
        </div>
        <p className="hint">{ivrQ.isError ? ivrQ.error.message : 'Loading…'}</p>
      </>
    );
  }

  const dirty = ivrQ.data ? JSON.stringify(toBody(toDraft(ivrQ.data))) !== JSON.stringify(toBody(ivr)) : false;

  const handleUpdateOption = (index: number, field: 'digit' | 'label' | 'destination', val: string) => {
    setIvr(prev => {
      const copy = [...prev.options];
      copy[index] = { ...copy[index], [field]: val };
      return { ...prev, options: field === 'digit' ? sortOpts(copy) : copy };
    });
  };

  const handleAddOption = () => {
    const used = ivr.options.map(o => o.digit);
    const availableKey = KEYS.split('').find(k => !used.includes(k));
    if (!availableKey) return;
    setIvr(prev => ({ ...prev, options: sortOpts([...prev.options, { digit: availableKey, label: '', destination: 'queue' }]) }));
    addToast(`Option ${availableKey} added. Give it a name and choose where it goes.`);
  };

  const handleRemoveOption = (index: number) => {
    const o = ivr.options[index];
    setIvr(prev => ({ ...prev, options: prev.options.filter((_, i) => i !== index) }));
    addToast(`Option ${o.digit} “${o.label}” removed.`);
  };

  const handleSave = () => {
    if (ivr.options.some(o => !o.label.trim())) {
      addToast('Give every option a name.');
      return;
    }
    save.mutate(toBody(ivr), {
      onSuccess: () => {
        setTestPath(null);
        addToast('IVR menu saved. It applies to the next call.');
      },
      onError: reportError
    });
  };

  const uploadGreeting = (file: File) => {
    upload.mutate(file, {
      onSuccess: fileId => {
        setIvr(prev => ({ ...prev, greetingFileId: fileId, audio: { name: file.name, url: URL.createObjectURL(file), dur: null } }));
        addToast('Audio file uploaded. Save to use it.');
      },
      onError: reportError
    });
  };

  const toggleRecord = async () => {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = e => chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        setRecording(false);
        const type = (rec.mimeType || 'audio/webm').split(';')[0];
        const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
        uploadGreeting(new File(chunks, `ivr-greeting.${ext}`, { type }));
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
    } catch (err) {
      reportError(err);
    }
  };

  const handleKeyPressTest = (key: string) => {
    test.mutate(key, {
      onSuccess: res => setTestPath({ key, path: res.path }),
      onError: reportError
    });
  };

  return (
    <>
      <div className="ph">
        <div>
          <h1>IVR menu</h1>
          <p>What callers hear before anyone’s phone rings. They pick with the keypad and the call goes to the right person.</p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          <label className="tgl" style={{ border: 0, padding: 0 }}>
            <input
              type="checkbox"
              checked={ivr.enabled}
              onChange={e => {
                const nextOn = e.target.checked;
                setIvr(prev => ({ ...prev, enabled: nextOn }));
              }}
            />
            <span>IVR on</span>
          </label>
          {dirty && (
            <button className="btn" onClick={resetDraft}>
              Reset
            </button>
          )}
          <button className="btn pri" disabled={save.isPending || !dirty} onClick={handleSave}>
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {ivrQ.data?.stageBRequired && (
        <div className="note i">
          <span className="ic">◈</span>
          <div>
            <b>The menu plays on live calls once the call media server is added</b>
            Playing the greeting and reading key presses on a real call needs the Smart Reply call media server (Stage B). Until then calls ring the team as set in Forwarding. You can build and test the menu now.
          </div>
        </div>
      )}

      {!ivr.enabled && (
        <div className="note w">
          <span className="ic">⚠</span>
          <div>
            <b>IVR is off</b>
            Calls go straight to the Sales queue.
          </div>
        </div>
      )}

      <div className="grid gmain">
        <div>
          <div className="card">
            <div className="card-h">
              <h2>Greeting</h2>
              <span className="sp" />
              <div className="seg">
                {(
                  [
                    ['rec', 'Recorded voice'],
                    ['tts', 'Text to speech']
                  ] as [IvrInput['greetingMode'], string][]
                ).map(o => (
                  <button
                    key={o[0]}
                    aria-pressed={ivr.greetingMode === o[0]}
                    className={ivr.greetingMode === o[0] ? 'active' : ''}
                    onClick={() => setIvr(prev => ({ ...prev, greetingMode: o[0] }))}
                  >
                    {o[1]}
                  </button>
                ))}
              </div>
            </div>

            <div className="card-b">
              {ivr.greetingMode === 'rec' ? (
                <>
                  <div className="att" style={{ marginBottom: '10px' }}>
                    {ivr.audio ? (
                      ivr.audio.url ? (
                        <audio controls preload="none" src={ivr.audio.url} style={{ width: '100%' }} />
                      ) : (
                        <span className="hint">{ivr.audio.name}</span>
                      )
                    ) : (
                      <span className="hint">No greeting uploaded yet.</span>
                    )}
                  </div>
                  <div className="attb">
                    <label className="btn sm">
                      {upload.isPending ? 'Uploading…' : '♪ Upload voice file'}
                      <input
                        type="file"
                        accept="audio/*"
                        hidden
                        disabled={upload.isPending}
                        onChange={e => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) uploadGreeting(f);
                        }}
                      />
                    </label>
                    <button type="button" className="btn sm" disabled={upload.isPending} onClick={() => void toggleRecord()}>
                      {recording ? '■ Stop' : '● Record'}
                    </button>
                    {ivr.greetingFileId && (
                      <button type="button" className="btn sm dg" onClick={() => setIvr(prev => ({ ...prev, greetingFileId: null, audio: null }))}>
                        Remove
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <p className="hint" style={{ marginTop: 0 }}>
                  The text below is read out to the caller.
                </p>
              )}

              <label className="f">{ivr.greetingMode === 'rec' ? 'Script (for staff and the transcript)' : 'What the caller hears'}</label>
              <textarea
                className="f-in"
                style={{ minHeight: '92px' }}
                maxLength={1000}
                value={ivr.greetingText}
                onChange={e => setIvr(prev => ({ ...prev, greetingText: e.target.value }))}
              />
              <p className="hint">When you add or remove an option, update the greeting so callers hear the right keys.</p>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h2>Options</h2>
              <span className="chip">{ivr.options.length} of 12 keys</span>
              <span className="sp" />
              <button className="btn sm pri" disabled={ivr.options.length >= 12} onClick={handleAddOption}>
                + Add option
              </button>
            </div>

            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Name</th>
                    <th>Send the caller to</th>
                    <th className="r" />
                  </tr>
                </thead>
                <tbody>
                  {ivr.options.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink-3)' }}>
                        No options yet. Add one for each key callers can press.
                      </td>
                    </tr>
                  )}
                  {ivr.options.map((o, idx) => (
                    <tr key={o.digit}>
                      <td style={{ width: '74px' }}>
                        <select className="f-in key" value={o.digit} onChange={e => handleUpdateOption(idx, 'digit', e.target.value)}>
                          {KEYS.split('').map(k => (
                            <option key={k} value={k} disabled={ivr.options.some(x => x.digit === k && x.digit !== o.digit)}>
                              {k}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="f-in"
                          value={o.label}
                          maxLength={60}
                          placeholder="What the caller hears"
                          onChange={e => handleUpdateOption(idx, 'label', e.target.value)}
                        />
                      </td>
                      <td>
                        <select className="f-in" value={o.destination} onChange={e => handleUpdateOption(idx, 'destination', e.target.value)}>
                          {withCurrent(ivrTargets, o.destination).map(t => (
                            <option key={t} value={t}>
                              {ivrDest(t)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="r">
                        <button className="btn sm dg" onClick={() => handleRemoveOption(idx)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h2>If the caller doesn’t choose</h2>
            </div>
            <div className="card-b">
              <div className="grid g2" style={{ gap: '12px', margin: 0 }}>
                <div>
                  <label className="f" style={{ marginTop: 0 }}>Wait for a key</label>
                  <div className="seg">
                    {[5, 8, 10, 15].map(x => (
                      <button
                        key={x}
                        aria-pressed={ivr.waitSeconds === x}
                        className={ivr.waitSeconds === x ? 'active' : ''}
                        onClick={() => setIvr(prev => ({ ...prev, waitSeconds: x }))}
                      >
                        {x} s
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="f" style={{ marginTop: 0 }}>Then send to</label>
                  <select className="f-in" value={ivr.noInputDestination} onChange={e => setIvr(prev => ({ ...prev, noInputDestination: e.target.value }))}>
                    {withCurrent(Object.keys(FORWARDING_DESTINATIONS), ivr.noInputDestination).map(t => (
                      <option key={t} value={t}>
                        {ivrDest(t)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="ln" style={{ marginTop: '10px' }}>
                <span>Wrong key</span>
                <b>Same as no key</b>
              </div>

              <label className="tgl">
                <input type="checkbox" checked={ivr.afterHoursEnabled} onChange={e => setIvr(prev => ({ ...prev, afterHoursEnabled: e.target.checked }))} />
                <span>Outside call hours: play “We’re closed” and ask for a voice note</span>
              </label>
            </div>
          </div>
        </div>

        <div>
          {/* Visual Call Flow */}
          <div className="card">
            <div className="card-h">
              <h2>How a call flows</h2>
            </div>
            <div className="card-b">
              <div className="flow">
                <div className="fn">☏ Customer calls {businessNumber}</div>
                <div className="fa" />
                <div className="fn">
                  🔊 Greeting{' '}
                  {ivr.greetingMode === 'rec'
                    ? ivr.audio
                      ? ivr.audio.dur
                        ? `(${ivr.audio.dur})`
                        : '(recorded)'
                      : '(none uploaded yet)'
                    : '(text to speech)'}
                </div>
                <div className="fa" />
                <div className="fb">
                  {ivr.options.map(o => (
                    <div key={o.digit}>
                      <span className="keyb">{o.digit}</span>
                      {o.label} <em>→ {ivrDest(o.destination).replace(', then hang up', '')}</em>
                    </div>
                  ))}
                  <div>
                    <span className="keyb">…</span>
                    No key in {ivr.waitSeconds} s <em>→ {ivrDest(ivr.noInputDestination)}</em>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Keypad tester: walks the saved menu on the server */}
          <div className="card">
            <div className="card-h">
              <h2>Test it</h2>
            </div>
            <div className="card-b">
              <p className="hint" style={{ margin: '0 0 10px' }}>
                Press a key the way a caller would.{dirty ? ' This tests the saved menu: save your changes first.' : ''}
              </p>
              <div className="keys">
                {KEYS.split('').map(k => {
                  const o = ivrQ.data?.options.find(x => x.digit === k);
                  return (
                    <button key={k} className={o ? '' : 'off'} disabled={test.isPending} onClick={() => handleKeyPressTest(k)}>
                      {k}
                      {o && <small>{o.label.split(' ')[0]}</small>}
                    </button>
                  );
                })}
              </div>
              <button className="btn sm" style={{ marginTop: '10px' }} disabled={test.isPending} onClick={() => handleKeyPressTest('')}>
                Don’t press anything
              </button>
              {test.isPending && <p className="hint">Testing…</p>}
              {testPath && !test.isPending && (
                <div style={{ marginTop: '10px' }}>
                  {testPath.path.map((step, i) => (
                    <div key={i} className="ln">
                      <span>{i + 1}.</span>
                      <b style={{ fontWeight: 500, textAlign: 'right' }}>{step}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
