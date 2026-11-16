'use client';

import React, { useState } from 'react';
import type { BusinessProfile } from '@smart-reply/shared';
import { useApp } from '@/context/AppContext';
import { errorMessage } from '@/lib/api';
import { BusinessProfileInput, useBusinessProfile, useSaveBusinessProfile, useWhatsappAccount } from '@/features/settings';

/** Values Meta accepts for the business category. */
const VERTICALS: [string, string][] = [
  ['', 'Not set'],
  ['APPAREL', 'Clothing and apparel'],
  ['AUTO', 'Automotive'],
  ['BEAUTY', 'Beauty, spa and salon'],
  ['EDU', 'Education'],
  ['ENTERTAIN', 'Entertainment'],
  ['EVENT_PLAN', 'Event planning and service'],
  ['FINANCE', 'Finance and banking'],
  ['GOVT', 'Public service'],
  ['GROCERY', 'Food and grocery'],
  ['HEALTH', 'Medical and health'],
  ['HOTEL', 'Hotel and lodging'],
  ['NONPROFIT', 'Non-profit'],
  ['PROF_SERVICES', 'Professional services'],
  ['RESTAURANT', 'Restaurant'],
  ['RETAIL', 'Shopping and retail'],
  ['TRAVEL', 'Travel and transportation'],
  ['OTHER', 'Other']
];

function toInput(p: BusinessProfile): BusinessProfileInput {
  const { syncedAt: _syncedAt, ...rest } = p;
  void _syncedAt;
  return rest;
}

function ProfileForm({ initial }: { initial: BusinessProfile }) {
  const { addToast, reportError } = useApp();
  const save = useSaveBusinessProfile();
  const account = useWhatsappAccount();
  const [f, setF] = useState<BusinessProfileInput>(() => toInput(initial));
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(initial.syncedAt);

  const set = <K extends keyof BusinessProfileInput>(k: K, v: BusinessProfileInput[K]) => setF(prev => ({ ...prev, [k]: v }));
  const connected = account.data?.connected ?? false;
  const known = VERTICALS.some(([v]) => v === f.vertical);

  const onSave = () => {
    setError(null);
    save.mutate(f, {
      onSuccess: saved => {
        setSyncedAt(saved.syncedAt);
        addToast(saved.syncedAt ? 'Profile updated on WhatsApp.' : 'Profile saved. It goes to WhatsApp once your number is connected.');
      },
      onError: err => {
        setError(errorMessage(err));
        reportError(err);
      }
    });
  };

  return (
    <>
      <div className="ph">
        <div>
          <h1>Business profile</h1>
          <p>What customers see when they open the chat.</p>
        </div>
        <div className="acts">
          <button className="btn pri" onClick={onSave} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
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
            <span className="sp" />
            {syncedAt ? (
              <span className="chip ok">Synced {new Date(syncedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
            ) : (
              <span className="chip">{connected ? 'Not synced' : 'Saved in Smart Reply'}</span>
            )}
          </div>
          <div className="card-b">
            <label className="f" htmlFor="bpName">Display name</label>
            <input className="f-in" id="bpName" maxLength={80} value={f.displayName} onChange={e => set('displayName', e.target.value)} />
            <p className="hint">Used in Smart Reply. Meta reviews the WhatsApp display name; LUMI AI submits changes to it.</p>

            <label className="f" htmlFor="bpAbout">About</label>
            <input className="f-in" id="bpAbout" maxLength={139} value={f.about} onChange={e => set('about', e.target.value)} />
            <p className="hint">{f.about.length} / 139</p>

            <label className="f" htmlFor="bpDesc">Description</label>
            <textarea className="f-in" id="bpDesc" maxLength={512} value={f.description} onChange={e => set('description', e.target.value)} />

            <label className="f" htmlFor="bpVert">Category</label>
            <select className="f-in" id="bpVert" value={f.vertical} onChange={e => set('vertical', e.target.value)}>
              {!known && <option value={f.vertical}>{f.vertical}</option>}
              {VERTICALS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>

            <label className="f" htmlFor="bpAddr">Address</label>
            <input className="f-in" id="bpAddr" maxLength={256} value={f.address} onChange={e => set('address', e.target.value)} />

            <label className="f" htmlFor="bpWeb">Website</label>
            <input className="f-in" id="bpWeb" maxLength={256} value={f.website} onChange={e => set('website', e.target.value)} />

            <label className="f" htmlFor="bpMail">Email</label>
            <input className="f-in" id="bpMail" type="email" maxLength={254} value={f.email} onChange={e => set('email', e.target.value)} />
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h2>Greeting &amp; away</h2>
          </div>
          <div className="card-b">
            <label className="tgl">
              <input type="checkbox" checked={f.greetingOn} onChange={e => set('greetingOn', e.target.checked)} />
              <span>Greeting for first-time customers</span>
            </label>
            <textarea
              className="f-in"
              style={{ margin: '6px 0 10px' }}
              maxLength={1024}
              value={f.greetingText}
              onChange={e => set('greetingText', e.target.value)}
              placeholder="Hello! Thanks for messaging us."
            />

            <label className="tgl">
              <input type="checkbox" checked={f.awayOn} onChange={e => set('awayOn', e.target.checked)} />
              <span>Away message outside call hours</span>
            </label>
            <textarea
              className="f-in"
              style={{ marginTop: '6px' }}
              maxLength={1024}
              value={f.awayText}
              onChange={e => set('awayText', e.target.value)}
              placeholder="We’re closed now. We’ll reply when we open."
            />
          </div>
        </div>
      </div>
    </>
  );
}

export default function BusinessProfileScreen() {
  const profile = useBusinessProfile();

  if (!profile.data) {
    return (
      <>
        <div className="ph">
          <div>
            <h1>Business profile</h1>
            <p>What customers see when they open the chat.</p>
          </div>
        </div>
        <div className="card">
          <div className="card-b">
            {profile.isError ? (
              <p className="hint">
                Could not load the profile. <button className="btn sm" onClick={() => void profile.refetch()}>Try again</button>
              </p>
            ) : (
              <p className="hint">Loading…</p>
            )}
          </div>
        </div>
      </>
    );
  }
  return <ProfileForm key={profile.dataUpdatedAt} initial={profile.data} />;
}
