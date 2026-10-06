'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Attachment, QuickReply } from '@/types';
import { getWinClass } from '@/utils/windowTime';
import ChatListPanel, { ChatFilterType } from '@/components/chat/ChatListPanel';
import ChatThreadPanel from '@/components/chat/ChatThreadPanel';
import ContactInfoPanel from '@/components/chat/ContactInfoPanel';

export default function InboxScreen() {
  const {
    role,
    conversations,
    contacts,
    staff,
    calls,
    templates,
    quickReplies,
    startCall,
    sendMessage,
    sendTemplateMessage,
    setOwner,
    setScreen,
    openSheet,
    closeSheet,
    addToast,
    ivr,
    currentUser,
    setStatusModalOpen,
    sectionTheme,
    toggleSectionTheme,
    chatWallpaper,
    setChatWallpaper
  } = useApp();

  const isStaff = role === 'staff';
  const myStaffId = 's1';

  // Chat theme uses global sectionTheme so it toggles seamlessly with the header toggle
  const chatTheme = sectionTheme;
  const toggleChatTheme = toggleSectionTheme;

  // Filter conversations for staff if in staff mode
  const visibleConvs = conversations.filter(v => !isStaff || contacts[v.c]?.to === myStaffId);

  const [filter, setFilter] = useState<ChatFilterType>('all');
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedConvId, setSelectedConvId] = useState<string>(visibleConvs[0]?.id || 'v1');
  const [contactInfoOpen, setContactInfoOpen] = useState(true);

  // Composer states
  const [inputText, setInputText] = useState('');
  const [isNoteMode, setIsNoteMode] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  const activeConv = conversations.find(v => v.id === selectedConvId) || visibleConvs[0];
  const activeContact = activeConv ? contacts[activeConv.c] : null;

  const isWindowOpen = activeConv?.exp ? activeConv.exp - Date.now() > 0 : false;

  // Filter conversations list
  const filteredConvs = visibleConvs.filter(v => {
    const c = contacts[v.c];
    if (!c) return false;
    const q = search.toLowerCase();
    if (q && !c.n.toLowerCase().includes(q) && !c.ph.includes(q)) return false;

    // Staff allocation filter (for manager role)
    if (!isStaff && staffFilter !== 'all') {
      if (staffFilter === 'unassigned') {
        if (c.to) return false;
      } else {
        if (c.to !== staffFilter) return false;
      }
    }

    if (filter === 'unread') return v.un > 0;
    if (filter === 'labeled') return c.labels.length > 0;
    if (filter === 'exp') return getWinClass(v.exp) === 'r';
    if (filter === 'none') return !c.to;
    return true;
  });

  // Auto-select first conversation if currently selected is filtered out
  React.useEffect(() => {
    if (filteredConvs.length > 0 && !filteredConvs.some(v => v.id === selectedConvId)) {
      setSelectedConvId(filteredConvs[0].id);
    }
  }, [staffFilter, filter, search]);

  const handleSelectConv = (id: string) => {
    setSelectedConvId(id);
    const v = conversations.find(x => x.id === id);
    if (v) v.un = 0;
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() && pendingAttachments.length === 0) return;
    if (!activeConv) return;

    sendMessage(activeConv.id, inputText.trim(), isNoteMode, pendingAttachments);
    setInputText('');
    setPendingAttachments([]);
  };

  const handleUseQuickReply = (qr: QuickReply) => {
    if (!isWindowOpen && !isNoteMode) {
      addToast('Reply window closed. Send an approved template instead.');
      return;
    }
    if (qr.x) setInputText(qr.x);
    if (qr.att.length) {
      setPendingAttachments([...qr.att]);
    }
    addToast(`${qr.cmd} ready${qr.att.length ? ` with ${qr.att.length} attachment(s)` : ''}. Edit if needed, then Send.`);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const newAtts: Attachment[] = files.map(f => {
      const type = f.type.startsWith('image/') ? 'image' : f.type.startsWith('audio/') ? 'voice' : 'file';
      return {
        type,
        name: f.name,
        size: f.size,
        url: URL.createObjectURL(f),
        real: true
      };
    });
    setPendingAttachments(prev => [...prev, ...newAtts]);
    e.target.value = '';
  };

  const handleVoiceRecordToggle = () => {
    if (isRecording) {
      setIsRecording(false);
      addToast('Voice studio closed.');
    } else {
      if (!activeContact) {
        addToast('Select a conversation to record a voice message.');
        return;
      }
      setIsRecording(true);
    }
  };

  const handleVoiceSend = (durStr: string) => {
    setIsRecording(false);
    if (!activeConv) return;
    const voiceAtt: Attachment = {
      type: 'voice',
      name: `voice_${Date.now()}.ogg`,
      size: 42000 + Math.floor(Math.random() * 25000),
      dur: durStr,
      real: false
    };

    sendMessage(activeConv.id, `▶ Voice message · ${durStr}`, isNoteMode, [voiceAtt]);
    addToast(`Voice message sent (${durStr}).`);
  };

  const handleVoiceCancel = () => {
    setIsRecording(false);
    addToast('Voice message discarded.');
  };

  // Open Template Sheet
  const handleOpenTemplateSheet = () => {
    const approvedTemplates = templates.filter(t => t.st === 'ok');
    openSheet(
      <>
        <h2>Send an approved template</h2>
        <p className="sub">
          Templates can go any time, even after the 24-hour window closes. Meta charges per template delivered.
        </p>
        {approvedTemplates.map(t => (
          <div key={t.n} className="list-row" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <div className="bd">
              <b>{t.n}</b>
              <span>{t.cat} · {t.lang}</span>
              <div className="tpv" style={{ marginTop: '6px' }}>
                <div className="bb out">{t.body}</div>
              </div>
            </div>
            <div className="rt">
              <button
                className="btn sm pri"
                onClick={() => {
                  if (activeConv) {
                    sendTemplateMessage(activeConv.id, t);
                    closeSheet();
                  }
                }}
              >
                Send
              </button>
            </div>
          </div>
        ))}
      </>
    );
  };

  return (
    <div
      className="wa-isolated-root"
      data-chat-theme={chatTheme}
      data-wallpaper={chatWallpaper}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}
    >
      {/* 3-Part WhatsApp Web UI Layout */}
      <div className="wa-layout" data-chat-theme={chatTheme} data-wallpaper={chatWallpaper}>
        {/* Part 1: Left Conversations List Panel (File 1) */}
        <ChatListPanel
          conversations={filteredConvs}
          allConversations={visibleConvs}
          contacts={contacts}
          staff={staff}
          currentUser={currentUser}
          selectedConvId={activeConv?.id}
          onSelectConv={handleSelectConv}
          search={search}
          onSearchChange={setSearch}
          filter={filter}
          onFilterChange={setFilter}
          staffFilter={staffFilter}
          onStaffFilterChange={setStaffFilter}
          isStaff={isStaff}
          theme={chatTheme}
          toggleTheme={toggleChatTheme}
          onOpenStatusModal={() => setStatusModalOpen(true)}
          onNewChat={() => addToast('New chat: select a customer contact.')}
        />

        {/* Part 2: Middle Chat Thread & Composer Panel (File 2) */}
        <ChatThreadPanel
          conversation={activeConv}
          contact={activeContact}
          onCall={() => activeContact && startCall(activeContact.id)}
          onResolve={() => addToast('Chat marked resolved.')}
          onToggleContactInfo={() => setContactInfoOpen(prev => !prev)}
          contactInfoOpen={contactInfoOpen}
          quickReplies={quickReplies}
          onSelectQuickReply={handleUseQuickReply}
          onOpenTemplates={handleOpenTemplateSheet}
          onOpenCatalog={() => setScreen('catalog')}
          onOpenGallery={() => setScreen('gallery')}
          pendingAttachments={pendingAttachments}

          onRemoveAttachment={idx => setPendingAttachments(prev => prev.filter((_, i) => i !== idx))}
          inputText={inputText}
          onInputChange={val => {
            setInputText(val);
            const matched = quickReplies.find(q => q.cmd === val.trim());
            if (matched) handleUseQuickReply(matched);
          }}
          onSubmit={handleSendMessage}
          isNoteMode={isNoteMode}
          onToggleNoteMode={() => setIsNoteMode(prev => !prev)}
          isRecording={isRecording}
          onToggleRecording={handleVoiceRecordToggle}
          onVoiceSend={handleVoiceSend}
          onVoiceCancel={handleVoiceCancel}
          onFileSelect={handleFileInput}
        />

        {/* Part 3: Right Contact Info Panel (File 3) */}
        {contactInfoOpen && (
          <ContactInfoPanel
            contact={activeContact}
            staff={staff}
            calls={calls}
            isStaff={isStaff}
            onClose={() => setContactInfoOpen(false)}
            onCall={() => activeContact && startCall(activeContact.id)}
            onFocusOwner={() => {
              const el = document.getElementById('cuTo');
              el?.focus();
            }}
            onOpenLabels={() => addToast('Label picker opened.')}
            onBlock={() => addToast('Blocked numbers cannot message or call.')}
            onOwnerChange={newOwner => {
              if (!activeContact) return;
              setOwner(activeContact.id, newOwner);
              const s = staff.find(x => x.id === newOwner);
              addToast(s
                ? `${activeContact.n} assigned to ${s.n}. They get a push notification.`
                : `${activeContact.n} unassigned. Chats and calls go to the Sales queue.`
              );
            }}
            onAddLabel={() => addToast('Label added.')}
          />
        )}
      </div>
    </div>
  );
}
