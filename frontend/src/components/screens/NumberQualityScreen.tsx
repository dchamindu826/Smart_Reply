'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import { limitLong, limitShort, qualityView, useRefreshWhatsappAccount, useWhatsappAccount } from '@/features/settings';

const NAME_STATUS: Record<string, string> = {
  APPROVED: 'Approved',
  AVAILABLE_WITHOUT_REVIEW: 'Available',
  DECLINED: 'Declined',
  EXPIRED: 'Expired',
  PENDING_REVIEW: 'In review',
  NONE: 'Not submitted'
};

function day(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

function maskId(id: string | null): string {
  if (!id) return '—';
  return id.length > 8 ? `${id.slice(0, 4)} •••• ${id.slice(-4)}` : id;
}

export default function NumberQualityScreen() {
  const { addToast, reportError } = useApp();
  const account = useWhatsappAccount();
  const refresh = useRefreshWhatsappAccount();
  const a = account.data;
  const quality = qualityView(a?.qualityRating ?? null);
  const nameStatus = a?.nameStatus ? (NAME_STATUS[a.nameStatus.toUpperCase()] ?? a.nameStatus) : '—';

  const onRefresh = () =>
    refresh.mutate(undefined, {
      onSuccess: () => addToast('Number details refreshed from Meta.'),
      onError: reportError
    });

  return (
    <>
      <div className="ph">
        <div>
          <h1>Number &amp; quality</h1>
          <p>Health of the WhatsApp Business number, as Meta reports it.</p>
        </div>
        {a?.connected && (
          <div className="acts">
            <button className="btn" onClick={onRefresh} disabled={refresh.isPending}>
              {refresh.isPending ? 'Refreshing…' : 'Refresh from Meta'}
            </button>
          </div>
        )}
      </div>

      {account.isLoading ? (
        <div className="card">
          <div className="card-b"><p className="hint">Loading…</p></div>
        </div>
      ) : account.isError || !a ? (
        <div className="card">
          <div className="card-b">
            <p className="hint">
              Could not load the number. <button className="btn sm" onClick={() => void account.refetch()}>Try again</button>
            </p>
          </div>
        </div>
      ) : !a.connected && a.status !== 'error' && a.status !== 'pending' ? (
        <div className="card">
          <div className="empty">
            <b>WhatsApp number not connected</b>
            LUMI AI connects your WhatsApp number. Contact LUMI AI.
          </div>
        </div>
      ) : (
        <>
          <div className="stats">
            <div className={`stat ${quality.cls}`}>
              <span>Quality rating</span>
              <b>{quality.text}</b>
              <small>{a.qualityRating ?? 'Not reported yet'}</small>
            </div>
            <div className="stat i">
              <span>Messaging limit</span>
              <b>{limitShort(a.messagingLimit)}</b>
              <small>Customers per 24h</small>
            </div>
            <div className="stat">
              <span>Name status</span>
              <b>{nameStatus}</b>
              <small>{a.verifiedName ?? '—'}</small>
            </div>
            <div className={`stat ${a.callingEnabled ? 'ok' : ''}`}>
              <span>Calling</span>
              <b>{a.callingEnabled ? 'On' : 'Off'}</b>
              <small>WhatsApp voice calls</small>
            </div>
          </div>

          {a.lastError && (
            <p className="hint" style={{ color: 'var(--bad)', marginBottom: '10px' }}>
              Last error from Meta: {a.lastError}
            </p>
          )}

          <div className="card">
            <div className="card-h">
              <h2>Connection</h2>
              <span className={`chip ${a.status === 'connected' ? 'ok' : a.status === 'pending' ? 'w' : 'b'}`}>
                {a.status === 'connected' ? 'Cloud API' : a.status === 'pending' ? 'Pending' : a.status === 'error' ? 'Error' : 'Disconnected'}
              </span>
            </div>
            <div className="card-b">
              <div className="ln"><span>Phone number</span><b>{a.displayPhone ?? '—'}</b></div>
              <div className="ln"><span>Phone number ID</span><b>{maskId(a.phoneNumberId)}</b></div>
              <div className="ln"><span>WhatsApp Business account</span><b>{a.verifiedName ?? '—'}{a.nameStatus?.toUpperCase() === 'APPROVED' ? ' (verified)' : ''}</b></div>
              <div className="ln"><span>Messaging limit</span><b>{limitLong(a.messagingLimit)}</b></div>
              <div className="ln"><span>Webhook</span><b>{a.webhookSubscribedAt ? `Subscribed ${day(a.webhookSubscribedAt)}` : 'Not subscribed'}</b></div>
              <div className="ln"><span>Connected</span><b>{day(a.connectedAt)}</b></div>
              <div className="ln">
                <span>Connected by</span>
                <b>{a.connectMethod === 'embedded_signup' ? 'Embedded signup' : a.connectMethod === 'manual' ? 'LUMI AI (manual setup)' : '—'}</b>
              </div>
            </div>
          </div>

          <p className="hint">LUMI AI manages the connection to Meta. To change or move this number, contact LUMI AI.</p>
        </>
      )}
    </>
  );
}
