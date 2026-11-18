'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { AiBotSettings } from '@smart-reply/shared';
import { hangupVoiceTest, startVoiceTest, useSaveCompanyAiSettings, useVoicePreview, useVoiceStatus, useVoiceTest } from '@/features/admin';
import { errorMessage } from '@/lib/api';
import { applyAnswer, createOffer, type CallPeer } from '@/lib/webrtc';
import { useAdmin } from './AdminContext';

/** Settings this card owns; the bot settings card leaves them alone. */
export const VOICE_KEYS = [
  'voiceBotEnabled',
  'voiceModel',
  'voiceGreeting',
  'voiceLanguage',
  'voiceSpeed',
  'voiceMode',
  'voiceAnswerWhen',
  'voiceLiveModel',
  'voiceLiveVoice',
  'voiceTtsModel',
  'voiceTtsVoice',
  'voiceStyle',
  'voiceBookingEnabled',
  'voiceServices',
  'voiceSlotMinutes',
  'voiceSlotCapacity',
  'voiceBookingDaysAhead',
  'voiceConfirmOnWhatsapp',
  'voiceMaxCallSeconds'
] as const satisfies readonly (keyof AiBotSettings)[];

type VoiceKey = (typeof VOICE_KEYS)[number];
type VoiceSettings = Pick<AiBotSettings, VoiceKey>;

export function pickVoice(s: AiBotSettings): VoiceSettings {
  return Object.fromEntries(VOICE_KEYS.map(k => [k, s[k]])) as VoiceSettings;
}

/** Gemini TTS voices people tried; any voice name from AI Studio can be typed. */
const TTS_VOICES = ['Hali', 'Kore', 'Aoede', 'Leda', 'Zephyr', 'Sulafat', 'Achird', 'Puck', 'Charon', 'Orus'];
const LIVE_VOICES = ['Kore', 'Aoede', 'Leda', 'Zephyr', 'Puck', 'Charon', 'Fenrir', 'Orus'];

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="tgl">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function TestCall({ companyId, mode }: { companyId: string; mode: 'live' | 'studio' }) {
  const { reportError } = useAdmin();
  const [testId, setTestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const peer = useRef<CallPeer | null>(null);
  const test = useVoiceTest(companyId, testId);
  const state = test.data;
  const live = Boolean(testId) && state?.status !== 'ended' && state?.status !== 'failed';

  useEffect(() => () => peer.current?.close(), []);
  useEffect(() => {
    if (state?.status === 'ended' || state?.status === 'failed') {
      peer.current?.close();
      peer.current = null;
    }
  }, [state?.status]);

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const { peer: p, sdpOffer } = await createOffer();
      peer.current = p;
      const r = await startVoiceTest(companyId, { sdpOffer, mode });
      await applyAnswer(p, r.sdpAnswer);
      setTestId(r.testId);
    } catch (err) {
      peer.current?.close();
      peer.current = null;
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!testId) return;
    try {
      await hangupVoiceTest(companyId, testId);
    } catch (err) {
      reportError(err);
    }
    peer.current?.close();
    peer.current = null;
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {live ? (
          <button className="btn sm" type="button" onClick={() => void stop()}>
            End test call
          </button>
        ) : (
          <button className="btn sm pri" type="button" disabled={busy} onClick={() => void start()}>
            {busy ? 'Connecting…' : `Talk to the agent (${mode === 'live' ? 'Live' : 'Studio'})`}
          </button>
        )}
        {live ? <span className="chip ok">On a test call · speak now</span> : null}
        {state?.status === 'ended' ? (
          <span className="chip">
            Ended{state.seconds !== undefined ? ` · ${state.seconds}s` : ''}
            {state.mode && state.mode !== mode ? ` · ran in ${state.mode} mode` : ''}
          </span>
        ) : null}
      </div>
      <p className="hint">Uses your microphone. Nothing is saved: bookings on a test call are not stored and no messages are sent.</p>
      {error || state?.error ? (
        <div className="note w" style={{ marginTop: 8 }}>
          <span className="ic">!</span>
          <div>{error || state?.error}</div>
        </div>
      ) : null}
      {state && state.transcript.length > 0 ? (
        <div className="card" style={{ marginTop: 8 }}>
          <div className="card-b">
            {state.transcript.map((l, i) => (
              <div className="ln" key={i}>
                <span>{l.role === 'caller' ? 'You' : 'Agent'}</span>
                <b style={{ fontWeight: 400, textAlign: 'right' }}>{l.text}</b>
              </div>
            ))}
            {state.bookings.map((b, i) => (
              <div className="ln" key={`b${i}`}>
                <span>Test booking</span>
                <b>
                  {b.service ? `${b.service} · ` : ''}
                  {b.when}
                </b>
              </div>
            ))}
            {state.callback ? (
              <div className="ln">
                <span>Call back asked</span>
                <b>{state.callback}</b>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function VoiceAgentCard({ companyId, current }: { companyId: string; current: AiBotSettings }) {
  const { toast, reportError } = useAdmin();
  const save = useSaveCompanyAiSettings(companyId);
  const status = useVoiceStatus();
  const preview = useVoicePreview(companyId);
  const [v, setV] = useState<VoiceSettings>(() => pickVoice(current));
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const set = <K extends VoiceKey>(k: K, val: VoiceSettings[K]) => setV(prev => ({ ...prev, [k]: val }));
  const dirty = VOICE_KEYS.some(k => v[k] !== current[k]);

  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl]
  );

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    save.mutate({ ...current, ...v }, { onSuccess: () => toast('AI voice agent saved.'), onError: reportError });
  };

  const hear = (mode: 'live' | 'studio') => {
    if (dirty) {
      toast('Save the voice settings first, then listen.');
      return;
    }
    preview.mutate(
      { mode },
      {
        onSuccess: blob => {
          const url = URL.createObjectURL(blob);
          setAudioUrl(url);
        },
        onError: err => toast(errorMessage(err))
      }
    );
  };

  const st = status.data;
  return (
    <form className="card" onSubmit={submit}>
      <div className="card-h">
        <h2>AI voice agent</h2>
        {v.voiceBotEnabled ? <span className="chip ok">On</span> : <span className="chip">Off</span>}
        {st ? <span className={`chip ${st.online ? 'ok' : 'w'}`}>{st.online ? `Voice server online · ${st.activeCalls} on calls` : 'Voice server offline'}</span> : null}
        <span className="sp" />
        <button className="btn sm pri" type="submit" disabled={save.isPending || !dirty}>
          {save.isPending ? 'Saving…' : 'Save voice agent'}
        </button>
      </div>
      <div className="card-b">
        {st && !st.geminiKeySet ? (
          <div className="note w">
            <span className="ic">!</span>
            <div>
              <b>No Gemini API key</b>Add it under AI → Platform. The voice agent uses Google Gemini.
            </div>
          </div>
        ) : null}
        <Check label="Answer WhatsApp calls with the AI voice agent" checked={v.voiceBotEnabled} onChange={x => set('voiceBotEnabled', x)} />
        <div className="f-row f2">
          <div>
            <label className="f" htmlFor="va-when">The agent answers</label>
            <select className="f-in" id="va-when" value={v.voiceAnswerWhen} onChange={e => set('voiceAnswerWhen', e.target.value as VoiceSettings['voiceAnswerWhen'])}>
              <option value="no_answer">Calls nobody answers</option>
              <option value="after_hours">Calls after business hours</option>
              <option value="always">Every call</option>
            </select>
          </div>
          <div>
            <label className="f" htmlFor="va-mode">Mode</label>
            <select className="f-in" id="va-mode" value={v.voiceMode} onChange={e => set('voiceMode', e.target.value as VoiceSettings['voiceMode'])}>
              <option value="studio">Studio · best voice (about 2–3 s to reply)</option>
              <option value="live">Live · fastest (about 1 s to reply)</option>
            </select>
          </div>
        </div>
        <p className="hint">
          Studio listens, thinks with a Gemini model, then speaks with a Gemini TTS voice such as Hali. Live is Gemini’s speech-to-speech model: quicker, but only
          its own voices. If Live cannot start, the call carries on in Studio.
        </p>

        <div className="f-row f2">
          <div>
            <label className="f" htmlFor="va-lang">Language</label>
            <select className="f-in" id="va-lang" value={v.voiceLanguage} onChange={e => set('voiceLanguage', e.target.value as VoiceSettings['voiceLanguage'])}>
              <option value="sinhala">Sinhala (English if the caller speaks English)</option>
              <option value="trilingual">Sinhala, Tamil and English</option>
              <option value="english">English</option>
            </select>
          </div>
          <div>
            <label className="f" htmlFor="va-max">Longest call (minutes)</label>
            <input
              className="f-in"
              id="va-max"
              type="number"
              min={1}
              max={60}
              value={Math.round(v.voiceMaxCallSeconds / 60)}
              onChange={e => set('voiceMaxCallSeconds', Math.max(60, Math.min(3600, Number(e.target.value) * 60 || 60)))}
            />
          </div>
        </div>
        <label className="f" htmlFor="va-greet">Greeting</label>
        <textarea
          className="f-in"
          id="va-greet"
          maxLength={1024}
          placeholder="Empty: “ආයුබෝවන්! {company} වෙත ඔබව සාදරයෙන් පිළිගනිමු. මම {persona}…”"
          value={v.voiceGreeting}
          onChange={e => set('voiceGreeting', e.target.value)}
        />
        <p className="hint">{'{company}'} and {'{persona}'} are filled in. The agent uses the bot’s system prompt, knowledge and training examples.</p>

        <label className="f">Studio voice</label>
        <div className="f-row f2">
          <div>
            <label className="f" htmlFor="va-tts" style={{ marginTop: 0 }}>Voice</label>
            <input className="f-in" id="va-tts" list="va-tts-list" maxLength={40} value={v.voiceTtsVoice} onChange={e => set('voiceTtsVoice', e.target.value)} />
            <datalist id="va-tts-list">
              {TTS_VOICES.map(x => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="f" htmlFor="va-ttsm" style={{ marginTop: 0 }}>TTS model</label>
            <input className="f-in" id="va-ttsm" maxLength={80} value={v.voiceTtsModel} onChange={e => set('voiceTtsModel', e.target.value)} />
          </div>
        </div>
        <div className="f-row f2">
          <div>
            <label className="f" htmlFor="va-brain">Thinking model</label>
            <input className="f-in" id="va-brain" maxLength={60} placeholder="gemini-3.8-flash" value={v.voiceModel} onChange={e => set('voiceModel', e.target.value)} />
          </div>
          <div>
            <label className="f" htmlFor="va-speed">Pace: {v.voiceSpeed.toFixed(2)}×</label>
            <input
              id="va-speed"
              type="range"
              min={0.8}
              max={1.2}
              step={0.05}
              style={{ width: '100%', accentColor: 'var(--blue)' }}
              value={v.voiceSpeed}
              onChange={e => set('voiceSpeed', Number(e.target.value))}
            />
          </div>
        </div>
        <label className="f" htmlFor="va-style">Speaking style (optional)</label>
        <input
          className="f-in"
          id="va-style"
          maxLength={500}
          placeholder="Say this in natural, warm, everyday Sri Lankan Sinhala, like a friendly call-centre agent:"
          value={v.voiceStyle}
          onChange={e => set('voiceStyle', e.target.value)}
        />

        <label className="f">Live voice</label>
        <div className="f-row f2">
          <div>
            <label className="f" htmlFor="va-lv" style={{ marginTop: 0 }}>Voice</label>
            <input className="f-in" id="va-lv" list="va-lv-list" maxLength={40} value={v.voiceLiveVoice} onChange={e => set('voiceLiveVoice', e.target.value)} />
            <datalist id="va-lv-list">
              {LIVE_VOICES.map(x => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="f" htmlFor="va-lm" style={{ marginTop: 0 }}>Live model</label>
            <input className="f-in" id="va-lm" maxLength={80} value={v.voiceLiveModel} onChange={e => set('voiceLiveModel', e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn sm" type="button" disabled={preview.isPending} onClick={() => hear('studio')}>
            {preview.isPending && preview.variables?.mode === 'studio' ? 'Making…' : 'Hear Studio voice'}
          </button>
          <button className="btn sm" type="button" disabled={preview.isPending} onClick={() => hear('live')}>
            {preview.isPending && preview.variables?.mode === 'live' ? 'Making…' : 'Hear Live voice'}
          </button>
          {audioUrl ? <audio src={audioUrl} controls autoPlay style={{ height: 32 }} /> : null}
        </div>

        <label className="f">Appointments</label>
        <Check label="The agent can book appointments" checked={v.voiceBookingEnabled} onChange={x => set('voiceBookingEnabled', x)} />
        {v.voiceBookingEnabled ? (
          <>
            <label className="f" htmlFor="va-svc">Services (one per line)</label>
            <textarea className="f-in" id="va-svc" maxLength={4000} placeholder={'Eye test\nFrame fitting'} value={v.voiceServices} onChange={e => set('voiceServices', e.target.value)} />
            <div className="f-row f2">
              <div>
                <label className="f" htmlFor="va-slot">Each appointment (minutes)</label>
                <input className="f-in" id="va-slot" type="number" min={5} max={480} value={v.voiceSlotMinutes} onChange={e => set('voiceSlotMinutes', Number(e.target.value) || 30)} />
              </div>
              <div>
                <label className="f" htmlFor="va-cap">Bookings per time slot</label>
                <input className="f-in" id="va-cap" type="number" min={1} max={100} value={v.voiceSlotCapacity} onChange={e => set('voiceSlotCapacity', Number(e.target.value) || 1)} />
              </div>
            </div>
            <div className="f-row f2">
              <div>
                <label className="f" htmlFor="va-days">Book up to (days ahead)</label>
                <input className="f-in" id="va-days" type="number" min={1} max={365} value={v.voiceBookingDaysAhead} onChange={e => set('voiceBookingDaysAhead', Number(e.target.value) || 14)} />
              </div>
              <div style={{ alignSelf: 'end' }}>
                <Check label="Send a WhatsApp confirmation" checked={v.voiceConfirmOnWhatsapp} onChange={x => set('voiceConfirmOnWhatsapp', x)} />
              </div>
            </div>
            <p className="hint">Times come from the company’s business hours (Call settings). With no hours set, 09:00–17:00.</p>
          </>
        ) : null}

        <label className="f">Test call</label>
        {dirty ? <p className="hint">Save first; the test call uses the saved settings.</p> : <TestCall companyId={companyId} mode={v.voiceMode} />}
      </div>
    </form>
  );
}
