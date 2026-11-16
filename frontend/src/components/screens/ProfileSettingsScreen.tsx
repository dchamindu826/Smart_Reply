'use client';

import React, { useState } from 'react';
import type { MeResponse, NotifySettings, UpdateMeInput } from '@smart-reply/shared';
import { useApp } from '@/context/AppContext';
import { errorMessage } from '@/lib/api';
import { useSession } from '@/features/session';
import { useChangePassword, useUpdateMe } from '@/features/me';

type Lang = NonNullable<UpdateMeInput['language']>;

const LANGUAGES: [Lang, string][] = [
  ['en', 'English'],
  ['si', 'Sinhala'],
  ['ta', 'Tamil']
];

const NOTIFY: [keyof NotifySettings, string][] = [
  ['newChat', 'New chat assigned to me'],
  ['sound', 'Incoming call ringtone'],
  ['newMessage', 'Every message in my chats'],
  ['missedCall', 'Missed calls'],
  ['desktop', 'Desktop notifications']
];

interface FormState {
  name: string;
  title: string;
  phone: string;
  language: Lang;
  signature: string;
  notify: NotifySettings;
}

function fromMe(me: MeResponse): FormState {
  const u = me.user;
  const language: Lang = u.language === 'si' || u.language === 'ta' ? u.language : 'en';
  return { name: u.name, title: u.title, phone: u.phone ?? '', language, signature: u.signature, notify: { ...u.notify } };
}

function PasswordCard() {
  const { addToast, reportError } = useApp();
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (next.length < 8) return setError('Use at least 8 characters for the new password.');
    if (next !== confirm) return setError('The new passwords do not match.');
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          setCurrent('');
          setNext('');
          setConfirm('');
          addToast('Password changed. Other devices must sign in again.');
        },
        onError: err => {
          setError(errorMessage(err));
          reportError(err);
        }
      }
    );
  };

  return (
    <div className="card">
      <div className="card-h">
        <h2>Password</h2>
      </div>
      <div className="card-b">
        <label className="f" htmlFor="pwCur">Current password</label>
        <input className="f-in" id="pwCur" type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} />
        <div className="f-row f2">
          <div>
            <label className="f" htmlFor="pwNew">New password</label>
            <input className="f-in" id="pwNew" type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} />
          </div>
          <div>
            <label className="f" htmlFor="pwConf">Repeat new password</label>
            <input className="f-in" id="pwConf" type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} />
          </div>
        </div>
        {error && (
          <p className="hint" role="alert" style={{ color: 'var(--bad)' }}>
            {error}
          </p>
        )}
        <button className="btn" style={{ marginTop: '12px' }} onClick={submit} disabled={change.isPending || !current || !next}>
          {change.isPending ? 'Changing…' : 'Change password'}
        </button>
      </div>
    </div>
  );
}

function ProfileForm({ me }: { me: MeResponse }) {
  const { addToast, reportError, signOut } = useApp();
  const { refreshMe } = useSession();
  const update = useUpdateMe();
  const [f, setF] = useState<FormState>(() => fromMe(me));
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF(prev => ({ ...prev, [k]: v }));
  const setNotify = (k: keyof NotifySettings, v: boolean) => setF(prev => ({ ...prev, notify: { ...prev.notify, [k]: v } }));

  const save = () => {
    setError(null);
    if (!f.name.trim()) return setError('Enter your name.');
    update.mutate(
      {
        name: f.name.trim(),
        title: f.title.trim(),
        phone: f.phone.trim() ? f.phone.trim() : null,
        language: f.language,
        signature: f.signature.trim(),
        notify: f.notify
      },
      {
        onSuccess: () => {
          void refreshMe();
          addToast('Profile saved.');
        },
        onError: err => {
          setError(errorMessage(err));
          reportError(err);
        }
      }
    );
  };

  return (
    <>
      <div className="ph">
        <div>
          <h1>Profile settings</h1>
          <p>What customers see when you reply.</p>
        </div>
        <div className="acts">
          <button className="btn" onClick={() => void signOut()}>
            Sign out
          </button>
          <button className="btn pri" onClick={save} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {error && (
        <p className="hint" role="alert" style={{ color: 'var(--bad)', marginBottom: '10px' }}>
          {error}
        </p>
      )}

      <div className="grid g2">
        <div className="card">
          <div className="card-h">
            <h2>Profile</h2>
          </div>
          <div className="card-b">
            <label className="f" htmlFor="pfName">Name shown to customers</label>
            <input className="f-in" id="pfName" maxLength={80} value={f.name} onChange={e => set('name', e.target.value)} />

            <div className="f-row f2">
              <div>
                <label className="f" htmlFor="pfTitle">Job title</label>
                <input className="f-in" id="pfTitle" maxLength={80} value={f.title} onChange={e => set('title', e.target.value)} />
              </div>
              <div>
                <label className="f" htmlFor="pfPhone">Phone</label>
                <input
                  className="f-in"
                  id="pfPhone"
                  type="tel"
                  placeholder="+94 77 123 4567"
                  value={f.phone}
                  onChange={e => set('phone', e.target.value)}
                />
              </div>
            </div>

            <label className="f" htmlFor="pfLang">Language</label>
            <select className="f-in" id="pfLang" value={f.language} onChange={e => set('language', e.target.value as Lang)}>
              {LANGUAGES.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>

            <label className="f" htmlFor="pfSig">Signature</label>
            <input className="f-in" id="pfSig" maxLength={200} value={f.signature} onChange={e => set('signature', e.target.value)} />

            <p className="hint">Signed in as {me.user.email}</p>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-h">
              <h2>Notifications</h2>
            </div>
            <div className="card-b">
              {NOTIFY.map(([k, label]) => (
                <label className="tgl" key={k}>
                  <input type="checkbox" checked={f.notify[k]} onChange={e => setNotify(k, e.target.checked)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          {!me.impersonation && <PasswordCard />}
        </div>
      </div>
    </>
  );
}

export default function ProfileSettingsScreen() {
  const { me } = useSession();
  if (!me) {
    return (
      <div className="ph">
        <div>
          <h1>Profile settings</h1>
          <p>Loading…</p>
        </div>
      </div>
    );
  }
  return <ProfileForm key={me.user.id} me={me} />;
}
