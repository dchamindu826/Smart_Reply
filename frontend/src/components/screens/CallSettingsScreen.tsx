'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import { FORWARDING_DESTINATIONS } from '@/data/mockData';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

export default function CallSettingsScreen() {
  const {
    callConfig,
    setCallConfig,
    ivr,
    setScreen,
    addToast
  } = useApp();

  return (
    <>
      <div className="ph">
        <div>
          <h1>Call settings</h1>
          <p>WhatsApp Calling on the business number: recording, the queue, breaks and call hours.</p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          <button className="btn pri" onClick={() => addToast('Call settings saved.')}>
            Save
          </button>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-h">
            <h2>Calling</h2>
            <span className="chip ok">On</span>
          </div>
          <div className="card-b">
            <label className="tgl">
              <input type="checkbox" defaultChecked />
              <span>Show the call button in customer chats</span>
            </label>
            <label className="tgl">
              <input type="checkbox" defaultChecked />
              <span>Allow business-initiated calls</span>
              <small>With permission</small>
            </label>
            <label className="tgl">
              <input type="checkbox" defaultChecked />
              <span>Missed call: send the missed_call_si template</span>
            </label>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h2>Recording</h2>
            <span className="chip b">● REC</span>
          </div>
          <div className="card-b">
            <label className="tgl">
              <input
                type="checkbox"
                checked={callConfig.rec.auto}
                onChange={e => {
                  const val = e.target.checked;
                  setCallConfig(prev => ({ ...prev, rec: { ...prev.rec, auto: val } }));
                }}
              />
              <span>Record every call</span>
              <small>From connect</small>
            </label>
            <label className="tgl">
              <input
                type="checkbox"
                checked={callConfig.rec.ann}
                onChange={e => {
                  const val = e.target.checked;
                  setCallConfig(prev => ({ ...prev, rec: { ...prev.rec, ann: val } }));
                }}
              />
              <span>Play the announcement first</span>
              <small>“This call may be recorded”</small>
            </label>
            <label className="tgl">
              <input
                type="checkbox"
                checked={callConfig.rec.pause}
                onChange={e => {
                  const val = e.target.checked;
                  setCallConfig(prev => ({ ...prev, rec: { ...prev.rec, pause: val } }));
                }}
              />
              <span>Staff can pause recording</span>
              <small>For card or bank details</small>
            </label>
            <label className="tgl">
              <input type="checkbox" defaultChecked />
              <span>Transcribe and summarise calls</span>
            </label>

            <label className="f">Keep recordings</label>
            <div className="seg">
              {[
                ['30', '30 days'],
                ['90', '90 days'],
                ['365', '1 year']
              ].map(o => (
                <button
                  key={o[0]}
                  aria-pressed={callConfig.rec.keep === o[0]}
                  className={callConfig.rec.keep === o[0] ? 'active' : ''}
                  onClick={() => setCallConfig(prev => ({ ...prev, rec: { ...prev.rec, keep: o[0] } }))}
                >
                  {o[1]}
                </button>
              ))}
            </div>
            <p className="hint" style={{ marginTop: '8px' }}>
              Managers hear every call. Staff hear only their own.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h2>Ringing &amp; queue</h2>
          </div>
          <div className="card-b">
            <label className="f" style={{ marginTop: 0 }}>The Sales queue rings</label>
            <div className="seg">
              {[
                ['all', 'Everyone'],
                ['rr', 'Round robin'],
                ['idle', 'Longest idle']
              ].map(o => (
                <button
                  key={o[0]}
                  aria-pressed={callConfig.ring === o[0]}
                  className={callConfig.ring === o[0] ? 'active' : ''}
                  onClick={() => setCallConfig(prev => ({ ...prev, ring: o[0] as any }))}
                >
                  {o[1]}
                </button>
              ))}
            </div>

            <div className="ln" style={{ marginTop: '10px' }}>
              <span>Ring each person for</span>
              <b>{callConfig.ringsec} seconds</b>
            </div>
            <div className="ln">
              <span>People on break, away or DND</span>
              <b>Skipped</b>
            </div>
            <div className="ln">
              <span>IVR menu</span>
              <b>{ivr.on ? `${ivr.opts.length} options · on` : 'Off'}</b>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button className="btn sm" onClick={() => setScreen('ivr')}>
                IVR menu
              </button>
              <button className="btn sm" onClick={() => setScreen('fwd')}>
                Call forwarding
              </button>
              <button className="btn sm" onClick={() => setScreen('status')}>
                Live status
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h2>Breaks</h2>
          </div>
          <div className="card-b">
            <label className="f" style={{ marginTop: 0 }}>Break time per person, per day</label>
            <div className="seg">
              {[30, 60, 90].map(x => (
                <button
                  key={x}
                  aria-pressed={callConfig.brkmax === x}
                  className={callConfig.brkmax === x ? 'active' : ''}
                  onClick={() => setCallConfig(prev => ({ ...prev, brkmax: x }))}
                >
                  {x} min
                </button>
              ))}
            </div>

            <label className="tgl" style={{ marginTop: '8px' }}>
              <input type="checkbox" defaultChecked />
              <span>Tell me when a break runs over</span>
            </label>
            <label className="tgl">
              <input type="checkbox" />
              <span>Staff must ask before a break</span>
              <small>Off</small>
            </label>
            <label className="tgl">
              <input type="checkbox" defaultChecked />
              <span>Staff can set calls and chats separately</span>
            </label>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h2>Call hours</h2>
            <span className="chip">Asia/Colombo</span>
          </div>
          <div className="card-b">
            <div className="ln">
              <span>Monday – Saturday</span>
              <b>09:00 – 18:00</b>
            </div>
            <div className="ln">
              <span>Sunday &amp; Poya</span>
              <b>Closed</b>
            </div>
            <div className="ln">
              <span>Outside hours</span>
              <b>{FORWARDING_DESTINATIONS[callConfig.fwd.after] || 'Missed-call message + callback'}</b>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
