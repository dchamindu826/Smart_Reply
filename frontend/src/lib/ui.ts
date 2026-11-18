/** UI constants and display helpers used across screens. */

export const NAV_STRUCTURE = {
  manager: [
    { title: 'Today', items: [{ id: 'dash', icon: '◧', label: 'Dashboard', count: '' }] },
    {
      title: 'Inbox',
      items: [
        { id: 'chats', icon: '✉', label: 'Chats', count: '' },
        { id: 'calls', icon: '☏', label: 'Calls', count: '' },
        { id: 'contacts', icon: '☰', label: 'Customers & owners', count: '' },
        { id: 'labels', icon: '◈', label: 'Labels', count: '' }
      ]
    },
    {
      title: 'AI Automation',
      items: [
        { id: 'aibot', icon: '✦', label: 'AI Bot (Calls & Chats)', count: '' }
      ]
    },
    {
      title: 'Team',
      items: [
        { id: 'status', icon: '◉', label: 'Live status', count: '' },
        { id: 'staff', icon: '⚇', label: 'Staff manage', count: '' },
        { id: 'routing', icon: '⇄', label: 'Assignment rules', count: '' },
        { id: 'progress', icon: '↗', label: 'Progress', count: '' }
      ]
    },
    {
      title: 'WhatsApp & Media',
      items: [
        { id: 'gallery', icon: '🖼', label: 'Media Gallery', count: '' },
        { id: 'templates', icon: '▤', label: 'Message templates', count: '' },
        { id: 'catalog', icon: '▣', label: 'Catalog & pricing', count: '' },
        { id: 'broadcasts', icon: '⌁', label: 'Broadcasts', count: '' },
        { id: 'quick', icon: '⌘', label: 'Quick replies', count: '' }
      ]
    },
    {
      title: 'Calls',
      items: [
        { id: 'bookings', icon: '▦', label: 'Bookings', count: '' },
        { id: 'callset', icon: '◷', label: 'Call settings', count: '' },
        { id: 'ivr', icon: '⌗', label: 'IVR menu', count: '' },
        { id: 'fwd', icon: '⇄', label: 'Call forwarding', count: '' }
      ]
    },
    {
      title: 'Insights',
      items: [
        { id: 'reports', icon: '▩', label: 'Reports', count: '' },
        { id: 'billing', icon: '₨', label: 'Meta usage & billing', count: '' }
      ]
    },
    {
      title: 'Setup',
      items: [
        { id: 'business', icon: '⌗', label: 'Business profile', count: '' },
        { id: 'number', icon: '◎', label: 'Number & quality', count: '' },
        { id: 'roles', icon: '◐', label: 'Roles & users', count: '' },
        { id: 'integrations', icon: '⧉', label: 'Webhooks & API', count: '' },
        { id: 'audit', icon: '⊙', label: 'Audit log', count: '' }
      ]
    }
  ],
  staff: [
    { title: 'Today', items: [{ id: 'mydash', icon: '◧', label: 'My day', count: '' }] },
    {
      title: 'Inbox',
      items: [
        { id: 'chats', icon: '✉', label: 'My chats', count: '' },
        { id: 'calls', icon: '☏', label: 'My calls', count: '' },
        { id: 'bookings', icon: '▦', label: 'Bookings', count: '' },
        { id: 'gallery', icon: '🖼', label: 'Media Gallery', count: '' },
        { id: 'fwd', icon: '⇄', label: 'Call forwarding', count: '' }
      ]
    },
    {
      title: 'Me',
      items: [
        { id: 'myperf', icon: '↗', label: 'My performance', count: '' },
        { id: 'quick', icon: '⌘', label: 'Quick replies', count: '' },
        { id: 'templates', icon: '▤', label: 'Message templates', count: '' },
        { id: 'profile', icon: '◐', label: 'Profile settings', count: '' }
      ]
    }
  ]
};

export const PRODUCT_ARTWORK = {
  pantry: `<rect x="15" y="12" width="120" height="30" rx="2" fill="#EEF1F6" stroke="#AEB7C7" stroke-width="2"/><path d="M55 12v30M95 12v30" stroke="#AEB7C7" stroke-width="2"/><rect x="21" y="17" width="28" height="20" fill="#D3E8F8"/><rect x="61" y="17" width="28" height="20" fill="#D3E8F8"/><rect x="101" y="17" width="28" height="20" fill="#D3E8F8"/><rect x="10" y="60" width="130" height="5" rx="1" fill="#8B94A8"/><rect x="15" y="65" width="120" height="36" rx="2" fill="#EEF1F6" stroke="#AEB7C7" stroke-width="2"/><path d="M55 65v36M95 65v36M15 77h40" stroke="#AEB7C7" stroke-width="2"/><path d="M29 71h12M50 84v10M90 72v10M100 72v10" stroke="#6E7890" stroke-width="2.4" stroke-linecap="round"/><rect x="68" y="55" width="16" height="5" rx="1" fill="#6E7890"/>`,
  vanity: `<rect x="50" y="6" width="50" height="38" rx="6" fill="#D3E8F8" stroke="#AEB7C7" stroke-width="2"/><path d="M58 14l10-6M58 22l18-12" stroke="#fff" stroke-width="2" stroke-linecap="round"/><rect x="30" y="54" width="90" height="7" rx="2" fill="#8B94A8"/><ellipse cx="75" cy="54" rx="18" ry="4" fill="#fff" stroke="#AEB7C7" stroke-width="2"/><path d="M75 44v6M71 44h8" stroke="#6E7890" stroke-width="2.4" stroke-linecap="round"/><rect x="34" y="61" width="82" height="40" rx="2" fill="#EEF1F6" stroke="#AEB7C7" stroke-width="2"/><path d="M75 61v40" stroke="#AEB7C7" stroke-width="2"/><path d="M69 74v12M81 74v12" stroke="#6E7890" stroke-width="2.4" stroke-linecap="round"/>`,
  wardrobe: `<rect x="28" y="6" width="94" height="96" rx="2" fill="#EEF1F6" stroke="#AEB7C7" stroke-width="2"/><path d="M59 6v96M91 6v96" stroke="#AEB7C7" stroke-width="2"/><rect x="63" y="12" width="24" height="84" fill="#D3E8F8"/><path d="M68 22l12-8M68 32l16-12" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M54 44v20M96 44v20" stroke="#6E7890" stroke-width="2.4" stroke-linecap="round"/><path d="M24 4h102" stroke="#8B94A8" stroke-width="3" stroke-linecap="round"/>`,
  overhead: `<path d="M10 8h130" stroke="#8B94A8" stroke-width="3" stroke-linecap="round"/><rect x="15" y="12" width="120" height="44" rx="2" fill="#EEF1F6" stroke="#AEB7C7" stroke-width="2"/><path d="M45 12v44M75 12v44M105 12v44" stroke="#AEB7C7" stroke-width="2"/><rect x="50" y="17" width="20" height="34" fill="#D3E8F8"/><rect x="80" y="17" width="20" height="34" fill="#D3E8F8"/><path d="M30 46v6M60 46v6M90 46v6M120 46v6" stroke="#6E7890" stroke-width="2.4" stroke-linecap="round"/><rect x="10" y="84" width="130" height="5" rx="1" fill="#8B94A8"/><rect x="15" y="89" width="120" height="14" fill="#EEF1F6" stroke="#AEB7C7" stroke-width="2"/>`
};

export function formatFileSize(b: number): string {
  if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
  return Math.max(1, Math.round(b / 1024)) + ' KB';
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s >= 3600) return Math.floor(s / 3600) + 'h ' + String(Math.floor((s % 3600) / 60)).padStart(2, '0') + 'm';
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
