/** The voice agent's instructions for one call. */
import type { CallHours } from '@smart-reply/shared';
import { DAYS } from './tools';

export interface PromptInput {
  companyName: string;
  personaName: string;
  language: 'trilingual' | 'sinhala' | 'english';
  platformPrompt: string;
  companyPrompt: string;
  knowledge: string[];
  timezone: string;
  hours: CallHours;
  greeting: string;
  callerName: string;
  booking: { enabled: boolean; services: string[]; slotMinutes: number; daysAhead: number };
  /** Live mode speaks on its own; Studio mode's replies are read out by a separate voice. */
  mode: 'live' | 'studio';
  now?: Date;
}

export const DEFAULT_GREETING: Record<PromptInput['language'], string> = {
  sinhala: 'ආයුබෝවන්! {company} වෙත ඔබව සාදරයෙන් පිළිගනිමු. මම {persona}. අද මට ඔබට කොහොමද උදව් කරන්න පුළුවන්?',
  english: 'Hello! Thank you for calling {company}. This is {persona}. How can I help you today?',
  trilingual: 'ආයුබෝවන්! {company} වෙත ඔබව සාදරයෙන් පිළිගනිමු. මම {persona}. අද මට ඔබට කොහොමද උදව් කරන්න පුළුවන්?'
};

export const SORRY_LINE: Record<PromptInput['language'], string> = {
  sinhala: 'සමාවෙන්න, මට දැන් පොඩි ගැටලුවක් තියෙනවා. අපේ කණ්ඩායමේ කෙනෙක් ඉක්මනින්ම ඔබට කතා කරයි. ස්තූතියි!',
  english: 'Sorry, I am having a problem right now. One of our team will call you back shortly. Thank you!',
  trilingual: 'සමාවෙන්න, මට දැන් පොඩි ගැටලුවක් තියෙනවා. අපේ කණ්ඩායමේ කෙනෙක් ඉක්මනින්ම ඔබට කතා කරයි. ස්තූතියි!'
};

export function fillGreeting(template: string, companyName: string, persona: string): string {
  return template.replace(/\{company\}/g, companyName).replace(/\{persona\}/g, persona);
}

function languageRule(lang: PromptInput['language']): string {
  if (lang === 'english') return 'Speak English.';
  const sinhala =
    'Speak natural, everyday spoken Sri Lankan Sinhala, the way a friendly call-centre agent in Colombo talks — not formal written Sinhala. ' +
    'Common English words people use (booking, appointment, WhatsApp, OK, time slot) are fine. Say numbers, dates and times the way Sri Lankans say them.';
  if (lang === 'sinhala') return `${sinhala} If the caller only speaks English, switch to English.`;
  return `${sinhala} If the caller speaks English or Tamil, answer in their language.`;
}

/** "Monday 09:00–17:00; Tuesday …" for the next week, so the agent can answer "are you open". */
function hoursText(hours: CallHours): string {
  if (!hours.enabled) return 'Opening hours are not set; for bookings assume 09:00–17:00 every day.';
  const days = DAYS.slice(1).concat(DAYS[0]);
  return days
    .map(d => {
      const w = hours.weekly.filter(x => x.day === d);
      return `${d[0]}${d.slice(1).toLowerCase()}: ${w.length ? w.map(x => `${x.open.slice(0, 2)}:${x.open.slice(2)}–${x.close.slice(0, 2)}:${x.close.slice(2)}`).join(', ') : 'closed'}`;
    })
    .join('; ');
}

export function buildVoicePrompt(p: PromptInput): string {
  const now = p.now ?? new Date();
  const today = new Intl.DateTimeFormat('en-GB', { timeZone: p.timezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const isoToday = new Intl.DateTimeFormat('en-CA', { timeZone: p.timezone }).format(now);
  const parts: string[] = [];
  if (p.platformPrompt.trim()) parts.push(p.platformPrompt.trim());
  parts.push(
    `You are “${p.personaName || 'Assistant'}”, answering WhatsApp voice calls for ${p.companyName}. You are an AI assistant; if someone asks, say so honestly.`
  );
  if (p.companyPrompt.trim()) parts.push(`## About the business\n${p.companyPrompt.trim()}`);
  parts.push(`## Language\n${languageRule(p.language)}`);
  parts.push(
    '## How to talk on the phone\n' +
      '- Short, warm, natural sentences. One question at a time. Most replies are one or two sentences.\n' +
      '- No lists, no markdown, no emojis, no web links — everything you write is spoken aloud.\n' +
      '- Listen; do not repeat the greeting. If you did not catch something, politely ask again.\n' +
      '- Only state facts from this prompt, the knowledge below or your tools. Never invent prices, availability or policies.\n' +
      '- If you cannot help, the caller wants a person, is upset, or wants to negotiate: say a team member will call them back, then use request_staff_callback.\n' +
      '- Ask for the caller\'s name if you do not know it and save it with save_customer_details.\n' +
      '- When everything is done, say a short goodbye, then use end_call.' +
      (p.mode === 'studio' ? '\n- Reply with the words to say only.' : '')
  );
  parts.push(`## Now\nToday is ${today} (${p.timezone}); today's date is ${isoToday}. Opening hours: ${hoursText(p.hours)}.`);
  if (p.booking.enabled) {
    parts.push(
      '## Appointments\n' +
        `You can book appointments up to ${p.booking.daysAhead} days ahead; each takes ${p.booking.slotMinutes} minutes.` +
        (p.booking.services.length ? ` Services: ${p.booking.services.join(', ')}.` : '') +
        '\nAlways call check_availability for the day before offering times, and offer two or three times, not the whole list. ' +
        'Before create_booking, repeat the day, time and service and get a yes. After booking, tell them they will get a WhatsApp confirmation.'
    );
  } else {
    parts.push('## Appointments\nYou cannot book appointments on the phone. If the caller wants one, use request_staff_callback.');
  }
  parts.push(
    p.callerName ? `## Caller\nThe caller is probably ${p.callerName} (from their WhatsApp details).` : '## Caller\nThe caller is new or has no saved name.'
  );
  parts.push(...p.knowledge);
  return parts.join('\n\n');
}

/** Split a reply into sentences for faster speech: the first sentence starts playing sooner. */
export function sentences(text: string, min = 30): string[] {
  const raw = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?।؟])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const s of raw) {
    const last = out[out.length - 1];
    if (last !== undefined && last.length < min) out[out.length - 1] = `${last} ${s}`;
    else out.push(s);
  }
  return out;
}
