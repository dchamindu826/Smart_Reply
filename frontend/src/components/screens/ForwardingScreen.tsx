'use client';

import React, { useState } from 'react';
import type { CallSettings, CallSettingsInput, ForwardingRules } from '@smart-reply/shared';
import { useApp } from '@/context/AppContext';
import {
  useCallSettings,
  useCompanyForwarding,
  useMyForwarding,
  useSaveCallSettings,
  useSaveCompanyForwarding,
  useSaveMyForwarding,
  useServerDraft
} from '@/features/calls';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

type RuleKey = keyof ForwardingRules;
type Queue = Pick<CallSettings, 'ringSeconds' | 'ringStrategy'>;

/** Which presence each rule applies to, for the "Now" chip. */
const ROWS: { id: RuleKey; label: string; status: string[] }[] = [
  { id: 'noAnswer', label: 'Available, no answer', status: ['available'] },
  { id: 'busy', label: 'Busy on another call', status: ['oncall', 'busy'] },
  { id: 'onBreak', label: 'On break', status: ['brk', 'break'] },
  { id: 'away', label: 'Away', status: ['away'] },
  { id: 'dnd', label: 'Do not disturb', status: ['dnd'] },
  { id: 'afterHours', label: 'Outside call hours', status: [] }
];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const copyRules = (r: ForwardingRules): ForwardingRules => ({ ...r });
const toQueue = (s: CallSettings): Queue => ({ ringSeconds: s.ringSeconds, ringStrategy: s.ringStrategy });

export default function ForwardingScreen() {
  const { role, myStatus, staff, team, currentUser, setScreen, addToast, reportError } = useApp();
  const FORWARDING_DESTINATIONS = useApp().forwardingDestinations;

  const isM = role === 'manager';
  const [scope, setScope] = useState<'team' | 'mine'>(isM ? 'team' : 'mine');

  const companyQ = useCompanyForwarding(isM);
  const mineQ = useMyForwarding();
  const settingsQ = useCallSettings(isM);
  const saveCompany = useSaveCompanyForwarding();
  const saveMine = useSaveMyForwarding();
  const saveSettings = useSaveCallSettings();

  const [company, setCompany] = useServerDraft(companyQ.data, copyRules);
  const [mine, setMine] = useServerDraft(mineQ.data, copyRules);
  const [queue, setQueue] = useServerDraft(settingsQ.data, toQueue);

  const editingTeam = isM && scope === 'team';
  const rules = editingTeam ? company : mine;
  const rulesQ = editingTeam ? companyQ : mineQ;
  const frows = ROWS.filter(r => r.id !== 'afterHours' || editingTeam);

  const companyDirty = Boolean(company && companyQ.data && !same(company, companyQ.data));
  const mineDirty = Boolean(mine && mineQ.data && !same(mine, mineQ.data));
  const queueDirty = Boolean(queue && settingsQ.data && (queue.ringSeconds !== settingsQ.data.ringSeconds || queue.ringStrategy !== settingsQ.data.ringStrategy));
  const dirty = companyDirty || mineDirty || queueDirty;
  const saving = saveCompany.isPending || saveMine.isPending || saveSettings.isPending;

  const people = (isM ? team : staff).filter(s => s.id !== currentUser.id || editingTeam).map(s => `user:${s.id}`);
  const getFwdOptions = (k: RuleKey): string[] =>
    ({
      noAnswer: ['queue', ...people, 'manager', 'owner', 'vm', 'msg'],
      busy: ['wait', 'queue', ...people, 'manager', 'msg'],
      onBreak: ['queue', ...people, 'manager', 'owner', 'vm', 'msg'],
      away: ['queue', ...people, 'manager', 'owner', 'vm', 'msg'],
      dnd: ['msg', 'vm', 'queue'],
      afterHours: ['msg', 'vm', 'queue']
    })[k];

  const handleUpdateFwd = (key: RuleKey, val: string) => {
    if (editingTeam) setCompany(prev => ({ ...prev, [key]: val }));
    else setMine(prev => ({ ...prev, [key]: val }));
  };

  const handleSave = async () => {
    try {
      if (isM && queueDirty && settingsQ.data && queue && company) {
        // One write for the queue and the team rules: call settings carry both.
        const { callingEnabled, callingUnavailableReason, ...rest } = settingsQ.data;
        void callingEnabled;
        void callingUnavailableReason;
        await saveSettings.mutateAsync({
          ...rest,
          ...queue,
          recording: { ...rest.recording, keepDays: rest.recording.keepDays as CallSettingsInput['recording']['keepDays'] },
          forwarding: company
        });
      } else if (companyDirty && company) {
        await saveCompany.mutateAsync(company);
      }
      if (mineDirty && mine) await saveMine.mutateAsync(mine);
      addToast('Forwarding rules saved.');
    } catch (err) {
      reportError(err);
    }
  };

  const ringSeconds = queue?.ringSeconds ?? settingsQ.data?.ringSeconds;
  const ringStrategy = queue?.ringStrategy ?? settingsQ.data?.ringStrategy;
  const noAnswerDest = (company ?? mine)?.noAnswer;

  return (
    <>
      <div className="ph">
        <div>
          <h1>Call forwarding</h1>
          <p>
            {isM
              ? 'Where WhatsApp calls go when a person can’t answer. These are the team defaults; staff can set their own on the app.'
              : 'Where your WhatsApp calls go when you can’t answer. Customers never see your personal number.'}
          </p>
        </div>
        <div className="acts">
          <SectionThemeToggle />
          {isM && (
            <button className="btn" onClick={() => setScreen('ivr')}>
              IVR menu
            </button>
          )}
          <button className="btn pri" disabled={!dirty || saving} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="card-h">
            <h2>Rules</h2>
            {isM && (
              <>
                <span className="sp" />
                <div className="seg">
                  <button aria-pressed={scope === 'team'} className={scope === 'team' ? 'active' : ''} onClick={() => setScope('team')}>
                    Team defaults{companyDirty ? ' •' : ''}
                  </button>
                  <button aria-pressed={scope === 'mine'} className={scope === 'mine' ? 'active' : ''} onClick={() => setScope('mine')}>
                    My rules{mineDirty ? ' •' : ''}
                  </button>
                </div>
              </>
            )}
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
                {!rules ? (
                  <tr>
                    <td colSpan={2} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink-3)' }}>
                      {rulesQ.isError ? rulesQ.error.message : 'Loading…'}
                    </td>
                  </tr>
                ) : (
                  frows.map(f => {
                    const on = !editingTeam && f.status.includes(myStatus.call.st);
                    const current = rules[f.id];
                    const opts = getFwdOptions(f.id);
                    return (
                      <tr key={f.id}>
                        <td>
                          <b>{f.label}</b>
                          {on && (
                            <span className="chip ok" style={{ marginLeft: '6px' }}>
                              Now
                            </span>
                          )}
                          {f.id === 'noAnswer' && ringSeconds ? <div className="hint">after {ringSeconds} seconds</div> : null}
                        </td>
                        <td>
                          <select className="f-in" value={current} onChange={e => handleUpdateFwd(f.id, e.target.value)}>
                            {(opts.includes(current) ? opts : [current, ...opts]).map(o => {
                              const s = team.find(x => `user:${x.id}` === o);
                              return (
                                <option key={o} value={o}>
                                  {FORWARDING_DESTINATIONS[o] || o}
                                  {s ? ` · ${s.stt}` : ''}
                                </option>
                              );
                            })}
                          </select>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {isM && queue && (
            <div className="card-b">
              <label className="f">Ring for</label>
              <div className="seg">
                {[10, 20, 30, 45].map(x => (
                  <button
                    key={x}
                    aria-pressed={queue.ringSeconds === x}
                    className={queue.ringSeconds === x ? 'active' : ''}
                    onClick={() => setQueue(prev => ({ ...prev, ringSeconds: x }))}
                  >
                    {x} s
                  </button>
                ))}
              </div>
            </div>
          )}
          {!editingTeam && (
            <div className="card-b">
              <p className="hint" style={{ margin: 0 }}>
                Your rules apply to calls that ring you. Anything you don’t change follows the team defaults.
              </p>
            </div>
          )}
        </div>

        <div>
          <div className="card">
            <div className="card-h">
              <h2>Sales queue</h2>
              {ringStrategy && <span className="chip">{({ all: 'Ring everyone', rr: 'Round robin', idle: 'Longest idle' })[ringStrategy]}</span>}
            </div>
            {staff.length === 0 && (
              <div className="card-b">
                <p className="hint" style={{ margin: 0 }}>
                  No staff yet.
                </p>
              </div>
            )}
            {staff.map(s => {
              const skip = /brk|away|dnd/.test(s.call.st);
              return (
                <div key={s.id} className="list-row">
                  <i className={`av st ${s.st}`}>{s.i}</i>
                  <div className="bd">
                    <b>{s.n}</b>
                    <span>
                      <span className={`chip sc ${s.call.st === 'available' ? 'ok' : 'w'}`}>☏ {s.stt}</span>{' '}
                      {skip ? 'skipped' : s.call.st === 'oncall' ? 'rings when free' : 'rings now'}
                    </span>
                  </div>
                </div>
              );
            })}

            <div className="card-b">
              {isM && queue && (
                <>
                  <label className="f" style={{ marginTop: 0 }}>The queue rings</label>
                  <div className="seg">
                    {(
                      [
                        ['all', 'Everyone'],
                        ['rr', 'Round robin'],
                        ['idle', 'Longest idle']
                      ] as [Queue['ringStrategy'], string][]
                    ).map(o => (
                      <button
                        key={o[0]}
                        aria-pressed={queue.ringStrategy === o[0]}
                        className={queue.ringStrategy === o[0] ? 'active' : ''}
                        onClick={() => setQueue(prev => ({ ...prev, ringStrategy: o[0] }))}
                      >
                        {o[1]}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {noAnswerDest && (
                <p className="hint" style={{ marginTop: '8px' }}>
                  Nobody answers{ringSeconds ? ` in ${ringSeconds} s` : ''}: {FORWARDING_DESTINATIONS[noAnswerDest] || noAnswerDest}.
                </p>
              )}
            </div>
          </div>

          <div className="note i">
            <span className="ic">◈</span>
            <div>
              <b>Runs on the Smart Reply call server</b>
              Meta delivers the call to us; forwarding, queues, transfer and recording happen on our side.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
