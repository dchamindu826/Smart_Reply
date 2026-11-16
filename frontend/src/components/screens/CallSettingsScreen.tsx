'use client';

import React from 'react';
import type { CallHours, CallSettings, CallSettingsInput, ForwardingRules } from '@smart-reply/shared';
import { useApp } from '@/context/AppContext';
import { useCallSettings, useEnableCalling, useIvrMenu, useSaveCallSettings, useServerDraft } from '@/features/calls';
import { useAiSettingsSummary } from '@/features/ai';
import { useSession } from '@/features/session';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

type Day = CallHours['weekly'][number]['day'];
const DAYS: { id: Day; label: string }[] = [
  { id: 'MONDAY', label: 'Monday' },
  { id: 'TUESDAY', label: 'Tuesday' },
  { id: 'WEDNESDAY', label: 'Wednesday' },
  { id: 'THURSDAY', label: 'Thursday' },
  { id: 'FRIDAY', label: 'Friday' },
  { id: 'SATURDAY', label: 'Saturday' },
  { id: 'SUNDAY', label: 'Sunday' }
];
type KeepDays = CallSettingsInput['recording']['keepDays'];
const KEEP: { id: KeepDays; label: string }[] = [
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: '180', label: '180 days' },
  { id: '365', label: '1 year' },
  { id: 'forever', label: 'Forever' }
];
const FWD_ROWS: { id: keyof ForwardingRules; label: string }[] = [
  { id: 'noAnswer', label: 'Available, no answer' },
  { id: 'busy', label: 'Busy on another call' },
  { id: 'onBreak', label: 'On break' },
  { id: 'away', label: 'Away' },
  { id: 'dnd', label: 'Do not disturb' },
  { id: 'afterHours', label: 'Outside call hours' }
];

/** `0830` ⇄ `08:30` for <input type="time">. */
const toTime = (v: string) => (/^\d{4}$/.test(v) ? `${v.slice(0, 2)}:${v.slice(2)}` : '');
const fromTime = (v: string) => v.replace(':', '').slice(0, 4);

function toInput(s: CallSettings): CallSettingsInput {
  return {
    breakMaxMinutes: s.breakMaxMinutes,
    ringStrategy: s.ringStrategy,
    ringSeconds: s.ringSeconds,
    recording: { ...s.recording, keepDays: KEEP.find(k => k.id === s.recording.keepDays)?.id ?? '90' },
    linkPreviews: s.linkPreviews,
    forwarding: { ...s.forwarding },
    hours: { ...s.hours, weekly: [...s.hours.weekly], holidays: [...s.hours.holidays] }
  };
}

function hoursProblem(h: CallHours): string | null {
  for (const w of h.weekly) if (!(w.open < w.close)) return `Check the hours on ${DAYS.find(d => d.id === w.day)?.label}: closing must be after opening.`;
  for (const x of h.holidays) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date)) return 'Every holiday needs a date.';
    if ((x.open && !x.close) || (!x.open && x.close)) return `Holiday ${x.date}: give both opening and closing, or neither (closed all day).`;
    if (x.open && x.close && !(x.open < x.close)) return `Holiday ${x.date}: closing must be after opening.`;
  }
  return null;
}

export default function CallSettingsScreen() {
  const { setScreen, addToast, reportError } = useApp();
  const FORWARDING_DESTINATIONS = useApp().forwardingDestinations;

  const { me } = useSession();
  const connected = me?.features.whatsappConnected ?? false;
  const settingsQ = useCallSettings();
  const ivrQ = useIvrMenu();
  const aiQ = useAiSettingsSummary();
  const save = useSaveCallSettings();
  const enable = useEnableCalling();

  const [draft, update, resetDraft] = useServerDraft(settingsQ.data, toInput);

  if (settingsQ.isPending || !draft) {
    return (
      <>
        <div className="ph">
          <div>
            <h1>Call settings</h1>
            <p>WhatsApp Calling on the business number: recording, the queue, breaks and call hours.</p>
          </div>
        </div>
        <p className="hint">{settingsQ.isError ? settingsQ.error.message : 'Loading…'}</p>
      </>
    );
  }

  const server = settingsQ.data;
  const set = (patch: Partial<CallSettingsInput>) => update(prev => ({ ...prev, ...patch }));
  const setRec = (patch: Partial<CallSettingsInput['recording']>) => update(prev => ({ ...prev, recording: { ...prev.recording, ...patch } }));
  const setHours = (patch: Partial<CallHours>) => update(prev => ({ ...prev, hours: { ...prev.hours, ...patch } }));
  const setFwd = (k: keyof ForwardingRules, v: string) => update(prev => ({ ...prev, forwarding: { ...prev.forwarding, [k]: v } }));

  const weekly = draft.hours.weekly;
  const setRange = (index: number, patch: Partial<CallHours['weekly'][number]>) =>
    setHours({ weekly: weekly.map((w, i) => (i === index ? { ...w, ...patch } : w)) });
  const toggleDay = (day: Day, open: boolean) =>
    setHours({ weekly: open ? [...weekly, { day, open: '0900', close: '1800' }] : weekly.filter(w => w.day !== day) });
  const holidays = draft.hours.holidays;
  const setHoliday = (index: number, patch: Partial<CallHours['holidays'][number]>) =>
    setHours({ holidays: holidays.map((h, i) => (i === index ? { ...h, ...patch } : h)) });

  const dirty = server ? JSON.stringify(toInput(server)) !== JSON.stringify(draft) : false;

  const handleSave = () => {
    const problem = hoursProblem(draft.hours);
    if (problem) {
      addToast(problem);
      return;
    }
    const body: CallSettingsInput = {
      ...draft,
      hours: {
        ...draft.hours,
        holidays: draft.hours.holidays.map(h => (h.open && h.close ? h : { date: h.date }))
      }
    };
    save.mutate(body, {
      onSuccess: saved => addToast(saved.callingUnavailableReason && saved.callingEnabled ? saved.callingUnavailableReason : 'Call settings saved.'),
      onError: reportError
    });
  };

  const handleEnable = () =>
    enable.mutate(undefined, {
      onSuccess: () => addToast('WhatsApp Calling is on for your number.'),
      onError: reportError
    });

  const ivr = ivrQ.data;
  const ai = aiQ.data;
  const dests = Object.keys(FORWARDING_DESTINATIONS);

  return (
    <>
      <div className="ph">
        <div>
          <h1>Call settings</h1>
          <p>WhatsApp Calling on the business number: recording, the queue, breaks and call hours.</p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
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

      <div className="grid g2">
        <div className="card">
          <div className="card-h">
            <h2>Calling</h2>
            <span className={`chip ${server?.callingEnabled ? 'ok' : 'w'}`}>{server?.callingEnabled ? 'On' : 'Off'}</span>
          </div>
          <div className="card-b">
            <div className="ln">
              <span>WhatsApp Calling on this number</span>
              <b>{server?.callingEnabled ? 'On' : 'Off'}</b>
            </div>
            {server?.callingUnavailableReason && (
              <p className="hint" style={{ marginTop: '8px' }}>
                {server.callingUnavailableReason}
              </p>
            )}
            {!server?.callingEnabled && (
              <button
                className="btn sm pri"
                style={{ marginTop: '10px' }}
                disabled={enable.isPending || !connected}
                title={connected ? undefined : 'LUMI AI connects your WhatsApp number first.'}
                onClick={handleEnable}
              >
                {enable.isPending ? 'Turning on…' : 'Turn on WhatsApp Calling'}
              </button>
            )}
            <div className="ln" style={{ marginTop: '10px' }}>
              <span>Business-initiated calls</span>
              <b>With permission</b>
            </div>
            <label className="tgl">
              <input type="checkbox" checked={draft.linkPreviews} onChange={e => set({ linkPreviews: e.target.checked })} />
              <span>Show link previews in chats</span>
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
              <input type="checkbox" checked={draft.recording.auto} onChange={e => setRec({ auto: e.target.checked })} />
              <span>Record every call</span>
              <small>From connect</small>
            </label>
            <label className="tgl">
              <input type="checkbox" checked={draft.recording.announce} onChange={e => setRec({ announce: e.target.checked })} />
              <span>Play the announcement first</span>
              <small>“This call may be recorded”</small>
            </label>
            <label className="tgl">
              <input type="checkbox" checked={draft.recording.pauseAllowed} onChange={e => setRec({ pauseAllowed: e.target.checked })} />
              <span>Staff can pause recording</span>
              <small>For card or bank details</small>
            </label>
            <label className="tgl">
              <input type="checkbox" checked={Boolean(ai?.autoSummarizeCalls)} disabled readOnly />
              <span>Transcribe and summarise calls</span>
              <small>Set by LUMI AI</small>
            </label>

            <label className="f">Keep recordings</label>
            <div className="seg">
              {KEEP.map(o => (
                <button
                  key={o.id}
                  aria-pressed={draft.recording.keepDays === o.id}
                  className={draft.recording.keepDays === o.id ? 'active' : ''}
                  onClick={() => setRec({ keepDays: o.id })}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="hint" style={{ marginTop: '8px' }}>
              Managers hear every call. Staff hear only their own.
            </p>
            <p className="hint">Recording starts working when the call media server is added.</p>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h2>Ringing &amp; queue</h2>
          </div>
          <div className="card-b">
            <label className="f" style={{ marginTop: 0 }}>The Sales queue rings</label>
            <div className="seg">
              {(
                [
                  ['all', 'Everyone'],
                  ['rr', 'Round robin'],
                  ['idle', 'Longest idle']
                ] as [CallSettingsInput['ringStrategy'], string][]
              ).map(o => (
                <button key={o[0]} aria-pressed={draft.ringStrategy === o[0]} className={draft.ringStrategy === o[0] ? 'active' : ''} onClick={() => set({ ringStrategy: o[0] })}>
                  {o[1]}
                </button>
              ))}
            </div>

            <label className="f">Ring each person for</label>
            <div className="seg">
              {[10, 20, 30, 45].map(x => (
                <button key={x} aria-pressed={draft.ringSeconds === x} className={draft.ringSeconds === x ? 'active' : ''} onClick={() => set({ ringSeconds: x })}>
                  {x} seconds
                </button>
              ))}
            </div>
            <div className="ln" style={{ marginTop: '10px' }}>
              <span>People on break, away or DND</span>
              <b>Skipped</b>
            </div>
            <div className="ln">
              <span>IVR menu</span>
              <b>{ivrQ.isPending ? 'Loading…' : ivr?.enabled ? `${ivr.options.length} options · on` : 'Off'}</b>
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
                <button key={x} aria-pressed={draft.breakMaxMinutes === x} className={draft.breakMaxMinutes === x ? 'active' : ''} onClick={() => set({ breakMaxMinutes: x })}>
                  {x} min
                </button>
              ))}
            </div>
            <p className="hint" style={{ marginTop: '8px' }}>
              Staff see how much break time they have left. You see who is on break on Live status.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h2>Call hours</h2>
            <span className="chip">{draft.hours.timezone}</span>
          </div>
          <div className="card-b">
            <label className="tgl">
              <input type="checkbox" checked={draft.hours.enabled} onChange={e => setHours({ enabled: e.target.checked })} />
              <span>Use call hours</span>
              <small>{draft.hours.enabled ? 'On' : 'Off · calls ring at any time'}</small>
            </label>
            <label className="f">Time zone</label>
            <input className="f-in" style={{ maxWidth: '260px' }} value={draft.hours.timezone} onChange={e => setHours({ timezone: e.target.value })} />

            {DAYS.map(d => {
              const ranges = weekly.map((w, i) => ({ w, i })).filter(x => x.w.day === d.id);
              const open = ranges.length > 0;
              return (
                <div key={d.id} className="ln" style={{ alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '120px' }}>
                    <input type="checkbox" checked={open} onChange={e => toggleDay(d.id, e.target.checked)} />
                    <span>{d.label}</span>
                  </label>
                  <b style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                    {!open && 'Closed'}
                    {ranges.map(({ w, i }, n) => (
                      <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input
                          className="f-in"
                          type="time"
                          style={{ width: '110px', padding: '3px 6px' }}
                          value={toTime(w.open)}
                          onChange={e => setRange(i, { open: fromTime(e.target.value) })}
                          aria-label={`${d.label} opens`}
                        />
                        –
                        <input
                          className="f-in"
                          type="time"
                          style={{ width: '110px', padding: '3px 6px' }}
                          value={toTime(w.close)}
                          onChange={e => setRange(i, { close: fromTime(e.target.value) })}
                          aria-label={`${d.label} closes`}
                        />
                        {n > 0 ? (
                          <button className="btn sm dg" onClick={() => setHours({ weekly: weekly.filter((_, j) => j !== i) })} title="Remove these hours">
                            ✕
                          </button>
                        ) : (
                          <button
                            className="btn sm"
                            disabled={weekly.length >= 14}
                            onClick={() => setHours({ weekly: [...weekly, { day: d.id, open: '1400', close: '1800' }] })}
                            title="Add a second time range (for a lunch break)"
                          >
                            +
                          </button>
                        )}
                      </span>
                    ))}
                  </b>
                </div>
              );
            })}

            <label className="f">Holidays &amp; special days</label>
            {holidays.length === 0 && <p className="hint">No holidays added.</p>}
            {holidays.map((h, i) => (
              <div key={i} className="ln" style={{ alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                <input className="f-in" type="date" style={{ width: '150px', padding: '3px 6px' }} value={h.date} onChange={e => setHoliday(i, { date: e.target.value })} aria-label="Holiday date" />
                <b style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    className="f-in"
                    type="time"
                    style={{ width: '110px', padding: '3px 6px' }}
                    value={toTime(h.open ?? '')}
                    onChange={e => setHoliday(i, { open: e.target.value ? fromTime(e.target.value) : undefined })}
                    aria-label="Opens"
                  />
                  –
                  <input
                    className="f-in"
                    type="time"
                    style={{ width: '110px', padding: '3px 6px' }}
                    value={toTime(h.close ?? '')}
                    onChange={e => setHoliday(i, { close: e.target.value ? fromTime(e.target.value) : undefined })}
                    aria-label="Closes"
                  />
                  <button className="btn sm dg" onClick={() => setHours({ holidays: holidays.filter((_, j) => j !== i) })}>
                    Remove
                  </button>
                </b>
              </div>
            ))}
            <button
              className="btn sm"
              style={{ marginTop: '8px' }}
              disabled={holidays.length >= 50}
              onClick={() => {
                const d = new Date();
                const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                setHours({ holidays: [...holidays, { date }] });
              }}
            >
              + Add holiday
            </button>
            <p className="hint">Leave the times empty to close all day (for example Poya days).</p>

            <div className="ln" style={{ marginTop: '10px' }}>
              <span>Outside hours</span>
              <b>
                <select className="f-in" value={draft.forwarding.afterHours} onChange={e => setFwd('afterHours', e.target.value)}>
                  {dests.map(k => (
                    <option key={k} value={k}>
                      {FORWARDING_DESTINATIONS[k]}
                    </option>
                  ))}
                </select>
              </b>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h2>Call forwarding</h2>
            <span className="sp" />
            <button className="btn sm" onClick={() => setScreen('fwd')}>
              Open forwarding
            </button>
          </div>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Send the call to</th>
                </tr>
              </thead>
              <tbody>
                {FWD_ROWS.map(r => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.label}</b>
                    </td>
                    <td>
                      <select className="f-in" value={draft.forwarding[r.id]} onChange={e => setFwd(r.id, e.target.value)}>
                        {!dests.includes(draft.forwarding[r.id]) && <option value={draft.forwarding[r.id]}>{draft.forwarding[r.id]}</option>}
                        {dests.map(k => (
                          <option key={k} value={k}>
                            {FORWARDING_DESTINATIONS[k]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card-b">
            <p className="hint" style={{ margin: 0 }}>
              These are the team defaults. Staff can set their own rules on the Forwarding screen.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
