'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { AIBotSettings, AIBotLog, SimulatorMessage } from '@/types';
import { playSentSound, playReceivedSound } from '@/utils/soundEffects';
import SectionThemeToggle from '@/components/common/SectionThemeToggle';

export default function AIBotScreen() {
  const {
    role,
    setRole,
    setScreen,
    aiBotSettings,
    updateAIBotSettings,
    aiLogs,
    addAILog,
    addToast
  } = useApp();


  const [activeTab, setActiveTab] = useState<'chat' | 'voice' | 'logs'>('chat');

  // Form local state
  const [settings, setSettings] = useState<AIBotSettings>(aiBotSettings);

  // Chat Simulator State
  const [simulatorMessages, setSimulatorMessages] = useState<SimulatorMessage[]>([
    {
      id: 'sim_1',
      sender: 'bot',
      text: settings.welcomeMessage,
      time: 'Just now',
      intent: '#greeting',
      confidence: 99,
      latencyMs: 120,
      suggestedActions: [
        'Pantry prices per sqft?',
        'Sliding wardrobe photos',
        'Book site measurement',
        'Talk to staff'
      ]
    }
  ]);
  const [simInput, setSimInput] = useState('');
  const [isSimulatingBot, setIsSimulatingBot] = useState(false);

  // Voice Call Simulator State
  const [voiceSimState, setVoiceSimState] = useState<'idle' | 'calling' | 'connected' | 'completed'>('idle');
  const [voiceCallStep, setVoiceCallStep] = useState(0);
  const [voiceSimTranscript, setVoiceSimTranscript] = useState<string[]>([]);
  const [selectedVoiceScenario, setSelectedVoiceScenario] = useState<'pricing' | 'measurement' | 'human'>('pricing');

  // Log filter
  const [logChannelFilter, setLogChannelFilter] = useState<'all' | 'chat' | 'call'>('all');
  const [selectedLogDetail, setSelectedLogDetail] = useState<AIBotLog | null>(null);

  const handleSaveSettings = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    updateAIBotSettings(settings);
    addToast('AI Bot settings saved and deployed to WhatsApp Webhook & Voice Gateway.');
  };

  // Chat Simulator logic
  const handleSendSimulatorMessage = (textToSend?: string) => {
    const text = textToSend || simInput.trim();
    if (!text) return;

    const nowTime = new Date().toTimeString().slice(0, 5);
    const userMsg: SimulatorMessage = {
      id: `sim_u_${Date.now()}`,
      sender: 'user',
      text,
      time: nowTime
    };

    setSimulatorMessages(prev => [...prev, userMsg]);
    playSentSound();
    if (!textToSend) setSimInput('');
    setIsSimulatingBot(true);

    // AI Intent Classification & Dynamic Response
    setTimeout(() => {
      const lower = text.toLowerCase();
      let botResponse = '';
      let detectedIntent = '#general_inquiry';
      let confidence = 95;
      let actions: string[] = [];

      if (lower.includes('pantry') || lower.includes('square foot') || lower.includes('sqft') || lower.includes('price') || lower.includes('ganan') || lower.includes('kiyada')) {
        detectedIntent = '#pricing_inquiry';
        confidence = 98;
        botResponse = `Ayubowan! 🙏 Our high-grade powder-coated Aluminium Pantry Cupboards range from Rs. 7,200 to Rs. 9,500 per sq.ft. (includes soft-close German hinges, inner carcass, and full installation with a 15-year warranty). Would you like to view our 2026 colour catalogue or book a free on-site measurement?`;
        actions = ['Send colour card', 'Book measurement visit', 'Calculate 10x10 kitchen'];
      } else if (lower.includes('wardrobe') || lower.includes('sliding') || lower.includes('almariah')) {
        detectedIntent = '#wardrobe_inquiry';
        confidence = 97;
        botResponse = `Our floor-to-ceiling 2-track and 3-track sliding wardrobes start from Rs. 6,800 per sq.ft. We offer Matte Black, Teak Woodgrain, and tinted mirror sliding doors with silent acoustic runners. May I send you photos from our Media Gallery?`;
        actions = ['View wardrobe photos', 'Video mechanism demo', 'Request quote'];
      } else if (lower.includes('visit') || lower.includes('measure') || lower.includes('gampaha') || lower.includes('colombo') || lower.includes('enna')) {
        detectedIntent = '#site_measurement_request';
        confidence = 99;
        botResponse = `We provide free on-site measurements across the Western Province! Please share your town/address and convenient day (Monday to Saturday), and our technical supervisor will visit with material samples.`;
        actions = ['Share address', 'Confirm Saturday', 'Showroom location'];
      } else if (lower.includes('staff') || lower.includes('nimal') || lower.includes('human') || lower.includes('katha') || lower.includes('call me') || lower.includes('discount')) {
        detectedIntent = '#human_handoff';
        confidence = 99;
        botResponse = `Certainly! I have escalated this conversation to our senior sales specialist Nimal Bandara. He has received your inquiry notification and will message you right here in a few moments.`;
        actions = ['Nimal is assigned ✓', 'Call +94 77 123 4567'];
      } else {
        detectedIntent = '#general_faq';
        confidence = 88;
        botResponse = `Thank you for your message! At Madushan Aluminium, we specialize in custom pantry cupboards, wardrobes, and bathroom vanities. How can I assist you today?`;
        actions = ['Pantry prices', 'Wardrobes', 'Site visit'];
      }

      const botMsg: SimulatorMessage = {
        id: `sim_b_${Date.now()}`,
        sender: 'bot',
        text: botResponse,
        time: nowTime,
        intent: detectedIntent,
        confidence,
        latencyMs: Math.floor(Math.random() * 150) + 220,
        suggestedActions: actions
      };

      setSimulatorMessages(prev => [...prev, botMsg]);
      playReceivedSound();
      setIsSimulatingBot(false);

      // Also log this simulation interaction
      addAILog({
        id: `sim_log_${Date.now()}`,
        channel: 'chat',
        contactName: 'Live Simulator Tester',
        contactPhone: '+94 7X XXX XXXX',
        timestamp: 'Just now',
        intent: detectedIntent,
        confidence,
        userInput: text,
        botOutput: botResponse,
        status: detectedIntent === '#human_handoff' ? 'handed_off' : 'resolved',
        agent: detectedIntent === '#human_handoff' ? 'Nimal Bandara' : undefined,
        tokensUsed: Math.floor(Math.random() * 80) + 90,
        latencyMs: botMsg.latencyMs
      });
    }, 600);
  };

  // Voice Simulator simulation run
  const runVoiceSimulation = () => {
    setVoiceSimState('calling');
    setVoiceCallStep(1);
    setVoiceSimTranscript(['[Ringing tone...] Inbound call from +94 77 555 4321']);

    setTimeout(() => {
      setVoiceSimState('connected');
      setVoiceCallStep(2);
      setVoiceSimTranscript(prev => [
        ...prev,
        `🤖 AI Receptionist (${settings.voiceModel.split(' ')[0]}): "${settings.voiceGreeting}"`
      ]);

      setTimeout(() => {
        setVoiceCallStep(3);
        const userPrompt = selectedVoiceScenario === 'pricing'
          ? 'Caller: "Ayubowan, mata pantry cupboards wala square foot price ekak dena puluwanda Maharagama ta?"'
          : selectedVoiceScenario === 'measurement'
          ? 'Caller: "Hello, mata new house ekata site visit ekak daaganna puluwanda Rajagiriya ta?"'
          : 'Caller: "Mata direct Nimal Bandara ekka katha karanna puluwanda project ekak gana?"';

        setVoiceSimTranscript(prev => [...prev, userPrompt]);

        setTimeout(() => {
          setVoiceCallStep(4);
          const botAnswer = selectedVoiceScenario === 'pricing'
            ? '🤖 AI Receptionist: "Pantry cupboards start at Rs. 7,200 per sqft with 15-year warranty. I have just triggered our digital catalogue directly to your WhatsApp number!"'
            : selectedVoiceScenario === 'measurement'
            ? '🤖 AI Receptionist: "Understood! Free site visit scheduled for Rajagiriya. Engineering team will call you within 15 minutes to confirm exact time slot."'
            : '🤖 AI Receptionist: "Transferring you directly to Nimal Bandara on extension 102. Please hold the line."';

          setVoiceSimTranscript(prev => [...prev, botAnswer]);

          setTimeout(() => {
            setVoiceSimState('completed');
            setVoiceSimTranscript(prev => [
              ...prev,
              '✓ Call ended (Duration: 0m 48s). AI Summary & WhatsApp Followup sent automatically.'
            ]);
            addToast('Voice simulation completed. AI transcript and auto-followup created.');
          }, 1500);
        }, 1800);
      }, 1600);
    }, 1400);
  };

  const filteredLogs = aiLogs.filter(log => {
    if (logChannelFilter === 'all') return true;
    return log.channel === logChannelFilter;
  });

  if (role !== 'manager') {
    return (
      <div className="card" style={{ maxWidth: '580px', margin: '60px auto', padding: '36px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
        <h2 style={{ fontSize: '20px', marginBottom: '8px', color: 'var(--ink)' }}>
          Manager Access Only
        </h2>
        <p style={{ color: 'var(--ink-2)', fontSize: '14px', lineHeight: '1.5', marginBottom: '24px' }}>
          AI Bot Setup, prompt training, voice model parameters, and auto-responder rules are reserved for Business Managers and Owners only.
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button type="button" className="btn" onClick={() => setScreen('chats')}>
            Go to My Chats
          </button>
          <button type="button" className="btn pri" onClick={() => setRole('manager')}>
            Switch to Manager Role
          </button>
        </div>
      </div>
    );
  }

  return (

    <div className="aibot-screen-container">
      {/* Top Header */}
      <div className="ph">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h1>AI Bot · Calls &amp; Messages</h1>
            <span
              className="chip ok"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                padding: '3px 9px'
              }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--ok)',
                  display: 'inline-block',
                  boxShadow: '0 0 8px var(--ok)'
                }}
              />
              {settings.chatBotEnabled && settings.voiceBotEnabled
                ? 'AI Bot Active · Calls & WhatsApp Live'
                : settings.chatBotEnabled
                ? 'WhatsApp Bot Active'
                : 'AI Bot Configured'}
            </span>
            <span className="hint" style={{ margin: 0, fontSize: '12px' }}>
              ({role === 'manager' ? 'Full Manager Control' : 'Staff Copilot View'})
            </span>
          </div>
          <p>
            Autonomous conversational intelligence for WhatsApp inquiries and incoming voice calls. Supports Sinhala, English, and Singlish.
          </p>
        </div>

        <div className="acts">
          <SectionThemeToggle />
          <button
            className="btn"
            onClick={() => {
              const nextChat = !settings.chatBotEnabled;
              setSettings(prev => ({ ...prev, chatBotEnabled: nextChat }));
              updateAIBotSettings({ chatBotEnabled: nextChat });
              addToast(nextChat ? 'WhatsApp Chat Bot resumed.' : 'WhatsApp Chat Bot paused.');
            }}
          >
            {settings.chatBotEnabled ? '⏸ Pause WhatsApp Bot' : '▶ Resume WhatsApp Bot'}
          </button>
          <button
            className="btn pri"
            onClick={handleSaveSettings}
          >
            Deploy Bot Settings
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats">
        <div className="stat i">
          <span>AI Handled Messages</span>
          <b>1,428</b>
          <small>88% resolved without human escalation</small>
        </div>
        <div className="stat ok">
          <span>AI Voice Calls</span>
          <b style={{ color: 'var(--ok)' }}>312 calls</b>
          <small>Average call duration 1m 24s</small>
        </div>
        <div className="stat">
          <span>Human Handoff Rate</span>
          <b style={{ fontSize: '20px' }}>12.4%</b>
          <small>Seamless handover to Nimal / Madushan</small>
        </div>
        <div className="stat">
          <span>Customer Satisfaction (CSAT)</span>
          <b style={{ fontSize: '20px' }}>97.4%</b>
          <small>Powered by LUMI Trilingual Neural Core</small>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="seg" style={{ marginBottom: '16px' }}>
        <button
          className={activeTab === 'chat' ? 'active' : ''}
          onClick={() => setActiveTab('chat')}
        >
          💬 WhatsApp &amp; Messages Bot
        </button>
        <button
          className={activeTab === 'voice' ? 'active' : ''}
          onClick={() => setActiveTab('voice')}
        >
          📞 Voice &amp; Call Assistant
        </button>
        <button
          className={activeTab === 'logs' ? 'active' : ''}
          onClick={() => setActiveTab('logs')}
        >
          📊 Activity Logs &amp; Transcripts ({aiLogs.length})
        </button>
      </div>

      {/* TAB 1: WhatsApp & Messages Bot */}
      {activeTab === 'chat' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
          {/* Left Column: Configuration */}
          <div className="card">
            <div className="card-h">
              <h2>WhatsApp Bot Engine &amp; Behavior</h2>
              <span className="sp" />
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.chatBotEnabled}
                  onChange={e => setSettings(prev => ({ ...prev, chatBotEnabled: e.target.checked }))}
                />
                <b>Enable WhatsApp AI</b>
              </label>
            </div>

            <div className="card-b" style={{ padding: '16px' }}>
              {/* Bot Operation Mode */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Automation Trigger Mode
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { id: 'always', label: '24/7 Autonomous Agent', desc: 'Replies instantly to all incoming customer chats in real-time.' },
                    { id: 'after_hours', label: 'After-Hours & Weekends Only', desc: 'Active outside 8:00 AM – 6:00 PM and Sundays to capture after-work leads.' },
                    { id: 'staff_busy', label: 'Smart Fallback When Busy', desc: 'Steps in automatically if no human staff replies within 3 minutes.' }
                  ].map(mode => (
                    <label
                      key={mode.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: `1px solid ${settings.chatBotMode === mode.id ? 'var(--blue)' : 'var(--rule)'}`,
                        background: settings.chatBotMode === mode.id ? 'var(--info-bg)' : 'var(--card-2)',
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="radio"
                        name="botMode"
                        checked={settings.chatBotMode === mode.id}
                        onChange={() => setSettings(prev => ({ ...prev, chatBotMode: mode.id as any }))}
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

              {/* Bot Persona & Trilingual Support */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Bot Persona Name
                  </label>
                  <input
                    type="text"
                    value={settings.personaName}
                    onChange={e => setSettings(prev => ({ ...prev, personaName: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--rule-2)',
                      background: 'var(--card)',
                      fontSize: '13px',
                      color: 'var(--ink)'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                    Language Intelligence
                  </label>
                  <select
                    value={settings.languageMode}
                    onChange={e => setSettings(prev => ({ ...prev, languageMode: e.target.value as any }))}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--rule-2)',
                      background: 'var(--card)',
                      fontSize: '13px',
                      color: 'var(--ink)'
                    }}
                  >
                    <option value="trilingual">Trilingual (Sinhala, English, Singlish)</option>
                    <option value="sinhala">Sinhala Priority (සිංහල)</option>
                    <option value="english">English Only</option>
                  </select>
                </div>
              </div>

              {/* System Knowledge & Business Instructions */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>
                    AI Knowledge Base &amp; Instructions
                  </label>
                  <span className="hint" style={{ margin: 0, fontSize: '11.5px' }}>
                    Controls pantry prices, warranties, and showroom rules
                  </span>
                </div>
                <textarea
                  rows={6}
                  value={settings.systemPrompt}
                  onChange={e => setSettings(prev => ({ ...prev, systemPrompt: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--rule-2)',
                    background: 'var(--card)',
                    fontSize: '12.5px',
                    fontFamily: 'inherit',
                    lineHeight: '1.45',
                    color: 'var(--ink)',
                    resize: 'vertical'
                  }}
                />
              </div>

              {/* Human Handoff Rules */}
              <div style={{ marginBottom: '16px', background: 'var(--card-2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--rule)' }}>
                <b style={{ fontSize: '13px', display: 'block', marginBottom: '8px' }}>
                  Safety &amp; Human Escalation Triggers
                </b>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.autoHandoffOnNegotiation}
                      onChange={e => setSettings(prev => ({ ...prev, autoHandoffOnNegotiation: e.target.checked }))}
                    />
                    <span>Hand over to staff when customer asks for custom price discount or negotiation</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.autoHandoffOnComplaint}
                      onChange={e => setSettings(prev => ({ ...prev, autoHandoffOnComplaint: e.target.checked }))}
                    />
                    <span>Hand over immediately on negative sentiment or complaint</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.autoHandoffOnStaffRequest}
                      onChange={e => setSettings(prev => ({ ...prev, autoHandoffOnStaffRequest: e.target.checked }))}
                    />
                    <span>Hand over when customer requests human agent ("Nimal ta denna", "talk to staff")</span>
                  </label>
                </div>
              </div>

              {/* Save Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setSettings(aiBotSettings)}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="btn pri"
                  onClick={handleSaveSettings}
                >
                  Save &amp; Update Bot
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Live Interactive Chat Simulator */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="card-h">
              <h2>Live WhatsApp Bot Simulator</h2>
              <span className="sp" />
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  setSimulatorMessages([
                    {
                      id: `sim_reset_${Date.now()}`,
                      sender: 'bot',
                      text: settings.welcomeMessage,
                      time: 'Just now',
                      intent: '#greeting',
                      confidence: 99,
                      latencyMs: 120,
                      suggestedActions: [
                        'Pantry prices per sqft?',
                        'Sliding wardrobe photos',
                        'Book site measurement',
                        'Talk to staff'
                      ]
                    }
                  ]);
                  addToast('Simulator conversation reset.');
                }}
              >
                Clear Chat
              </button>
            </div>

            {/* Simulator Chat Area */}
            <div
              style={{
                flex: 1,
                minHeight: '380px',
                maxHeight: '520px',
                overflowY: 'auto',
                padding: '14px',
                background: 'var(--paper)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}
            >
              {simulatorMessages.map(msg => (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: msg.sender === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      background: msg.sender === 'user' ? 'var(--blue)' : 'var(--card)',
                      color: msg.sender === 'user' ? '#fff' : 'var(--ink)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                      fontSize: '13px',
                      lineHeight: '1.45',
                      border: msg.sender === 'bot' ? '1px solid var(--rule)' : 'none'
                    }}
                  >
                    {msg.sender === 'bot' && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          marginBottom: '4px',
                          fontSize: '11px',
                          color: 'var(--blue)',
                          fontWeight: 600
                        }}
                      >
                        <span>✦ {settings.personaName}</span>
                        {msg.intent && (
                          <span
                            style={{
                              background: 'var(--card-2)',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              fontSize: '10px',
                              color: 'var(--ink-2)',
                              border: '1px solid var(--rule)'
                            }}
                          >
                            {msg.intent} · {msg.confidence}%
                          </span>
                        )}
                        {msg.latencyMs && (
                          <span style={{ fontSize: '10px', color: 'var(--ink-3)' }}>
                            {msg.latencyMs}ms
                          </span>
                        )}
                      </div>
                    )}

                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                    <div
                      style={{
                        textAlign: 'right',
                        fontSize: '10px',
                        marginTop: '4px',
                        opacity: 0.7
                      }}
                    >
                      {msg.time} {msg.sender === 'user' ? '✓✓' : ''}
                    </div>
                  </div>

                  {/* Suggested quick buttons under bot message */}
                  {msg.suggestedActions && msg.suggestedActions.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '6px' }}>
                      {msg.suggestedActions.map(action => (
                        <button
                          key={action}
                          type="button"
                          className="btn sm"
                          style={{
                            fontSize: '11px',
                            padding: '3px 8px',
                            background: 'var(--card)',
                            color: 'var(--blue)',
                            borderRadius: '12px'
                          }}
                          onClick={() => handleSendSimulatorMessage(action)}
                        >
                          {action}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {isSimulatingBot && (
                <div
                  style={{
                    alignSelf: 'flex-start',
                    padding: '8px 14px',
                    borderRadius: '12px',
                    background: 'var(--card)',
                    fontSize: '12px',
                    color: 'var(--ink-2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span className="dot" style={{ animation: 'pulse 1s infinite' }}>●</span>
                  <span>AI Bot is typing trilingual response...</span>
                </div>
              )}
            </div>

            {/* Quick Test Prompt Shortcuts */}
            <div
              style={{
                padding: '8px 12px',
                background: 'var(--card-2)',
                borderTop: '1px solid var(--rule)',
                display: 'flex',
                gap: '6px',
                overflowX: 'auto'
              }}
            >
              {[
                'Pantry sqft price kiyada?',
                'Wardrobe photos ewanna',
                'Can I book a site visit?',
                'Mata Nimal ekka katha karanna puluwanda?'
              ].map(testQuery => (
                <button
                  key={testQuery}
                  type="button"
                  style={{
                    whiteSpace: 'nowrap',
                    fontSize: '11px',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--rule-2)',
                    background: 'var(--card)',
                    color: 'var(--ink)',
                    cursor: 'pointer'
                  }}
                  onClick={() => handleSendSimulatorMessage(testQuery)}
                >
                  {testQuery}
                </button>
              ))}
            </div>

            {/* Simulator Input Box */}
            <form
              onSubmit={e => {
                e.preventDefault();
                handleSendSimulatorMessage();
              }}
              style={{
                display: 'flex',
                gap: '8px',
                padding: '10px 12px',
                borderTop: '1px solid var(--rule)',
                background: 'var(--card)'
              }}
            >
              <input
                type="text"
                placeholder="Type a test question in Sinhala, English or Singlish..."
                value={simInput}
                onChange={e => setSimInput(e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--rule-2)',
                  background: 'var(--card-2)',
                  fontSize: '13px',
                  color: 'var(--ink)'
                }}
              />
              <button type="submit" className="btn pri sm" disabled={!simInput.trim() || isSimulatingBot}>
                Send Test
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: Voice & Call Assistant */}
      {activeTab === 'voice' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
          {/* Left Column: Voice Engine Settings */}
          <div className="card">
            <div className="card-h">
              <h2>AI Voice Receptionist &amp; Call Handling</h2>
              <span className="sp" />
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.voiceBotEnabled}
                  onChange={e => setSettings(prev => ({ ...prev, voiceBotEnabled: e.target.checked }))}
                />
                <b>Enable AI Call Receptionist</b>
              </label>
            </div>

            <div className="card-b" style={{ padding: '16px' }}>
              {/* Voice Model Selector */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  AI Voice Model &amp; Tone
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    value={settings.voiceModel}
                    onChange={e => setSettings(prev => ({ ...prev, voiceModel: e.target.value }))}
                    style={{
                      flex: 1,
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--rule-2)',
                      background: 'var(--card-2)',
                      fontSize: '13px',
                      color: 'var(--ink)'
                    }}
                  >
                    <option value="Kavindi - Sri Lankan Natural Voice (LUMI Neural)">
                      Kavindi - Natural Sinhala/English Voice (LUMI Neural)
                    </option>
                    <option value="Kamal - Professional Business Voice">
                      Kamal - Professional Business Tone (Sinhala/English)
                    </option>
                    <option value="Nimasha - Warm Customer Service Voice">
                      Nimasha - Warm Customer Service Tone
                    </option>
                  </select>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      addToast(`▶ Playing voice sample: "${settings.voiceGreeting.slice(0, 40)}..."`);
                    }}
                  >
                    ▶ Listen Sample
                  </button>
                </div>
              </div>

              {/* Inbound Call Greeting Script */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>
                    Inbound Voice Greeting Script
                  </label>
                  <span className="hint" style={{ margin: 0, fontSize: '11.5px' }}>
                    Spoken automatically when customer calls
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={settings.voiceGreeting}
                  onChange={e => setSettings(prev => ({ ...prev, voiceGreeting: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--rule-2)',
                    background: 'var(--card-2)',
                    fontSize: '13px',
                    color: 'var(--ink)'
                  }}
                />
              </div>

              {/* Call Automation Features */}
              <div style={{ background: 'var(--card-2)', padding: '14px', borderRadius: '8px', border: '1px solid var(--rule)', marginBottom: '16px' }}>
                <b style={{ fontSize: '13px', display: 'block', marginBottom: '10px' }}>
                  Real-time Call Automation Features
                </b>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12.5px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.autoTranscribeCalls}
                      onChange={e => setSettings(prev => ({ ...prev, autoTranscribeCalls: e.target.checked }))}
                      style={{ marginTop: '2px' }}
                    />
                    <div>
                      <b>Live Speech-to-Text Transcription</b>
                      <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--ink-2)' }}>
                        Transcribes incoming Sinhala and English speech in real-time for instant audit logs.
                      </p>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12.5px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.autoSummarizeCalls}
                      onChange={e => setSettings(prev => ({ ...prev, autoSummarizeCalls: e.target.checked }))}
                      style={{ marginTop: '2px' }}
                    />
                    <div>
                      <b>Automatic Call Summaries &amp; Next Steps</b>
                      <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--ink-2)' }}>
                        Generates a concise 3-bullet summary with action items right after every call hangs up.
                      </p>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12.5px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={settings.missedCallAutoFollowup}
                      onChange={e => setSettings(prev => ({ ...prev, missedCallAutoFollowup: e.target.checked }))}
                      style={{ marginTop: '2px' }}
                    />
                    <div>
                      <b>Missed-Call Instant WhatsApp Recovery</b>
                      <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--ink-2)' }}>
                        If a caller hangs up before answering or lines are busy, an instant WhatsApp message is sent within 4 seconds.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Missed Call Template */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
                  Missed Call Recovery WhatsApp Message
                </label>
                <textarea
                  rows={2}
                  value={settings.missedCallMessageTemplate}
                  onChange={e => setSettings(prev => ({ ...prev, missedCallMessageTemplate: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--rule-2)',
                    background: 'var(--card-2)',
                    fontSize: '12.5px',
                    color: 'var(--ink)'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="btn pri"
                  onClick={handleSaveSettings}
                >
                  Save Call Bot Settings
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Voice Call Simulator */}
          <div className="card">
            <div className="card-h">
              <h2>Voice Call Bot Simulator</h2>
              <span className="sp" />
              <span className="chip ok" style={{ fontSize: '11px' }}>
                SIP WebRTC Gateway Ready
              </span>
            </div>

            <div className="card-b" style={{ padding: '16px' }}>
              <p style={{ fontSize: '13px', color: 'var(--ink-2)', marginBottom: '12px' }}>
                Simulate an incoming voice call to hear how the AI receptionist answers, handles queries, and sends follow-ups.
              </p>

              {/* Scenario Picker */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, marginBottom: '6px' }}>
                  Select Call Scenario:
                </label>
                <div className="seg" style={{ width: '100%' }}>
                  <button
                    type="button"
                    style={{ flex: 1 }}
                    className={selectedVoiceScenario === 'pricing' ? 'active' : ''}
                    onClick={() => setSelectedVoiceScenario('pricing')}
                  >
                    1. Price Quote
                  </button>
                  <button
                    type="button"
                    style={{ flex: 1 }}
                    className={selectedVoiceScenario === 'measurement' ? 'active' : ''}
                    onClick={() => setSelectedVoiceScenario('measurement')}
                  >
                    2. Site Visit
                  </button>
                  <button
                    type="button"
                    style={{ flex: 1 }}
                    className={selectedVoiceScenario === 'human' ? 'active' : ''}
                    onClick={() => setSelectedVoiceScenario('human')}
                  >
                    3. Agent Transfer
                  </button>
                </div>
              </div>

              {/* Call Simulation Display Box */}
              <div
                style={{
                  background: '#07162C',
                  color: '#fff',
                  borderRadius: '12px',
                  padding: '16px',
                  minHeight: '260px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '20px' }}>📞</span>
                      <div>
                        <b style={{ fontSize: '13.5px', color: '#fff' }}>+94 77 555 4321</b>
                        <small style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '11px' }}>
                          Inbound Call · {settings.voiceModel.split('-')[0].trim()}
                        </small>
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        background: voiceSimState === 'connected' ? 'var(--ok)' : voiceSimState === 'calling' ? 'var(--warn)' : 'rgba(255,255,255,0.2)'
                      }}
                    >
                      {voiceSimState === 'idle' ? 'Ready to Test' : voiceSimState.toUpperCase()}
                    </span>
                  </div>

                  {/* Waveform graphic when connected */}
                  {voiceSimState === 'connected' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', height: '36px', marginBottom: '12px' }}>
                      {[18, 28, 12, 34, 22, 10, 32, 26, 14, 30, 20].map((h, i) => (
                        <span
                          key={i}
                          style={{
                            width: '4px',
                            height: `${h}px`,
                            background: 'var(--blue)',
                            borderRadius: '2px',
                            animation: 'pulse 0.8s infinite alternate'
                          }}
                        />
                      ))}
                    </div>
                  )}

                  {/* Transcript Feed */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.5px' }}>
                    {voiceSimTranscript.map((line, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: line.startsWith('🤖') ? 'rgba(11, 111, 212, 0.25)' : line.startsWith('Caller') ? 'rgba(255,255,255,0.1)' : 'transparent',
                          padding: line.startsWith('[') ? '2px 0' : '6px 10px',
                          borderRadius: '6px',
                          color: line.startsWith('🤖') ? '#60A5FA' : line.startsWith('✓') ? '#34D399' : '#fff'
                        }}
                      >
                        {line}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                  {voiceSimState === 'idle' || voiceSimState === 'completed' ? (
                    <button
                      type="button"
                      className="btn pri"
                      style={{ width: '100%', padding: '10px' }}
                      onClick={runVoiceSimulation}
                    >
                      ▶ Start Incoming Voice Simulation
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn"
                      style={{ width: '100%', color: 'var(--bad)', borderColor: 'var(--bad)' }}
                      onClick={() => {
                        setVoiceSimState('idle');
                        setVoiceSimTranscript([]);
                      }}
                    >
                      End Voice Call
                    </button>
                  )}
                </div>
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
              <button
                className={logChannelFilter === 'all' ? 'active' : ''}
                onClick={() => setLogChannelFilter('all')}
              >
                All Bot Interactions ({aiLogs.length})
              </button>
              <button
                className={logChannelFilter === 'chat' ? 'active' : ''}
                onClick={() => setLogChannelFilter('chat')}
              >
                💬 WhatsApp Chats ({aiLogs.filter(l => l.channel === 'chat').length})
              </button>
              <button
                className={logChannelFilter === 'call' ? 'active' : ''}
                onClick={() => setLogChannelFilter('call')}
              >
                📞 Voice Calls ({aiLogs.filter(l => l.channel === 'call').length})
              </button>
            </div>
            <span className="sp" />
            <span className="hint" style={{ margin: 0 }}>
              Real-time webhook events
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
                {filteredLogs.map(log => (
                  <tr
                    key={log.id}
                    style={{
                      borderBottom: '1px solid var(--rule)',
                      transition: 'background 0.15s ease'
                    }}
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
                      <small style={{ display: 'block', color: 'var(--ink-3)', fontSize: '11px' }}>
                        {log.timestamp}
                      </small>
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
                      <b style={{ color: log.confidence >= 90 ? 'var(--ok)' : 'var(--warn)' }}>
                        {log.confidence}%
                      </b>
                      {log.latencyMs && (
                        <small style={{ display: 'block', color: 'var(--ink-3)', fontSize: '11px' }}>
                          {log.latencyMs}ms
                        </small>
                      )}
                    </td>

                    <td style={{ padding: '12px 14px', maxWidth: '300px' }}>
                      <p
                        style={{
                          margin: 0,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          color: 'var(--ink)'
                        }}
                      >
                        {log.userInput}
                      </p>
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      <span
                        className={`chip ${
                          log.status === 'resolved'
                            ? 'ok'
                            : log.status === 'handed_off'
                            ? 'w'
                            : ''
                        }`}
                        style={{ fontSize: '11px' }}
                      >
                        {log.status === 'resolved'
                          ? 'Automated'
                          : log.status === 'handed_off'
                          ? `Escalated (${log.agent || 'Staff'})`
                          : 'Handled'}
                      </span>
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => setSelectedLogDetail(log)}
                      >
                        View Transcript
                      </button>
                    </td>
                  </tr>
                ))}
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
              <b style={{ display: 'block', fontSize: '12px', color: 'var(--ink-2)', marginBottom: '4px' }}>
                Customer Inquiry / Caller Transcript:
              </b>
              <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--ink)' }}>
                {selectedLogDetail.userInput}
              </p>
            </div>

            <div style={{ marginBottom: '18px', background: 'var(--info-bg)', padding: '12px', borderRadius: '8px', border: '1px solid var(--rule)' }}>
              <b style={{ display: 'block', fontSize: '12px', color: 'var(--blue)', marginBottom: '4px' }}>
                AI Bot Action &amp; Response Generated:
              </b>
              <p style={{ margin: 0, fontSize: '13.5px', color: 'var(--ink)' }}>
                {selectedLogDetail.botOutput}
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="hint" style={{ margin: 0 }}>
                Tokens: {selectedLogDetail.tokensUsed || 112} · Latency: {selectedLogDetail.latencyMs || 280}ms
              </span>
              <button
                type="button"
                className="btn pri sm"
                onClick={() => setSelectedLogDetail(null)}
              >
                Close Transcript
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
