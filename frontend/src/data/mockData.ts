import {
  Staff, Contact, Conversation, CallLogItem, Template, Product, QuickReply,
  CallConfig, IVROption, StatusType, MediaItem, AIBotSettings, AIBotLog
} from '@/types';

export const TODAY_STRING = 'Wednesday 30 September 2026';

export const COLOUR_CARD_SVG = (() => {
  const cols = [
    ['#F4F4F2', 'White'], ['#C9CCD1', 'Silver'], ['#6E7275', 'Grey'], ['#2B2D30', 'Black'],
    ['#7B4B2A', 'Teak'], ['#B08A5B', 'Oak'], ['#1F3B5B', 'Navy'], ['#8E1B1B', 'Maroon'],
    ['#D8C3A5', 'Beige'], ['#3E5641', 'Olive'], ['#C0A062', 'Champagne'], ['#4A4E69', 'Slate']
  ];
  const sw = cols.map((c, i) => {
    const x = 20 + (i % 4) * 95;
    const y = 56 + Math.floor(i / 4) * 78;
    return `<rect x="${x}" y="${y}" width="80" height="48" rx="6" fill="${c[0]}" stroke="#d0d6e2"/><text x="${x + 40}" y="${y + 64}" font-size="11" text-anchor="middle" fill="#3b4463" font-family="sans-serif">${c[1]}</text>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="300" viewBox="0 0 420 300"><rect width="420" height="300" fill="#fff"/><rect width="420" height="6" fill="#1B6FC4"/><text x="20" y="38" font-size="18" font-weight="700" fill="#13296B" font-family="sans-serif">Madushan Aluminium · Powder-coat colours</text>${sw}</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
})();

export const INITIAL_STAFF: Staff[] = [
  {
    id: 's1',
    n: 'Nimal Bandara',
    i: 'NB',
    st: 'call',
    stt: 'On a call',
    open: 5,
    rep: '2m 10s',
    calls: 18,
    done: 78,
    res: 64,
    miss: 2,
    call: { st: 'oncall', r: '', since: Date.now() - 4 * 60000, mins: 0 },
    chat: { st: 'available', r: '', since: Date.now() - 95 * 60000, mins: 0 },
    used: 22,
    log: [
      ['Tea', '10:30', 12, 'Calls + chats'],
      ['Prayer', '12:15', 10, 'Calls + chats']
    ]
  },
  {
    id: 's2',
    n: 'Sachini Wickrama',
    i: 'SW',
    st: '',
    stt: 'Available',
    open: 4,
    rep: '3m 05s',
    calls: 15,
    done: 64,
    res: 52,
    miss: 3,
    call: { st: 'available', r: '', since: Date.now() - 40 * 60000, mins: 0 },
    chat: { st: 'dnd', r: '', since: Date.now() - 25 * 60000, mins: 0 },
    used: 14,
    log: [['Tea', '10:15', 14, 'Calls + chats']],
    noteS: 'Calls only until 12:00'
  },
  {
    id: 's3',
    n: 'Ruwan Kumara',
    i: 'RK',
    st: 'away',
    stt: 'Away',
    open: 3,
    rep: '5m 20s',
    calls: 9,
    done: 35,
    res: 31,
    miss: 4,
    call: { st: 'brk', r: 'Lunch', since: Date.now() - 18 * 60000, mins: 45 },
    chat: { st: 'brk', r: 'Lunch', since: Date.now() - 18 * 60000, mins: 45 },
    used: 15,
    log: [['Tea', '10:40', 15, 'Calls + chats']]
  }
];

export const INITIAL_MANAGER = {
  id: 'mgr',
  n: 'Madushan P.',
  i: 'MP',
  call: { st: 'available' as StatusType, r: '', since: Date.now() - 52 * 60000, mins: 0 },
  chat: { st: 'available' as StatusType, r: '', since: Date.now() - 52 * 60000, mins: 0 },
  used: 0,
  log: [] as [string, string, number, string][],
  queue: true
};

export const INITIAL_CONTACTS: Record<string, Contact> = {
  c1: {
    id: 'c1',
    n: 'Kasun Perera',
    i: 'KP',
    a: 'a1',
    ph: '+94 77 234 5678',
    since: 'Mar 2026',
    city: 'Kandy',
    to: 's1',
    perm: true,
    labels: [['Quotation', 'i'], ['Hot lead', 'b'], ['Kandy', 'w']],
    hist: [
      ['Mon 09:12', 'Assigned to Nimal', 'Auto-assign · round robin']
    ]
  },
  c2: {
    id: 'c2',
    n: 'Mohamed Rizwan',
    i: 'MR',
    a: 'a2',
    ph: '+94 71 456 7788',
    since: 'Sep 2026',
    city: 'Colombo 06',
    to: null,
    perm: false,
    labels: [['Wardrobe', '']],
    hist: [
      ['Today 09:58', 'New customer · no owner yet', 'System']
    ]
  },
  c3: {
    id: 'c3',
    n: 'Dilani Fernando',
    i: 'DF',
    a: 'a3',
    ph: '+94 76 332 1144',
    since: 'Aug 2026',
    city: 'Negombo',
    to: 's2',
    perm: true,
    labels: [['Site visit', 'w']],
    hist: [
      ['Mon 09:12', 'Assigned to Sachini', 'Auto-assign · round robin']
    ]
  },
  c4: {
    id: 'c4',
    n: 'Tharindu Silva',
    i: 'TS',
    a: 'a4',
    ph: '+94 70 998 2211',
    since: 'Jul 2026',
    city: 'Kurunegala',
    to: 's2',
    perm: false,
    labels: [['Advance paid', 'ok']],
    hist: [
      ['Mon 09:12', 'Assigned to Sachini', 'Auto-assign · round robin']
    ]
  },
  c5: {
    id: 'c5',
    n: 'Anjali Rao',
    i: 'AR',
    a: 'a5',
    ph: '+94 77 881 4590',
    since: 'Jun 2026',
    city: 'Colombo 05',
    to: 's1',
    perm: true,
    labels: [['Installation', 'i']],
    hist: [
      ['Yesterday 16:40', 'Moved from Sachini to Nimal', 'Madushan · Sachini on leave'],
      ['Mon 09:12', 'Assigned to Sachini', 'Auto-assign · round robin']
    ]
  },
  c6: {
    id: 'c6',
    n: 'Chamara Jayasuriya',
    i: 'CJ',
    a: 'a6',
    ph: '+94 75 120 3344',
    since: 'May 2026',
    city: 'Galle',
    to: 's3',
    perm: false,
    labels: [],
    hist: [
      ['Mon 09:12', 'Assigned to Ruwan', 'Auto-assign · round robin']
    ]
  },
  c7: {
    id: 'c7',
    n: 'Priya Nadarajah',
    i: 'PN',
    a: 'a7',
    ph: '+94 77 665 0012',
    since: 'Sep 2026',
    city: 'Jaffna',
    to: 's1',
    perm: true,
    labels: [['Wardrobe', '']],
    hist: [
      ['Mon 09:12', 'Assigned to Nimal', 'Auto-assign · round robin']
    ]
  }
};

const HR = 3600000;
const T0 = Date.now();

export const INITIAL_CONVERSATIONS: Conversation[] = [
  {
    id: 'v1',
    c: 'c1',
    pv: 'කිචන් කබඩ් quotation එක කවදද?',
    t: '10:42',
    un: 2,
    win: 23,
    exp: T0 + 21.4 * HR,
    msgs: [
      { dir: 'in', type: 'text', text: 'ආයුබෝවන්, මට අලුමිනියම් කිචන් කබඩ් එකක් ඕනේ', time: '10:38' },
      { dir: 'in', type: 'text', text: 'කිචන් කබඩ් quotation එක කවදද?', time: '10:42' },
      { dir: 'note', type: 'note', text: 'Site measurement Saturday 10am, Kandy. Soft-close hinges ahuwa', time: '10:43', sender: 'Nimal' },
      { dir: 'out', type: 'text', text: 'Hi Kasun! 10ft pantry cupboard ekata quotation Q-1042 eka ready. Aluminium frame + glass shutters.', time: '10:45', sender: 'Nimal', read: 1 },
      { dir: 'out', type: 'tpl', text: 'Your quotation Q-1042 is ready: Rs. 185,000. Valid until 30 Sep.', time: '10:45', sender: 'quotation_ready', read: 1, buttons: ['View quote', 'Call us'] },
      {
        dir: 'out',
        type: 'text',
        text: 'Colour card eka attach kala. Kamathi colour eka kiyanna.',
        time: '10:45',
        sender: 'Nimal',
        read: 1,
        attachments: [{ type: 'image', name: 'Colour_card.jpg', size: 348160, url: COLOUR_CARD_SVG }]
      },
      { dir: 'in', type: 'text', text: 'හරි, thanks!', time: '10:46' },
      { dir: 'sys', type: 'sys', text: '↗ Voice call · 4:32 · Nimal · recording saved', time: '10:50' }
    ]
  },
  {
    id: 'v2',
    c: 'c2',
    pv: 'Wardrobe ekak gana call kala, miss una',
    t: '10:01',
    un: 1,
    win: 24,
    exp: T0 + 23.9 * HR,
    msgs: [
      { dir: 'sys', type: 'sys', text: '↙ Missed voice call', time: '09:58' },
      { dir: 'out', type: 'text', text: 'Sorry we missed your call! A team member will call you back shortly.', time: '09:58', sender: 'Auto-reply', read: 1 },
      { dir: 'in', type: 'text', text: 'Wardrobe ekak gana call kala, miss una', time: '10:01' }
    ]
  },
  {
    id: 'v3',
    c: 'c3',
    pv: '▶ Voice message · 0:24',
    t: '10:15',
    un: 0,
    win: 22,
    exp: T0 + 1.35 * HR,
    msgs: [
      { dir: 'in', type: 'text', text: '▶ Voice message · 0:24', time: '10:15' },
      { dir: 'note', type: 'note', text: 'Site visit Negombo Thursday 3pm. Bring vanity samples.', time: '10:20', sender: 'Sachini' }
    ]
  },
  {
    id: 'v4',
    c: 'c4',
    pv: 'Catalog order · Bathroom vanity',
    t: '09:30',
    un: 0,
    win: 21,
    exp: T0 + 13.6 * HR,
    msgs: [
      { dir: 'in', type: 'text', text: '🛍 Order from catalog · Bathroom Vanity 36" × 1', time: '09:28' },
      { dir: 'in', type: 'text', text: 'Advance eka dammaa, slip eka attach kala', time: '09:30' },
      { dir: 'out', type: 'text', text: 'Received, thank you! Installation date eka heta confirm karannam.', time: '09:34', sender: 'Sachini', read: 1 }
    ]
  },
  {
    id: 'v5',
    c: 'c5',
    pv: 'Installation Saturday 9am confirmed',
    t: 'Yesterday',
    un: 0,
    win: null,
    exp: 0,
    msgs: [
      { dir: 'out', type: 'tpl', text: 'Your installation is scheduled for Saturday 9am.', time: 'Yesterday', sender: 'installation_reminder', read: 1 },
      { dir: 'out', type: 'text', text: 'Installation Saturday 9am confirmed', time: 'Yesterday', sender: 'Nimal', read: 1 }
    ]
  },
  {
    id: 'v6',
    c: 'c6',
    pv: 'හරි, ස්තුතියි!',
    t: 'Sun',
    un: 0,
    win: null,
    exp: T0 + 0.7 * HR,
    msgs: [
      { dir: 'in', type: 'text', text: 'Overhead cabinet colours tika evanna puluwanda?', time: 'Sun' },
      { dir: 'out', type: 'text', text: 'Colour card eka attach kala. 12 colours thiyenawa.', time: 'Sun', sender: 'Ruwan', read: 1 },
      { dir: 'in', type: 'text', text: 'හරි, ස්තුතියි!', time: 'Sun' }
    ]
  },
  {
    id: 'v7',
    c: 'c7',
    pv: 'Sliding wardrobe colours thiyenawada?',
    t: 'Yesterday',
    un: 0,
    win: null,
    exp: 0,
    msgs: [
      { dir: 'in', type: 'text', text: 'Sliding wardrobe colours thiyenawada?', time: 'Yesterday' },
      {
        dir: 'out',
        type: 'text',
        text: 'Ow, 12 colours thiyenawa. Colour card eka attach kala.',
        time: 'Yesterday',
        sender: 'Nimal',
        read: 1,
        attachments: [{ type: 'image', name: 'Colour_card.jpg', size: 348160, url: COLOUR_CARD_SVG }]
      },
      { dir: 'in', type: 'text', text: 'Allow calls', time: 'Yesterday' }
    ]
  }
];

export const INITIAL_CALLS: CallLogItem[] = [
  { c: 'c7', d: 'ringing', t: 'now' },
  { c: 'c2', d: 'missed', t: 'Today 09:58', note: 'Auto-reply sent', by: '—' },
  { c: 'c1', d: 'outgoing', t: 'Today 10:50', dur: '4:32', by: 'Nimal', rec: 1, ai: 1 },
  { c: 'c5', d: 'incoming', t: 'Today 11:20', dur: '2:10', by: 'Sachini', rec: 1 },
  { c: 'c3', d: 'rejected', t: 'Today 08:40', note: 'Sachini was busy', by: 'Sachini' },
  { c: 'c4', d: 'incoming', t: 'Today 14:15', dur: '5:24', by: 'Madushan', rec: 1, ai: 1 },
  { c: 'c6', d: 'outgoing', t: 'Today 15:40', dur: '3:15', by: 'Ruwan', rec: 0 },
  { c: 'c1', d: 'incoming', t: 'Today 18:25', dur: '7:50', by: 'Dinuka', rec: 1, ai: 1 },
  { c: 'c3', d: 'missed', t: 'Today 20:10', note: 'After business hours', by: '—' },
  { c: 'c4', d: 'incoming', t: 'Yesterday 10:30', dur: '6:48', by: 'Sachini', rec: 1, ai: 1 },
  { c: 'c5', d: 'outgoing', t: 'Yesterday 11:15', dur: '3:40', by: 'Nimal', rec: 1 },
  { c: 'c2', d: 'incoming', t: 'Yesterday 14:20', dur: '4:12', by: 'Kaveen', rec: 0 },
  { c: 'c6', d: 'missed', t: 'Yesterday 19:20', note: 'After hours auto-reply', by: '—' },
  { c: 'c7', d: 'transferred', t: 'Yesterday 16:50', dur: '8:05', by: 'Madushan', note: 'Transferred to Nimal', rec: 1 },
  { c: 'c1', d: 'incoming', t: '2026-10-01 09:15', dur: '5:10', by: 'Ruwan', rec: 1 },
  { c: 'c3', d: 'outgoing', t: '2026-10-01 13:40', dur: '2:45', by: 'Dinuka', rec: 0 },
  { c: 'c5', d: 'rejected', t: '2026-10-01 17:30', by: 'Nimal', note: 'Client meeting' },
  { c: 'c4', d: 'incoming', t: '2026-09-30 11:05', dur: '6:20', by: 'Sachini', rec: 1, ai: 1 },
  { c: 'c2', d: 'missed', t: '2026-09-30 21:15', note: 'Late night call', by: '—' }
];

export const INITIAL_TEMPLATES: Template[] = [
  {
    n: 'quotation_ready',
    cat: 'Utility',
    lang: 'English',
    st: 'ok',
    stt: 'Approved',
    q: 'High',
    used: 48,
    body: 'Your quotation {{1}} is ready: Rs. {{2}}. Valid until {{3}}.',
    btn: ['View quote', 'Call us']
  },
  {
    n: 'advance_payment_si',
    cat: 'Utility',
    lang: 'Sinhala',
    st: 'w',
    stt: 'In review',
    q: '—',
    used: 0,
    body: 'ඔබගේ ඇණවුම ආරම්භ කිරීමට {{1}} අත්තිකාරම් ගෙවන්න. ගිණුම් අංකය {{2}}.'
  },
  {
    n: 'avurudu_offer',
    cat: 'Marketing',
    lang: 'English',
    st: 'b',
    stt: 'Rejected',
    q: '—',
    used: 0,
    body: 'Avurudu offer! 10% off all bathroom vanities until {{1}}.',
    why: 'Image header quality too low. Use a clearer photo.'
  },
  {
    n: 'call_permission',
    cat: 'Utility',
    lang: 'English',
    st: 'ok',
    stt: 'Approved',
    q: 'High',
    used: 22,
    body: 'Can our team call you on WhatsApp about your order?',
    btn: ['Allow calls', 'Not now']
  },
  {
    n: 'installation_reminder',
    cat: 'Utility',
    lang: 'English',
    st: 'ok',
    stt: 'Approved',
    q: 'Medium',
    used: 31,
    body: 'Reminder: installation at {{1}} on {{2}}. Please keep the site clear.'
  },
  {
    n: 'missed_call_si',
    cat: 'Utility',
    lang: 'Sinhala',
    st: 'ok',
    stt: 'Approved',
    q: 'High',
    used: 17,
    body: 'ඔබගේ ඇමතුම මග හැරුණා. අපි ඉක්මනින් නැවත අමතන්නම්.'
  }
];

export const INITIAL_PRODUCTS: Product[] = [
  { n: 'Pantry Cupboard 10ft', col: 'Kitchen', p: 'Rs. 185,000', note: 'Aluminium frame + glass · made to order', k: 'pantry', sku: 'MA-K-1042', st: 'ok' },
  { n: 'Bathroom Vanity 36"', col: 'Bathroom', p: 'Rs. 38,250', old: 'Rs. 42,500', note: 'Avurudu offer · 10% off', k: 'vanity', sku: 'MA-B-0360', st: 'ok' },
  { n: 'Sliding Wardrobe 3-door', col: 'Wardrobes', p: 'Rs. 145,000', note: 'Made to measure · mirror centre panel', k: 'wardrobe', sku: 'MA-W-0300', st: 'ok' },
  { n: 'Overhead Kitchen Cabinet', col: 'Kitchen', p: 'Rs. 12,500 / ft', note: 'Powder-coated · 12 colours', k: 'overhead', sku: 'MA-K-0012', st: 'ok' },
  { n: 'Bathroom Vanity 24"', col: 'Bathroom', p: 'Rs. 29,500', note: 'Compact · single door', k: 'vanity', sku: 'MA-B-0240', st: 'w' },
  { n: 'Hinged Wardrobe 2-door', col: 'Wardrobes', p: 'Rs. 98,000', note: 'Aluminium + laminate', k: 'wardrobe', sku: 'MA-W-0200', st: 'ok' }
];

export const INITIAL_QUICK_REPLIES: QuickReply[] = [
  {
    cmd: '/price-list',
    t: 'Kitchen & wardrobe price list',
    x: 'Madushan Aluminium price list 2026 attach kala. Measurement ekata passe final quotation ekak dennam.',
    att: [{ type: 'file', name: 'Madushan_Price_List_2026.pdf', size: 1258291 }],
    used: 37,
    by: 'Madushan P.'
  },
  {
    cmd: '/colours',
    t: 'Powder-coat colour card',
    x: 'Colours 12k thiyenawa. Kamathi colour eka kiyanna.',
    att: [{ type: 'image', name: 'Colour_card.jpg', size: 348160, url: COLOUR_CARD_SVG }],
    used: 22,
    by: 'Nimal'
  },
  {
    cmd: '/hello',
    t: 'Welcome voice note (Sinhala)',
    x: '',
    att: [{ type: 'voice', name: 'welcome_si.ogg', size: 61440, dur: '0:18' }],
    used: 15,
    by: 'Madushan P.'
  },
  {
    cmd: '/measure',
    t: 'Book a free site measurement',
    x: 'Site measurement eka free. Address eka saha podi welawak evanna, dawas 2-3k athulata enawa.',
    att: [],
    used: 29,
    by: 'Sachini'
  },
  {
    cmd: '/bank-details',
    t: 'Bank details + slip request',
    x: 'Commercial Bank · Kadawatha · A/C 1234 5678 90 · Madushan Aluminium. Advance eka dammama slip eka evanna.',
    att: [],
    used: 18,
    by: 'Madushan P.'
  },
  {
    cmd: '/warranty',
    t: 'Warranty terms',
    x: 'Aluminium frame ekata 10 year warranty, hinges 2 years. Details attach kala.',
    att: [
      { type: 'file', name: 'Warranty_Terms.pdf', size: 215040 },
      { type: 'image', name: 'Colour_card.jpg', size: 348160, url: COLOUR_CARD_SVG }
    ],
    used: 6,
    by: 'Madushan P.'
  }
];

export const INITIAL_CALL_CONFIG: CallConfig = {
  brkmax: 60,
  ring: 'all',
  ringsec: 20,
  rec: {
    auto: true,
    ann: true,
    pause: true,
    keep: '90'
  },
  link: false,
  fwd: {
    noans: 'queue',
    busy: 'wait',
    brk: 'queue',
    away: 'queue',
    dnd: 'msg',
    after: 'msg'
  }
};

export const INITIAL_IVR: {
  on: boolean;
  mode: 'rec' | 'tts';
  wait: number;
  none: string;
  after: boolean;
  greet: string;
  audio?: { type: 'voice'; name: string; size: number; dur: string };
  opts: IVROption[];
} = {
  on: true,
  mode: 'rec',
  wait: 8,
  none: 'queue',
  after: true,
  greet: 'Ayubowan! Madushan Aluminium. Kitchen cabinets: press 1. Bathroom vanities: press 2. Wardrobes: press 3. Installation and service: press 4. Price list on WhatsApp: press 5. Anyone else: press 0.',
  audio: { type: 'voice', name: 'ivr_greeting_si.ogg', size: 184320, dur: '0:21' },
  opts: [
    { k: '1', t: 'Kitchen cabinets', to: 's1' },
    { k: '2', t: 'Bathroom vanities', to: 's2' },
    { k: '3', t: 'Wardrobes', to: 'queue' },
    { k: '4', t: 'Installation & service', to: 's3' },
    { k: '5', t: 'Price list on WhatsApp', to: 'qr:/price-list' },
    { k: '0', t: 'Any available person', to: 'queue' }
  ]
};

export const NAV_STRUCTURE = {
  manager: [
    { title: 'Today', items: [{ id: 'dash', icon: '◧', label: 'Dashboard', count: '' }] },
    {
      title: 'Inbox',
      items: [
        { id: 'chats', icon: '✉', label: 'Chats', count: '3' },
        { id: 'calls', icon: '☏', label: 'Calls', count: '2' },
        { id: 'contacts', icon: '☰', label: 'Customers & owners', count: '1' },
        { id: 'labels', icon: '◈', label: 'Labels', count: '' }
      ]
    },
    {
      title: 'AI Automation',
      items: [
        { id: 'aibot', icon: '✦', label: 'AI Bot (Calls & Chats)', count: 'Live' }
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
        { id: 'gallery', icon: '🖼', label: 'Media Gallery', count: '14' },
        { id: 'templates', icon: '▤', label: 'Message templates', count: '1' },
        { id: 'catalog', icon: '▣', label: 'Catalog & pricing', count: '' },
        { id: 'broadcasts', icon: '⌁', label: 'Broadcasts', count: '' },
        { id: 'quick', icon: '⌘', label: 'Quick replies', count: '' }
      ]
    },
    {
      title: 'Calls',
      items: [
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
        { id: 'chats', icon: '✉', label: 'My chats', count: '2' },
        { id: 'calls', icon: '☏', label: 'My calls', count: '1' },
        { id: 'gallery', icon: '🖼', label: 'Media Gallery', count: '14' },
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



export const FORWARDING_DESTINATIONS: Record<string, string> = {
  queue: 'Sales queue',
  wait: 'Call waiting (beep)',
  msg: 'Missed-call message + callback',
  vm: 'Ask for a WhatsApp voice note',
  s1: 'Nimal Bandara',
  s2: 'Sachini Wickrama',
  s3: 'Ruwan Kumara',
  mgr: 'Madushan P.'
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

export const INITIAL_MEDIA: MediaItem[] = [
  {
    id: 'med_1',
    title: 'Modern Gloss White Aluminium Pantry',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=900&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=400&q=80',
    caption: 'Luxury powder-coated gloss white aluminium pantry cabinet setup with Blum soft-close hinges, quartz countertop integration, and warm LED channel lighting. 15-year termite-proof warranty.',
    size: 2450000,
    category: 'Products',
    tags: ['#pantry', '#gloss-white', '#kitchen', '#luxury', '#modern'],
    addedAt: 'Yesterday 14:20',
    addedBy: 'Madushan P.',
    isFavorite: true,
    shares: 42,
    downloads: 18,
    width: 1920,
    height: 1280
  },
  {
    id: 'med_2',
    title: 'Smooth Sliding Wardrobe Mechanism Demo',
    type: 'video',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=600&q=80',
    caption: 'Watch our dual-track acoustic soft-close sliding wardrobe rollers in action. Tested for 50,000 glide cycles with zero rattle or friction.',
    size: 8900000,
    duration: '0:42',
    category: 'Products',
    tags: ['#video', '#wardrobe', '#sliding-door', '#soft-close', '#demo'],
    addedAt: '2 days ago',
    addedBy: 'Nimal Bandara',
    isFavorite: true,
    shares: 64,
    downloads: 31
  },
  {
    id: 'med_3',
    title: 'Matte Black Minimalist Wardrobe 3-Door',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=900&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=400&q=80',
    caption: 'Floor-to-ceiling 3-track sliding wardrobe with tinted bronze mirror inserts, concealed aluminium pulls, and silent bottom carriage.',
    size: 3120000,
    category: 'Products',
    tags: ['#wardrobe', '#matte-black', '#sliding', '#bedroom', '#storage'],
    addedAt: '3 days ago',
    addedBy: 'Nimal Bandara',
    isFavorite: true,
    shares: 29,
    downloads: 12,
    width: 1920,
    height: 1080
  },
  {
    id: 'med_4',
    title: 'Floating Vanity Unit with Touch LED Mirror',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=900&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=400&q=80',
    caption: '100% waterproof extruded aluminium bathroom vanity in Champagne Gold with white ceramic basin and touch-sensor anti-fog LED mirror.',
    size: 1890000,
    category: 'Products',
    tags: ['#vanity', '#bathroom', '#waterproof', '#led-mirror', '#gold'],
    addedAt: '4 days ago',
    addedBy: 'Sachini Wickrama',
    isFavorite: false,
    shares: 18,
    downloads: 9,
    width: 1600,
    height: 1200
  },
  {
    id: 'med_5',
    title: 'Workshop Tour & Electrostatic Powder Coating',
    type: 'video',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=600&q=80',
    caption: 'Walkthrough of our Maharagama fabrication plant: automated double-mitre saw cuts, 7-stage chemical pre-treatment, and high-temp powder coating.',
    size: 14200000,
    duration: '1:15',
    category: 'Workshop',
    tags: ['#video', '#workshop', '#powder-coating', '#factory-tour', '#quality'],
    addedAt: '4 days ago',
    addedBy: 'Madushan P.',
    isFavorite: true,
    shares: 48,
    downloads: 25
  },
  {
    id: 'med_6',
    title: 'Madushan Aluminium Powder Coat Swatch Card 2026',
    type: 'image',
    url: COLOUR_CARD_SVG,
    thumbnail: COLOUR_CARD_SVG,
    caption: 'Official 2026 powder coat palette: Teak Wood Grain, Oak, Champagne Gold, Matte Black, Slate Grey, Arctic White, and Marine Blue.',
    size: 840000,
    category: 'Products',
    tags: ['#colours', '#powder-coat', '#catalogue', '#swatches', '#pricing'],
    addedAt: 'Last week',
    addedBy: 'Madushan P.',
    isFavorite: true,
    shares: 84,
    downloads: 52,
    width: 1200,
    height: 800
  },
  {
    id: 'med_7',
    title: 'Overhead Pantry Rack with Fluted Glass Doors',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1507089947368-19c1da9775ae?auto=format&fit=crop&w=900&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1507089947368-19c1da9775ae?auto=format&fit=crop&w=400&q=80',
    caption: 'Overhead aluminium storage unit featuring imported fluted tempered glass doors and interior warm ambient LED spotlighting.',
    size: 2210000,
    category: 'Products',
    tags: ['#overhead', '#pantry', '#fluted-glass', '#luxury', '#kitchen'],
    addedAt: '2 days ago',
    addedBy: 'Nimal Bandara',
    isFavorite: false,
    shares: 15,
    downloads: 8,
    width: 1800,
    height: 1200
  },
  {
    id: 'med_8',
    title: 'Step-by-Step Pantry Corner Carousel Assembly',
    type: 'video',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1556909212-d5b604d0c90d?auto=format&fit=crop&w=600&q=80',
    caption: 'Video demonstrating the precision 270-degree rotating aluminium corner carousel hardware, engineered to maximize deep blind corner storage.',
    size: 9400000,
    duration: '0:58',
    category: 'Installation',
    tags: ['#video', '#corner-unit', '#hardware', '#assembly', '#carousel'],
    addedAt: '6 days ago',
    addedBy: 'Ruwan Kumara',
    isFavorite: false,
    shares: 22,
    downloads: 14
  },
  {
    id: 'med_9',
    title: 'Gampaha Luxury Residence Full Installation',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=400&q=80',
    caption: 'Completed turn-key aluminium fitout for 2-storey residence at Gampaha: 24ft open-plan kitchen pantry, 3 bedrooms, and 2 vanity sets.',
    size: 3800000,
    category: 'Installation',
    tags: ['#installation', '#gampaha', '#completed', '#site-visit', '#real-project'],
    addedAt: '5 days ago',
    addedBy: 'Ruwan Kumara',
    isFavorite: true,
    shares: 33,
    downloads: 16,
    width: 2000,
    height: 1333
  },
  {
    id: 'med_10',
    title: 'Customer Walkthrough: Kitchen Reveal & Review',
    type: 'video',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?auto=format&fit=crop&w=600&q=80',
    caption: 'Homeowner Mrs. Perera (Rajagiriya) gives a live walkthrough of her matte grey aluminium pantry and praises the clean 3-day installation.',
    size: 15600000,
    duration: '1:30',
    category: 'Testimonials',
    tags: ['#video', '#testimonial', '#reveal', '#kitchen-tour', '#happy-client'],
    addedAt: '1 week ago',
    addedBy: 'Madushan P.',
    isFavorite: true,
    shares: 75,
    downloads: 41
  },
  {
    id: 'med_11',
    title: 'Precision CNC Aluminium Cutting & Assembly',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?auto=format&fit=crop&w=900&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?auto=format&fit=crop&w=400&q=80',
    caption: 'Close-up of aluminium extrusion profiles being milled and joined with stainless steel internal cleat brackets for maximum structural rigidity.',
    size: 2750000,
    category: 'Workshop',
    tags: ['#workshop', '#factory', '#machinery', '#quality', '#engineering'],
    addedAt: '1 week ago',
    addedBy: 'Madushan P.',
    isFavorite: false,
    shares: 11,
    downloads: 5,
    width: 1920,
    height: 1200
  },
  {
    id: 'med_12',
    title: 'Explainer: Aluminium vs Wood in Sri Lankan Climate',
    type: 'video',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnail: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80',
    caption: 'Why modern aluminium is the #1 choice in Sri Lanka: 100% termite proof, zero swelling in monsoon humidity, fire-rated, and zero formaldehyde.',
    size: 6800000,
    duration: '0:35',
    category: 'Promotions',
    tags: ['#video', '#explainer', '#termites', '#waterproof', '#benefits'],
    addedAt: '3 days ago',
    addedBy: 'Nimal Bandara',
    isFavorite: true,
    shares: 91,
    downloads: 62
  },
  {
    id: 'med_13',
    title: 'Avurudu 2026 Season Promo: 15% Off + Free 3D Render',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=900&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=400&q=80',
    caption: 'Festive promotion flyer: 15% discount on all custom pantry cupboards booked with advance measurement before April 30th. Free 3D layout included.',
    size: 1980000,
    category: 'Promotions',
    tags: ['#promo', '#discount', '#avurudu', '#offer', '#marketing'],
    addedAt: 'Yesterday 09:15',
    addedBy: 'Madushan P.',
    isFavorite: true,
    shares: 56,
    downloads: 38,
    width: 1600,
    height: 1200
  },
  {
    id: 'med_14',
    title: 'Client Handover Inspection Certificate',
    type: 'image',
    url: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=900&q=80',
    thumbnail: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=400&q=80',
    caption: 'Official project completion certificate signed with 15-year warranty seal and customer satisfaction verification.',
    size: 1420000,
    category: 'Testimonials',
    tags: ['#testimonial', '#handover', '#warranty', '#certificate', '#trust'],
    addedAt: '2 weeks ago',
    addedBy: 'Madushan P.',
    isFavorite: false,
    shares: 7,
    downloads: 4,
    width: 1400,
    height: 1000
  }
];

export const INITIAL_AI_BOT_SETTINGS: AIBotSettings = {
  chatBotEnabled: true,
  voiceBotEnabled: true,
  chatBotMode: 'always',
  personaName: 'Lumi AI · Madushan Aluminium',
  languageMode: 'trilingual',
  systemPrompt: `You are Lumi AI, the official customer service & sales intelligence agent for Madushan Aluminium (Pvt) Ltd in Sri Lanka.
Core Knowledge & Guidelines:
1. Products: Aluminium Kitchen Pantry Cupboards, 2/3 Track Sliding Wardrobes, Waterproof Bathroom Vanities, and Architectural Glass Partitions.
2. Materials: Extruded architectural-grade aluminium with 7-stage electrostatic powder coating. 100% termite proof, water resistant, and non-corrosive.
3. Pricing Estimates:
   - Pantry Cupboards: Rs. 7,200 – 9,500 per sq.ft (includes high-grade carcass, soft-close hardware, and installation).
   - Sliding Wardrobes: Rs. 6,800 – 8,200 per sq.ft.
   - Vanities: Rs. 28,000 – 48,000 per unit (depends on sink & size).
4. Service Areas: Showroom & Factory located at Maharagama. Free on-site measurement visits across Colombo, Gampaha, and Kalutara districts.
5. Language & Tone: Courteous, welcoming, trilingual (fluent in Sinhala, English, and Singlish).
6. Human Hand-off Rules:
   - When customer requests a custom quotation with specific architectural blueprints or floor plans.
   - When customer asks for a discount/special owner negotiation.
   - When customer asks to speak with staff directly ("Nimal ta denna", "call me", "talk to human").`,
  confidenceThreshold: 85,
  autoHandoffOnNegotiation: true,
  autoHandoffOnComplaint: true,
  autoHandoffOnStaffRequest: true,
  welcomeMessage: 'Ayubowan! 🙏 Welcome to Madushan Aluminium. I am Lumi AI, your 24/7 assistant. How can I help you today with pantry cupboards, wardrobes, or site measurements?',
  fallbackMessage: 'I want to make sure you get the exact specifications and custom quotation! Connecting you directly with our senior sales specialist Nimal Bandara now.',
  voiceModel: 'Kavindi - Sri Lankan Natural Voice (LUMI Neural)',
  voiceGreeting: 'Ayubowan! Thank you for calling Madushan Aluminium. I am your AI receptionist. Would you like to check product prices, book a free site measurement, or speak to our team?',
  autoTranscribeCalls: true,
  autoSummarizeCalls: true,
  missedCallAutoFollowup: true,
  missedCallMessageTemplate: 'Hi! We noticed we missed your call to Madushan Aluminium. How can our AI assistant help you with pantry cupboards, wardrobes, or site measurements right now?',
  voiceLanguage: 'trilingual',
  voiceSpeed: 1.0
};

export const INITIAL_AI_LOGS: AIBotLog[] = [
  {
    id: 'log_1',
    channel: 'chat',
    contactName: 'Nadeeka Perera',
    contactPhone: '+94 77 123 4567',
    timestamp: 'Today 14:38',
    intent: '#pricing_inquiry',
    confidence: 96,
    userInput: 'Aluminium pantry cupboards square foot ekak kiyada yanne? Normal 10x10 kitchen ekakata budget eka?',
    botOutput: 'Ayubowan Nadeeka! අපගේ Powder-coated Aluminium pantry cupboards square foot එකක් Rs. 7,200 – 9,500 අතර වේ (soft-close hinges & warranty ඇතුළුව). සාමාන්‍ය 10x10 kitchen එකක් සඳහා standard setup එක Rs. 180,000 – 240,000 අතර වේ. අපගේ photos & color chart එක එවන්නද?',
    status: 'resolved',
    tokensUsed: 142,
    latencyMs: 380
  },
  {
    id: 'log_2',
    channel: 'call',
    contactName: 'Dr. Kalinga Silva',
    contactPhone: '+94 71 884 1920',
    timestamp: 'Today 13:15',
    intent: '#site_measurement_request',
    confidence: 98,
    userInput: 'Caller called to arrange an on-site engineer visit to Rajagiriya for new house wardrobe & pantry measurements.',
    botOutput: 'AI Voice Receptionist collected address (14/2 Temple Rd, Rajagiriya) and preferred date (Saturday 10:00 AM). Auto-assigned measurement task to Ruwan Kumara and sent WhatsApp confirmation.',
    status: 'handled',
    agent: 'Ruwan Kumara',
    tokensUsed: 310,
    latencyMs: 240,
    callDuration: '1m 42s'
  },
  {
    id: 'log_3',
    channel: 'chat',
    contactName: 'Kasun Wickramasinghe',
    contactPhone: '+94 76 991 2234',
    timestamp: 'Today 11:20',
    intent: '#media_request',
    confidence: 94,
    userInput: 'Matte black sliding wardrobes wala real photos thiyenawada balanna?',
    botOutput: 'Automated response with 2 gallery photos: [Modern Matte Black 3-Door Wardrobe] + [Sliding Door Mechanism Video demo]. Added note that custom heights up to 10ft are supported.',
    status: 'resolved',
    tokensUsed: 118,
    latencyMs: 310
  },
  {
    id: 'log_4',
    channel: 'chat',
    contactName: 'Sunil Jayawardena',
    contactPhone: '+94 77 334 5566',
    timestamp: 'Today 10:05',
    intent: '#human_handoff',
    confidence: 99,
    userInput: 'Mage layout plan ekak thiyenawa architect dunna. Nimal ekka direct katha karanna puluwanda price adu karaganna?',
    botOutput: 'Detected negotiation & explicit staff request. AI escalated chat to Nimal Bandara with high-priority badge and attached customer architect layout reference.',
    status: 'handed_off',
    agent: 'Nimal Bandara',
    tokensUsed: 86,
    latencyMs: 290
  },
  {
    id: 'log_5',
    channel: 'call',
    contactName: 'Unknown Caller',
    contactPhone: '+94 70 445 1199',
    timestamp: 'Yesterday 18:45',
    intent: '#after_hours_call',
    confidence: 91,
    userInput: 'Inbound call received after office hours (18:45).',
    botOutput: 'AI Voice Receptionist answered greeting: "Madushan Aluminium after-hours assistant". Caller inquired about Sunday showroom hours. Bot stated 9AM - 1PM and sent location map via WhatsApp.',
    status: 'handled',
    tokensUsed: 220,
    latencyMs: 210,
    callDuration: '0m 54s'
  },
  {
    id: 'log_6',
    channel: 'call',
    contactName: 'Dilani Samarasinghe',
    contactPhone: '+94 77 665 4433',
    timestamp: 'Yesterday 15:10',
    intent: '#missed_call_recovery',
    confidence: 100,
    userInput: 'Missed inbound voice call (staff on other line).',
    botOutput: 'Triggered immediate WhatsApp Missed-Call recovery workflow within 4 seconds: sent polite greeting, catalog link wa.me/c/94771234567, and offered 24/7 AI chat booking.',
    status: 'resolved',
    tokensUsed: 75,
    latencyMs: 180
  }
];

