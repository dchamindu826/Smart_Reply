'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import { FORWARDING_DESTINATIONS } from '@/data/mockData';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

const KEYS = '1234567890*#';

export default function IVRScreen() {
  const {
    ivr,
    setIvr,
    staff,
    quickReplies,
    addToast
  } = useApp();

  const ivrDest = (to: string) => {
    if (to.startsWith('qr:')) return `Send ${to.slice(3)} on WhatsApp, then hang up`;
    return FORWARDING_DESTINATIONS[to] || to;
  };

  const ivrTargets = [
    'queue',
    's1',
    's2',
    's3',
    'mgr',
    'vm',
    'msg',
    ...quickReplies.slice(0, 4).map(q => `qr:${q.cmd}`)
  ];

  const handleUpdateOption = (index: number, field: string, val: string) => {
    setIvr(prev => {
      const copy = [...prev.opts];
      copy[index] = { ...copy[index], [field]: val };
      if (field === 'k') {
        copy.sort((a, b) => KEYS.indexOf(a.k) - KEYS.indexOf(b.k));
      }
      return { ...prev, opts: copy };
    });
  };

  const handleAddOption = () => {
    const used = ivr.opts.map(o => o.k);
    const availableKey = KEYS.split('').find(k => !used.includes(k));
    if (!availableKey) return;

    setIvr(prev => {
      const nextOpts = [...prev.opts, { k: availableKey, t: '', to: 'queue' }];
      nextOpts.sort((a, b) => KEYS.indexOf(a.k) - KEYS.indexOf(b.k));
      return { ...prev, opts: nextOpts };
    });
    addToast(`Option ${availableKey} added. Give it a name and choose where it goes.`);
  };

  const handleRemoveOption = (index: number) => {
    const o = ivr.opts[index];
    setIvr(prev => ({
      ...prev,
      opts: prev.opts.filter((_, i) => i !== index)
    }));
    addToast(`Option ${o.k} “${o.t}” removed.`);
  };

  const handleKeyPressTest = (key: string) => {
    if (!key) {
      addToast(`No key in ${ivr.wait} s → ${ivrDest(ivr.none)}.`);
      return;
    }
    const o = ivr.opts.find(x => x.k === key);
    if (o) {
      addToast(`Pressed ${key} · ${o.t || 'Option'} → ${ivrDest(o.to)}.`);
    } else {
      addToast(`Key ${key} isn’t in the menu. The caller hears the menu again.`);
    }
  };

  return (
    <>
      <div className="ph">
        <div>
          <h1>IVR menu</h1>
          <p>
            What callers hear before anyone’s phone rings. They pick with the keypad and the call goes to the right person.
          </p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          <label className="tgl" style={{ border: 0, padding: 0 }}>
            <input
              type="checkbox"
              checked={ivr.on}
              onChange={e => {
                const nextOn = e.target.checked;
                setIvr(prev => ({ ...prev, on: nextOn }));
                addToast(nextOn ? 'IVR on. Callers hear the menu first.' : 'IVR off. Calls go straight to the Sales queue.');
              }}
            />
            <span>IVR on</span>
          </label>
          <button className="btn pri" onClick={() => addToast('IVR menu saved. It applies to the next call.')}>
            Save
          </button>
        </div>
      </div>

      {!ivr.on && (
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
                {[
                  ['rec', 'Recorded voice'],
                  ['tts', 'Text to speech']
                ].map(o => (
                  <button
                    key={o[0]}
                    aria-pressed={ivr.mode === o[0]}
                    className={ivr.mode === o[0] ? 'active' : ''}
                    onClick={() => setIvr(prev => ({ ...prev, mode: o[0] as any }))}
                  >
                    {o[1]}
                  </button>
                ))}
              </div>
            </div>

            <div className="card-b">
              {ivr.mode === 'rec' ? (
                <>
                  <div className="att" style={{ marginBottom: '10px' }}>
                    {ivr.audio && (
                      <span className="att-voice">
                        <button className="pl" onClick={e => (e.currentTarget.parentNode as HTMLElement)?.classList.toggle('play')}>
                          ▶
                        </button>
                        <span className="wave">
                          {Array.from({ length: 22 }).map((_, i) => (
                            <i key={i} style={{ height: `${6 + ((i * 37) % 17)}px` }} />
                          ))}
                        </span>
                        <small>{ivr.audio.dur}</small>
                      </span>
                    )}
                  </div>
                  <div className="attb">
                    <label className="btn sm">
                      ♪ Upload voice file
                      <input type="file" accept="audio/*" hidden onChange={() => addToast('Audio file uploaded.')} />
                    </label>
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => addToast('New greeting recorded · 0:21')}
                    >
                      ● Record
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <label className="f" style={{ marginTop: 0 }}>Voice</label>
                  <select className="f-in" style={{ maxWidth: '260px' }}>
                    <option>Sinhala · female</option>
                    <option>Sinhala · male</option>
                    <option>English · female</option>
                    <option>Tamil · female</option>
                  </select>
                </>
              )}

              <label className="f">
                {ivr.mode === 'rec' ? 'Script (for staff and the transcript)' : 'What the caller hears'}
              </label>
              <textarea
                className="f-in"
                style={{ minHeight: '92px' }}
                value={ivr.greet}
                onChange={e => setIvr(prev => ({ ...prev, greet: e.target.value }))}
              />
              <p className="hint">
                When you add or remove an option, update the greeting so callers hear the right keys.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h2>Options</h2>
              <span className="chip">{ivr.opts.length} of 12 keys</span>
              <span className="sp" />
              <button
                className="btn sm pri"
                disabled={ivr.opts.length >= 12}
                onClick={handleAddOption}
              >
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
                  {ivr.opts.map((o, idx) => (
                    <tr key={idx}>
                      <td style={{ width: '74px' }}>
                        <select
                          className="f-in key"
                          value={o.k}
                          onChange={e => handleUpdateOption(idx, 'k', e.target.value)}
                        >
                          {KEYS.split('').map(k => (
                            <option
                              key={k}
                              value={k}
                              disabled={ivr.opts.some(x => x.k === k && x.k !== o.k)}
                            >
                              {k}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="f-in"
                          value={o.t}
                          placeholder="What the caller hears"
                          onChange={e => handleUpdateOption(idx, 't', e.target.value)}
                        />
                      </td>
                      <td>
                        <select
                          className="f-in"
                          value={o.to}
                          onChange={e => handleUpdateOption(idx, 'to', e.target.value)}
                        >
                          {ivrTargets.map(t => (
                            <option key={t} value={t}>
                              {ivrDest(t)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="r">
                        <button
                          className="btn sm dg"
                          onClick={() => handleRemoveOption(idx)}
                        >
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
                        aria-pressed={ivr.wait === x}
                        className={ivr.wait === x ? 'active' : ''}
                        onClick={() => setIvr(prev => ({ ...prev, wait: x }))}
                      >
                        {x} s
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="f" style={{ marginTop: 0 }}>Then send to</label>
                  <select
                    className="f-in"
                    value={ivr.none}
                    onChange={e => setIvr(prev => ({ ...prev, none: e.target.value }))}
                  >
                    {['queue', 's1', 's2', 's3', 'vm', 'msg'].map(t => (
                      <option key={t} value={t}>
                        {ivrDest(t)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="ln" style={{ marginTop: '10px' }}>
                <span>Wrong key</span>
                <b>Play the menu again (2×)</b>
              </div>

              <label className="tgl">
                <input
                  type="checkbox"
                  checked={ivr.after}
                  onChange={e => setIvr(prev => ({ ...prev, after: e.target.checked }))}
                />
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
                <div className="fn">☏ Customer calls +94 77 123 4567</div>
                <div className="fa" />
                <div className="fn">
                  🔊 Greeting {ivr.mode === 'rec' && ivr.audio ? `(${ivr.audio.dur})` : '(text to speech)'}
                </div>
                <div className="fa" />
                <div className="fb">
                  {ivr.opts.map(o => (
                    <div key={o.k}>
                      <span className="keyb">{o.k}</span>
                      {o.t} <em>→ {ivrDest(o.to).replace(', then hang up', '')}</em>
                    </div>
                  ))}
                  <div>
                    <span className="keyb">…</span>
                    No key in {ivr.wait} s <em>→ {ivrDest(ivr.none)}</em>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Keypad Tester */}
          <div className="card">
            <div className="card-h">
              <h2>Test it</h2>
            </div>
            <div className="card-b">
              <p className="hint" style={{ margin: '0 0 10px' }}>
                Press a key the way a caller would.
              </p>
              <div className="keys">
                {KEYS.split('').map(k => {
                  const o = ivr.opts.find(x => x.k === k);
                  return (
                    <button
                      key={k}
                      className={o ? '' : 'off'}
                      onClick={() => handleKeyPressTest(k)}
                    >
                      {k}
                      {o && <small>{o.t.split(' ')[0]}</small>}
                    </button>
                  );
                })}
              </div>
              <button
                className="btn sm"
                style={{ marginTop: '10px' }}
                onClick={() => handleKeyPressTest('')}
              >
                Don’t press anything
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
