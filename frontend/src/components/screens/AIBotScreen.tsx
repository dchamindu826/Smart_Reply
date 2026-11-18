'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { AiAddon, AiBotSettingsSummary } from '@smart-reply/shared';
import { useApp } from '@/context/AppContext';
import { useAiLogs, useAiSettingsSummary, useAiStatus, useRequestAiActivation, useUpdateAiSettings } from '@/features/ai';
import { logTime, toAiLog } from '@/lib/adapters';
import { AIBotLog } from '@/types';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

const READ_ONLY_NOTE = 'LUMI AI sets up and trains your AI bot. Contact LUMI AI to change it.';

const STATUS: Record<AiAddon['status'], { cls: string; label: string }> = {
  active: { cls: 'ok', label: 'Active' },
  paused: { cls: 'w', label: 'Paused' },
  expired: { cls: 'b', label: 'Expired' },
  off: { cls: '', label: 'Not active' }
};

const MODES: { id: AiBotSettingsSummary['chatBotMode']; label: string; desc: string }[] = [
  { id: 'always', label: '24/7 Autonomous Agent', desc: 'Replies instantly to all incoming customer chats in real-time.' },
  { id: 'after_hours', label: 'After-Hours & Weekends Only', desc: 'Active outside your call hours to capture after-work leads.' },
  { id: 'staff_busy', label: 'Smart Fallback When Busy', desc: 'Steps in automatically if no human staff replies in time.' }
];

const LANG: Record<AiBotSettingsSummary['languageMode'], string> = {
  trilingual: 'Trilingual (Sinhala, English, Singlish)',
  sinhala: 'Sinhala Priority (සිංහල)',
  english: 'English Only'
};

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '6px',
  border: '1px solid var(--rule-2)',
  background: 'var(--card-2)',
  fontSize: '13px',
  color: 'var(--ink)',
  minHeight: '36px',
  whiteSpace: 'pre-wrap'
};

/** A read-only value in the place of the old input. */
function Value({ children, empty = 'Not set' }: { children: React.ReactNode; empty?: string }) {
  const blank = children === '' || children === null || children === undefined;
  return <div style={{ ...fieldStyle, color: blank ? 'var(--ink-3)' : 'var(--ink)' }}>{blank ? empty : children}</div>;
}

function Check({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12.5px' }}>
      <input type="checkbox" checked={on} disabled readOnly style={{ marginTop: '2px' }} />
      <div>{children}</div>
    </label>
  );
}

function ActivationSheet() {
  const { addToast, reportError, closeSheet } = useApp();
  const request = useRequestAiActivation();
  const [message, setMessage] = useState('');
  return (
    <>
      <h2>Request activation</h2>
      <p className="sub">LUMI AI will contact you to set up, train and activate the AI bot for your business.</p>
      <label className="f" style={{ marginTop: 0 }}>Message (optional)</label>
      <textarea
        className="f-in"
        style={{ minHeight: '100px' }}
        maxLength={500}
        placeholder="For example: we want the bot to answer price questions after hours."
        value={message}
        onChange={e => setMessage(e.target.value)}
      />
      <button
        className="btn pri"
        style={{ width: '100%', justifyContent: 'center', marginTop: '14px' }}
        disabled={request.isPending}
        onClick={() =>
          request.mutate(message.trim(), {
            onSuccess: () => {
              addToast('Request sent to LUMI AI. They will contact you to activate the AI bot.');
              closeSheet();
            },
            onError: reportError
          })
        }
      >
        {request.isPending ? 'Sending…' : 'Send request'}
      </button>
    </>
  );
}

export default function AIBotScreen() {
  const { role, setScreen, openSheet, addToast } = useApp();
  const isManager = role === 'manager';

  const [activeTab, setActiveTab] = useState<'chat' | 'voice' | 'logs'>('chat');
  const [logChannelFilter, setLogChannelFilter] = useState<'all' | 'chat' | 'call'>('all');
  const [selectedLogDetail, setSelectedLogDetail] = useState<AIBotLog | null>(null);

  const statusQ = useAiStatus(isManager);
  const settingsQ = useAiSettingsSummary(isManager);
  const allLogsQ = useAiLogs('all', isManager);
  const logsQ = useAiLogs(logChannelFilter, isManager);
  const updateMutation = useUpdateAiSettings();

  const [formData, setFormData] = useState<AiBotSettingsSummary | null>(null);

  useEffect(() => {
    if (settingsQ.data) {
      setFormData(settingsQ.data);
    }
  }, [settingsQ.data]);

  const updateField = <K extends keyof AiBotSettingsSummary>(key: K, value: AiBotSettingsSummary[K]) => {
    setFormData(prev => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = async () => {
    if (!formData) return;
    try {
      await updateMutation.mutateAsync({
        chatBotEnabled: formData.chatBotEnabled,
        voiceBotEnabled: formData.voiceBotEnabled,
        chatBotMode: formData.chatBotMode,
        personaName: formData.personaName,
        languageMode: formData.languageMode,
        systemPrompt: formData.systemPrompt ?? '',
        confidenceThreshold: formData.confidenceThreshold,
        autoHandoffOnNegotiation: formData.autoHandoffOnNegotiation,
        autoHandoffOnComplaint: formData.autoHandoffOnComplaint,
        autoHandoffOnStaffRequest: formData.autoHandoffOnStaffRequest,
        welcomeMessage: formData.welcomeMessage,
        fallbackMessage: formData.fallbackMessage,
        voiceModel: formData.voiceModel,
        voiceGreeting: formData.voiceGreeting,
        autoTranscribeCalls: formData.autoTranscribeCalls,
        autoSummarizeCalls: formData.autoSummarizeCalls,
        missedCallAutoFollowup: formData.missedCallAutoFollowup,
        missedCallMessageTemplate: formData.missedCallMessageTemplate,
        voiceLanguage: formData.voiceLanguage,
        voiceSpeed: formData.voiceSpeed,
        model: formData.model
      });
      addToast('AI bot settings saved successfully!');
    } catch (err: any) {
      addToast(err?.message || 'Failed to save settings.');
    }
  };

  const allLogs = useMemo(() => allLogsQ.data ?? [], [allLogsQ.data]);
  const filteredLogs = useMemo(() => (logsQ.data ?? []).map(toAiLog), [logsQ.data]);

  if (!isManager) {
    return (
      <div className="card" style={{ maxWidth: '580px', margin: '60px auto', padding: '36px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
        <h2 style={{ fontSize: '20px', marginBottom: '8px', color: 'var(--ink)' }}>Manager Access Only</h2>
        <p style={{ color: 'var(--ink-2)', fontSize: '14px', lineHeight: '1.5', marginBottom: '24px' }}>
          The AI bot is set up and trained by LUMI AI. Your manager can see its status and activity.
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button type="button" className="btn pri" onClick={() => setScreen('chats')}>
            Go to My Chats
          </button>
        </div>
      </div>
    );
  }

  const addon = statusQ.data;
  const settings = formData || settingsQ.data;
  const st = addon ? STATUS[addon.status] : null;
  const active = addon?.status === 'active';

  const chatCount = allLogs.filter(l => l.channel === 'chat').length;
  const callCount = allLogs.filter(l => l.channel === 'call').length;
  const handoffs = allLogs.filter(l => l.status === 'handed_off').length;
  const handoffRate = allLogs.length ? `${((handoffs / allLogs.length) * 100).toFixed(1)}%` : '—';

  const headerChip = !addon
    ? 'Loading…'
    : !active
      ? `AI Bot ${st?.label}`
      : settings?.chatBotEnabled && settings?.voiceBotEnabled
        ? 'AI Bot Active · Calls & WhatsApp Live'
        : settings?.chatBotEnabled
          ? 'WhatsApp Bot Active'
          : 'AI Bot Configured';

  return (
    <div className="aibot-screen-container">
      {/* Top Header */}
      <div className="ph">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h1>AI Bot · Calls &amp; Messages</h1>
            <span
              className={`chip ${active ? 'ok' : st?.cls ?? ''}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '3px 9px' }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: active ? 'var(--ok)' : 'var(--ink-3)',
                  display: 'inline-block',
                  boxShadow: active ? '0 0 8px var(--ok)' : 'none'
                }}
              />
              {headerChip}
            </span>
            <span className="chip ok" style={{ margin: 0, fontSize: '11px' }}>
              Manager Control
            </span>
          </div>
          <p>Autonomous conversational intelligence for WhatsApp inquiries and incoming voice calls. Configure your bot settings below.</p>
        </div>

        <div className="acts">
          <SectionThemeToggle />
          {formData && (
            <button
              type="button"
              className="btn pri"
              disabled={updateMutation.isPending}
              onClick={handleSave}
              style={{ fontWeight: 600 }}
            >
              {updateMutation.isPending ? 'Saving…' : 'Save AI Settings'}
            </button>
          )}
          {addon && !active && (
            <button className="btn sec" onClick={() => openSheet(<ActivationSheet />)}>
              {addon.requestedAt ? 'Request again' : 'Request activation'}
            </button>
          )}
        </div>
      </div>

      <div className="note i">
        <span className="ic">◈</span>
        <div>
          <b>Manager Control Panel</b>
          You can customize and configure the AI Chat and Voice Assistant settings for your company below. Click &quot;Save AI Settings&quot; to apply your changes in real-time.
        </div>
      </div>

      {statusQ.isError && (
        <div className="note w">
          <span className="ic">⚠</span>
          <div>
            <b>Could not load the AI add-on</b>
            {statusQ.error.message}
          </div>
        </div>
      )}

      {addon && !active && addon.requestedAt && (
        <div className="note w">
          <span className="ic">◷</span>
          <div>
            <b>Activation requested</b>
            {addon.requestedByName ?? 'Your team'} asked LUMI AI on {logTime(addon.requestedAt)}. LUMI AI will contact you to set it up.
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="stats">
        <div className="stat i">
          <span>AI Add-on</span>
          <b style={{ fontSize: '20px' }}>{st ? st.label : '…'}</b>
          <small>
            {addon?.planName ?? 'No plan'}
            {addon?.activeUntil ? ` · until ${new Date(addon.activeUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
          </small>
        </div>
        <div className="stat ok">
          <span>AI Replies This Month</span>
          <b style={{ color: 'var(--ok)' }}>{addon ? addon.repliesThisMonth.toLocaleString() : '…'}</b>
          <small>{addon && addon.monthlyReplyLimit > 0 ? `of ${addon.monthlyReplyLimit.toLocaleString()} in your plan` : 'No monthly limit set'}</small>
        </div>
        <div className="stat">
          <span>Human Handoff Rate</span>
          <b style={{ fontSize: '20px' }}>{handoffRate}</b>
          <small>
            {chatCount} chats · {callCount} calls in the activity log
          </small>
        </div>
        <div className="stat">
          <span>Training</span>
          <b style={{ fontSize: '20px' }}>{settings ? `${settings.knowledgeDocuments} documents` : '…'}</b>
          <small>{settings ? `${settings.trainingExamples} approved examples · kept by LUMI AI` : 'Loading…'}</small>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="seg" style={{ marginBottom: '16px' }}>
        <button className={activeTab === 'chat' ? 'active' : ''} onClick={() => setActiveTab('chat')}>
          💬 WhatsApp &amp; Messages Bot
        </button>
        <button className={activeTab === 'voice' ? 'active' : ''} onClick={() => setActiveTab('voice')}>
          📞 Voice &amp; Call Assistant
        </button>
        <button className={activeTab === 'logs' ? 'active' : ''} onClick={() => setActiveTab('logs')}>
          📊 Activity Logs &amp; Transcripts ({allLogs.length})
        </button>
      </div>

      {(activeTab === 'chat' || activeTab === 'voice') && !settings && (
        <div className="card">
          <div className="card-b">
            <p className="hint">{settingsQ.isError ? settingsQ.error.message : 'Loading…'}</p>
          </div>
        </div>
      )}

      {/* TAB 1: WhatsApp & Messages Bot */}
      {activeTab === 'chat' && formData && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
          <div className="card">
            <div className="card-h">
              <h2>WhatsApp Bot Engine &amp; Behavior</h2>
              <span className="sp" />
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.chatBotEnabled}
                  onChange={e => updateField('chatBotEnabled', e.target.checked)}
                />
                <b>Enable WhatsApp AI</b>
              </label>
            </div>

            <div className="card-b" style={{ padding: '16px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Automation Trigger Mode</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {MODES.map(mode => (
                    <label
                      key={mode.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: `1px solid ${formData.chatBotMode === mode.id ? 'var(--blue)' : 'var(--rule)'}`,
                        background: formData.chatBotMode === mode.id ? 'var(--info-bg)' : 'var(--card-2)',
                        cursor: 'pointer'
                      }}
                      onClick={() => updateField('chatBotMode', mode.id)}
                    >
                      <input
                        type="radio"
                        name="botMode"
                        checked={formData.chatBotMode === mode.id}
                        onChange={() => updateField('chatBotMode', mode.id)}
                        style={{ marginTop: '3px' }}
                      />
                      <div>
                        <b style={{ fontSize: '13.5px', color: 'var(--ink)' }}>{mode.label}</b>
                        <p style={{ fontSize: '12px', color: 'var(--ink-2)', margin: '2px 0 0' }}>{mode.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Bot Persona Name</label>
                  <input
                    className="f-in"
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--rule)', background: 'var(--card-2)', fontSize: '13px' }}
                    value={formData.personaName}
                    onChange={e => updateField('personaName', e.target.value)}
                    placeholder="e.g. Assistant"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Language Intelligence</label>
                  <select
                    className="f-in"
                    style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--rule)', background: 'var(--card-2)', fontSize: '13px' }}
                    value={formData.languageMode}
                    onChange={e => updateField('languageMode', e.target.value as any)}
                  >
                    <option value="trilingual">Trilingual (Sinhala, English, Singlish)</option>
                    <option value="sinhala">Sinhala Priority (සිංහල)</option>
                    <option value="english">English Only</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>System Instructions &amp; Prompt</label>
                  <span className="hint" style={{ margin: 0, fontSize: '11.5px' }}>
                    Company instructions
                  </span>
                </div>
                <textarea
                  className="f-in"
                  rows={4}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--rule)', background: 'var(--card-2)', fontSize: '13px', resize: 'vertical' }}
                  value={formData.systemPrompt ?? ''}
                  onChange={e => updateField('systemPrompt', e.target.value)}
                  placeholder="Instructions for your bot: company details, prices, delivery terms, tone of voice..."
                />
              </div>

              <div style={{ marginBottom: '16px', background: 'var(--card-2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--rule)' }}>
                <b style={{ fontSize: '13px', display: 'block', marginBottom: '10px' }}>Safety &amp; Human Escalation Triggers</b>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.autoHandoffOnNegotiation}
                      onChange={e => updateField('autoHandoffOnNegotiation', e.target.checked)}
                    />
                    <span>Hand over to staff when customer asks for custom price discount or negotiation</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.autoHandoffOnComplaint}
                      onChange={e => updateField('autoHandoffOnComplaint', e.target.checked)}
                    />
                    <span>Hand over immediately on negative sentiment or complaint</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.autoHandoffOnStaffRequest}
                      onChange={e => updateField('autoHandoffOnStaffRequest', e.target.checked)}
                    />
                    <span>Hand over when customer requests human agent (&quot;talk to staff&quot;)</span>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn pri sm"
                  disabled={updateMutation.isPending}
                  onClick={handleSave}
                >
                  {updateMutation.isPending ? 'Saving…' : 'Save Chat Bot Settings'}
                </button>
              </div>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="card-h">
              <h2>Bot Replies &amp; Model</h2>
              <span className="sp" />
              <button
                type="button"
                className="btn sm pri"
                disabled={updateMutation.isPending}
                onClick={handleSave}
              >
                {updateMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
            <div className="card-b" style={{ padding: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Welcome message</label>
              <input
                className="f-in"
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--rule)', background: 'var(--card-2)', fontSize: '13px', marginBottom: '14px' }}
                value={formData.welcomeMessage}
                onChange={e => updateField('welcomeMessage', e.target.value)}
                placeholder="Leave blank for natural AI start"
              />

              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Fallback message (when unsure)</label>
              <input
                className="f-in"
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--rule)', background: 'var(--card-2)', fontSize: '13px', marginBottom: '14px' }}
                value={formData.fallbackMessage}
                onChange={e => updateField('fallbackMessage', e.target.value)}
              />

              <div style={{ marginTop: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                  <span>Hand over below confidence:</span>
                  <b>{formData.confidenceThreshold}%</b>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={formData.confidenceThreshold}
                  onChange={e => updateField('confidenceThreshold', Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--blue)' }}
                />
              </div>

              <div className="ln" style={{ marginTop: '16px' }}>
                <span>Knowledge Base</span>
                <b>{formData.knowledgeDocuments} documents · {formData.trainingExamples} examples</b>
              </div>

              <div className="ln" style={{ marginTop: '8px' }}>
                <span>AI model</span>
                <b>{formData.model || 'Platform default (Gemini)'}</b>
              </div>

              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn pri sm"
                  disabled={updateMutation.isPending}
                  onClick={handleSave}
                >
                  {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Voice & Call Assistant */}
      {activeTab === 'voice' && formData && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
          <div className="card">
            <div className="card-h">
              <h2>AI Voice Receptionist &amp; Call Handling</h2>
              <span className="sp" />
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.voiceBotEnabled}
                  onChange={e => updateField('voiceBotEnabled', e.target.checked)}
                />
                <b>Enable AI Call Receptionist</b>
              </label>
            </div>

            <div className="card-b" style={{ padding: '16px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>AI Voice Model &amp; Tone</label>
                <input
                  className="f-in"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--rule)', background: 'var(--card-2)', fontSize: '13px' }}
                  value={formData.voiceModel}
                  onChange={e => updateField('voiceModel', e.target.value)}
                  placeholder="e.g. gemini-2.5-flash-preview-tts"
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>Inbound Voice Greeting Script</label>
                  <span className="hint" style={{ margin: 0, fontSize: '11.5px' }}>
                    Spoken automatically when customer calls
                  </span>
                </div>
                <textarea
                  className="f-in"
                  rows={3}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--rule)', background: 'var(--card-2)', fontSize: '13px', resize: 'vertical' }}
                  value={formData.voiceGreeting}
                  onChange={e => updateField('voiceGreeting', e.target.value)}
                  placeholder="Hello! Welcome to our company. How can I help you today?"
                />
              </div>

              <div style={{ background: 'var(--card-2)', padding: '14px', borderRadius: '8px', border: '1px solid var(--rule)', marginBottom: '16px' }}>
                <b style={{ fontSize: '13px', display: 'block', marginBottom: '10px' }}>Real-time Call Automation Features</b>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12.5px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.autoTranscribeCalls}
                      onChange={e => updateField('autoTranscribeCalls', e.target.checked)}
                      style={{ marginTop: '2px' }}
                    />
                    <div>
                      <b>Live Speech-to-Text Transcription</b>
                      <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--ink-2)' }}>Transcribes Sinhala and English speech for call logs.</p>
                    </div>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12.5px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.autoSummarizeCalls}
                      onChange={e => updateField('autoSummarizeCalls', e.target.checked)}
                      style={{ marginTop: '2px' }}
                    />
                    <div>
                      <b>Automatic Call Summaries &amp; Next Steps</b>
                      <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--ink-2)' }}>A short summary with action items after every call.</p>
                    </div>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12.5px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.missedCallAutoFollowup}
                      onChange={e => updateField('missedCallAutoFollowup', e.target.checked)}
                      style={{ marginTop: '2px' }}
                    />
                    <div>
                      <b>Missed-Call Instant WhatsApp Recovery</b>
                      <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--ink-2)' }}>
                        If a caller hangs up before answering or lines are busy, a WhatsApp message is sent.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Missed Call Recovery WhatsApp Message</label>
                <textarea
                  className="f-in"
                  rows={3}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--rule)', background: 'var(--card-2)', fontSize: '13px', resize: 'vertical' }}
                  value={formData.missedCallMessageTemplate}
                  onChange={e => updateField('missedCallMessageTemplate', e.target.value)}
                  placeholder="Sorry we missed your call! How can our team help you today?"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn pri sm"
                  disabled={updateMutation.isPending}
                  onClick={handleSave}
                >
                  {updateMutation.isPending ? 'Saving…' : 'Save Voice Settings'}
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h2>Voice Configuration</h2>
              <span className="sp" />
              <button
                type="button"
                className="btn sm pri"
                disabled={updateMutation.isPending}
                onClick={handleSave}
              >
                {updateMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
            <div className="card-b" style={{ padding: '16px' }}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>Voice language</label>
                <select
                  className="f-in"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--rule)', background: 'var(--card-2)', fontSize: '13px' }}
                  value={formData.voiceLanguage}
                  onChange={e => updateField('voiceLanguage', e.target.value as any)}
                >
                  <option value="trilingual">Trilingual (Sinhala, English, Tamil)</option>
                  <option value="sinhala">Sinhala (සිංහල)</option>
                  <option value="english">English</option>
                </select>
              </div>

              <div style={{ marginTop: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                  <span>Speaking speed:</span>
                  <b>{formData.voiceSpeed.toFixed(2)}×</b>
                </div>
                <input
                  type="range"
                  min={0.8}
                  max={1.2}
                  step={0.05}
                  value={formData.voiceSpeed}
                  onChange={e => updateField('voiceSpeed', Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--blue)' }}
                />
              </div>

              <div className="ln" style={{ marginTop: '16px' }}>
                <span>AI call receptionist</span>
                <b>{formData.voiceBotEnabled ? 'Enabled' : 'Disabled'}</b>
              </div>

              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn pri sm"
                  disabled={updateMutation.isPending}
                  onClick={handleSave}
                >
                  {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Activity Logs & Transcripts */}
      {activeTab === 'logs' && (
        <div className="card">
          <div className="card-h">
            <div className="seg">
              <button className={logChannelFilter === 'all' ? 'active' : ''} onClick={() => setLogChannelFilter('all')}>
                All Bot Interactions ({allLogs.length})
              </button>
              <button className={logChannelFilter === 'chat' ? 'active' : ''} onClick={() => setLogChannelFilter('chat')}>
                💬 WhatsApp Chats ({chatCount})
              </button>
              <button className={logChannelFilter === 'call' ? 'active' : ''} onClick={() => setLogChannelFilter('call')}>
                📞 Voice Calls ({callCount})
              </button>
            </div>
            <span className="sp" />
            <span className="hint" style={{ margin: 0 }}>
              Latest bot replies
            </span>
          </div>

          <div className="card-b" style={{ padding: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--card-2)', borderBottom: '1px solid var(--rule)' }}>
                  <th style={{ padding: '10px 14px' }}>Channel</th>
                  <th style={{ padding: '10px 14px' }}>Customer / Phone</th>
                  <th style={{ padding: '10px 14px' }}>Detected Intent</th>
                  <th style={{ padding: '10px 14px' }}>Confidence</th>
                  <th style={{ padding: '10px 14px' }}>User Input / Query</th>
                  <th style={{ padding: '10px 14px' }}>Status</th>
                  <th style={{ padding: '10px 14px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {logsQ.isPending || logsQ.isError || filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px 0', color: 'var(--ink-3)' }}>
                      {logsQ.isPending ? 'Loading…' : logsQ.isError ? logsQ.error.message : 'No bot activity yet.'}
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map(log => (
                    <tr
                      key={log.id}
                      style={{ borderBottom: '1px solid var(--rule)', transition: 'background 0.15s ease' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--card-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 14px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontWeight: 600,
                            fontSize: '12px',
                            color: log.channel === 'chat' ? 'var(--blue)' : 'var(--magenta)'
                          }}
                        >
                          {log.channel === 'chat' ? '💬 Chat' : '📞 Call'}
                        </span>
                        <small style={{ display: 'block', color: 'var(--ink-3)', fontSize: '11px' }}>{log.timestamp}</small>
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        <b>{log.contactName}</b>
                        <small style={{ display: 'block', color: 'var(--ink-2)' }}>{log.contactPhone}</small>
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        <span
                          style={{
                            background: 'var(--card-2)',
                            border: '1px solid var(--rule)',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            color: 'var(--blue)'
                          }}
                        >
                          {log.intent}
                        </span>
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        <b style={{ color: log.confidence >= 90 ? 'var(--ok)' : 'var(--warn)' }}>{log.confidence}%</b>
                        {log.latencyMs ? <small style={{ display: 'block', color: 'var(--ink-3)', fontSize: '11px' }}>{log.latencyMs}ms</small> : null}
                      </td>

                      <td style={{ padding: '12px 14px', maxWidth: '300px' }}>
                        <p style={{ margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--ink)' }}>{log.userInput}</p>
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        <span
                          className={`chip ${log.status === 'resolved' ? 'ok' : log.status === 'handed_off' ? 'w' : ''}`}
                          style={{ fontSize: '11px' }}
                        >
                          {log.status === 'resolved' ? 'Automated' : log.status === 'handed_off' ? `Escalated (${log.agent || 'Staff'})` : 'Handled'}
                        </span>
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        <button type="button" className="btn sm" onClick={() => setSelectedLogDetail(log)}>
                          View Transcript
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Log Detail Modal */}
      {selectedLogDetail && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(5, 15, 31, 0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setSelectedLogDetail(null)}
        >
          <div
            style={{
              background: 'var(--card)',
              borderRadius: '12px',
              maxWidth: '650px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              border: '1px solid var(--rule-2)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <span className="chip ok" style={{ fontSize: '11px', textTransform: 'uppercase' }}>
                  {selectedLogDetail.channel === 'chat' ? 'WhatsApp Message Event' : 'Voice Call Event'}
                </span>
                <h3 style={{ fontSize: '17px', marginTop: '6px', color: 'var(--ink)' }}>
                  {selectedLogDetail.contactName} ({selectedLogDetail.contactPhone})
                </h3>
                <span className="hint" style={{ margin: 0 }}>
                  Timestamp: {selectedLogDetail.timestamp} · Intent: {selectedLogDetail.intent} ({selectedLogDetail.confidence}% confidence)
                  {selectedLogDetail.callDuration ? ` · Call ${selectedLogDetail.callDuration}` : ''}
                </span>
              </div>
              <button
                type="button"
                className="x"
                style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}
                onClick={() => setSelectedLogDetail(null)}
              >
                ×
              </button>
            </div>

            <div style={{ marginBottom: '14px', background: 'var(--card-2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--rule)' }}>
              <b style={{ display: 'block', fontSize: '12px', color: 'var(--ink-2)', marginBottom: '4px' }}>Customer Inquiry / Caller Transcript:</b>
              <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--ink)' }}>{selectedLogDetail.userInput}</p>
            </div>

            <div style={{ marginBottom: '18px', background: 'var(--info-bg)', padding: '12px', borderRadius: '8px', border: '1px solid var(--rule)' }}>
              <b style={{ display: 'block', fontSize: '12px', color: 'var(--blue)', marginBottom: '4px' }}>AI Bot Action &amp; Response Generated:</b>
              <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--ink)' }}>{selectedLogDetail.botOutput}</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="hint" style={{ margin: 0 }}>
                Tokens: {selectedLogDetail.tokensUsed ?? '—'} · Latency: {selectedLogDetail.latencyMs ? `${selectedLogDetail.latencyMs}ms` : '—'}
              </span>
              <button type="button" className="btn pri sm" onClick={() => setSelectedLogDetail(null)}>
                Close Transcript
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
