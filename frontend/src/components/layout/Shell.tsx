'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import Rail from './Rail';
import Header from './Header';

// Screens
import DashboardScreen from '../screens/DashboardScreen';
import InboxScreen from '../screens/InboxScreen';
import CallsScreen from '../screens/CallsScreen';
import ContactsScreen from '../screens/ContactsScreen';
import LabelsScreen from '../screens/LabelsScreen';
import LiveStatusScreen from '../screens/LiveStatusScreen';
import StaffManageScreen from '../screens/StaffManageScreen';
import AssignmentRulesScreen from '../screens/AssignmentRulesScreen';
import ProgressScreen from '../screens/ProgressScreen';
import TemplatesScreen from '../screens/TemplatesScreen';
import CatalogScreen from '../screens/CatalogScreen';
import BroadcastsScreen from '../screens/BroadcastsScreen';
import QuickRepliesScreen from '../screens/QuickRepliesScreen';
import CallSettingsScreen from '../screens/CallSettingsScreen';
import IVRScreen from '../screens/IVRScreen';
import ForwardingScreen from '../screens/ForwardingScreen';
import ReportsScreen from '../screens/ReportsScreen';
import BillingScreen from '../screens/BillingScreen';
import BusinessProfileScreen from '../screens/BusinessProfileScreen';
import NumberQualityScreen from '../screens/NumberQualityScreen';
import RolesScreen from '../screens/RolesScreen';
import IntegrationsScreen from '../screens/IntegrationsScreen';
import AuditScreen from '../screens/AuditScreen';
import MyDayScreen from '../screens/MyDayScreen';
import MyPerformanceScreen from '../screens/MyPerformanceScreen';
import ProfileSettingsScreen from '../screens/ProfileSettingsScreen';
import MediaGalleryScreen from '../screens/MediaGalleryScreen';
import AIBotScreen from '../screens/AIBotScreen';


// Modals
import ActiveCallModal from '../modals/ActiveCallModal';
import StatusBreakModal from '../modals/StatusBreakModal';
import IncomingCallWidget from '../modals/IncomingCallWidget';

export default function Shell() {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const {
    screen,
    sheetContent,
    closeSheet,
    railOpen,
    toggleRail,
    toasts,
    activeCall,
    frameTheme,
    sectionTheme
  } = useApp();

  if (!mounted) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', background: '#0b141a', color: '#e9edef', fontFamily: 'sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>💬</div>
          <div style={{ fontSize: '16px', fontWeight: 600 }}>Loading Smart Reply...</div>
        </div>
      </div>
    );
  }

  const renderScreen = () => {
    switch (screen) {
      case 'dash':
        return <DashboardScreen />;
      case 'chats':
      case 'inbox':
        return <InboxScreen />;
      case 'calls':
        return <CallsScreen />;
      case 'contacts':
        return <ContactsScreen />;
      case 'labels':
        return <LabelsScreen />;
      case 'status':
        return <LiveStatusScreen />;
      case 'staff':
        return <StaffManageScreen />;
      case 'routing':
        return <AssignmentRulesScreen />;
      case 'progress':
        return <ProgressScreen />;
      case 'templates':
        return <TemplatesScreen />;
      case 'gallery':
        return <MediaGalleryScreen />;
      case 'aibot':
        return <AIBotScreen />;
      case 'catalog':
        return <CatalogScreen />;

      case 'broadcasts':
        return <BroadcastsScreen />;
      case 'quick':
        return <QuickRepliesScreen />;
      case 'callset':
        return <CallSettingsScreen />;
      case 'ivr':
        return <IVRScreen />;
      case 'fwd':
        return <ForwardingScreen />;
      case 'reports':
        return <ReportsScreen />;
      case 'billing':
        return <BillingScreen />;
      case 'business':
        return <BusinessProfileScreen />;
      case 'number':
        return <NumberQualityScreen />;
      case 'roles':
        return <RolesScreen />;
      case 'integrations':
        return <IntegrationsScreen />;
      case 'audit':
        return <AuditScreen />;
      case 'mydash':
        return <MyDayScreen />;
      case 'myperf':
        return <MyPerformanceScreen />;
      case 'profile':
        return <ProfileSettingsScreen />;
      default:
        return <DashboardScreen />;
    }
  };

  return (
    <div className="shell" data-frame-theme={frameTheme} suppressHydrationWarning>
      {/* Sidebar Rail */}
      <Rail />

      {/* Main Container */}
      <div className="main" data-page-theme={sectionTheme} suppressHydrationWarning>
        <Header />
        <main
          className={`page ${screen === 'chats' || screen === 'inbox' ? 'page-chat-container' : ''}`}
          data-page-theme={sectionTheme}
          suppressHydrationWarning
          id="page"
        >
          {renderScreen()}
        </main>
      </div>

      {/* Scrim for Mobile Rail & Drawer Sheets */}
      {(railOpen || sheetContent !== null || activeCall !== null) && (
        <div
          className="scrim on"
          id="scrim"
          onClick={() => {
            if (railOpen) toggleRail();
            if (sheetContent) closeSheet();
          }}
        />
      )}

      {/* Global Slide-Over Sheet */}
      {sheetContent && (
        <aside className="sheet on" id="sheet" role="dialog" aria-modal="true">
          <button className="x" id="sx" aria-label="Close" onClick={closeSheet}>
            ×
          </button>
          <div id="sheetBody">{sheetContent}</div>
        </aside>
      )}

      {/* Active Voice Call Overlay */}
      <ActiveCallModal />

      {/* Status & Break Configuration Modal */}
      <StatusBreakModal />

      {/* Floating WhatsApp Incoming Call Card (Bottom-Right Corner) */}
      <IncomingCallWidget />

      {/* Toast Notification Container */}
      <div className="toasts" id="toasts" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className="toast">
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
