/**
 * What the voice agent can do during a call: read the caller's details, save their name and a
 * note, check free appointment times, book or cancel, ask staff to call back, and end the call.
 * Every action is scoped to the call's company and caller. A test call (`dryRun`) never writes.
 */
import { and, count, eq, gte, lt, ne } from 'drizzle-orm';
import type { CallHours } from '@smart-reply/shared';
import type { Db } from '../db/client';
import { bookings, contacts } from '../db/schema';
import { DAYS, localParts } from '../core/hours';
import type { FunctionDeclaration } from './gemini';

export { DAYS };

export interface ToolContext {
  companyId: string;
  contactId: string | null;
  callId: string | null;
  timezone: string;
  hours: CallHours;
  booking: { enabled: boolean; services: string[]; slotMinutes: number; capacity: number; daysAhead: number };
  dryRun: boolean;
}

export interface MadeBooking {
  id: string;
  service: string;
  startsAt: Date;
  when: string;
  customerName: string;
}

export interface ToolResults {
  bookings: MadeBooking[];
  cancelled: string[];
  callback: { reason: string; urgent: boolean } | null;
  endRequested: boolean;
  savedName: string | null;
}

/** Hours used for bookings when the company has no business hours set. */
const DEFAULT_OPEN = '0900';
const DEFAULT_CLOSE = '1700';

/** UTC instant for a wall-clock time in a time zone. */
export function zonedTime(date: string, hhmm: string, timeZone: string): Date {
  const [y, mo, d] = date.split('-').map(Number);
  const h = Number(hhmm.slice(0, 2));
  const mi = Number(hhmm.slice(2, 4));
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offset = (at: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        .formatToParts(new Date(at))
        .map(x => [x.type, x.value])
    );
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - at;
  };
  let t = guess - offset(guess);
  t = guess - offset(t);
  return new Date(t);
}

/** "Tuesday 25 November, 10:30 AM" in the company's time zone. */
export function spokenTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', hour12: true }).format(at);
}

const toHhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}${String(min % 60).padStart(2, '0')}`;
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2, 4));
const pretty = (hhmm: string) => `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}`;

/** Normalise "10:30", "1030", "10.30", "9" to "1030"/"0900"; null when not a time. */
export function parseTime(v: unknown): string | null {
  const m = /^(\d{1,2})(?:[:.]?(\d{2}))?$/.exec(String(v ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2] ?? '0');
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}${String(mi).padStart(2, '0')}`;
}

export function parseDate(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

/** Opening windows (HHMM) for a local date, from the company's hours. */
export function openWindows(hours: CallHours, date: string): { open: string; close: string }[] {
  if (!hours.enabled) return [{ open: DEFAULT_OPEN, close: DEFAULT_CLOSE }];
  const holiday = hours.holidays.find(h => h.date === date);
  if (holiday) return holiday.open && holiday.close ? [{ open: holiday.open, close: holiday.close }] : [];
  const day = DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
  return hours.weekly.filter(w => w.day === day).map(w => ({ open: w.open, close: w.close }));
}

/** Slot start times (HHMM) for a date, before taking bookings into account. */
export function slotStarts(hours: CallHours, date: string, slotMinutes: number): string[] {
  const out: string[] = [];
  for (const w of openWindows(hours, date)) {
    for (let m = toMin(w.open); m + slotMinutes <= toMin(w.close); m += slotMinutes) out.push(toHhmm(m));
  }
  return [...new Set(out)].sort();
}

export function toolDeclarations(bookingEnabled: boolean): FunctionDeclaration[] {
  const list: FunctionDeclaration[] = [
    {
      name: 'get_customer_info',
      description: "The caller's saved name, notes and upcoming bookings. Call it early in the call."
    },
    {
      name: 'save_customer_details',
      description: "Save the caller's name and/or a short note about them or what they need.",
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: "The caller's name as they said it" },
          note: { type: 'string', description: 'A short note in English, e.g. what they asked about' }
        }
      }
    },
    {
      name: 'request_staff_callback',
      description:
        'Ask a staff member to call the customer back. Use it when the caller wants a person, has a complaint, wants to negotiate, or you cannot answer.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Why, in English, one sentence' },
          urgent: { type: 'boolean', description: 'True if it cannot wait' }
        },
        required: ['reason']
      }
    },
    {
      name: 'end_call',
      description: 'End the phone call. Use it only after you have said goodbye and the caller has nothing more.'
    }
  ];
  if (bookingEnabled) {
    list.push(
      {
        name: 'check_availability',
        description: 'Free appointment times on a date. Always check before offering times.',
        parameters: {
          type: 'object',
          properties: { date: { type: 'string', description: 'Date as YYYY-MM-DD' } },
          required: ['date']
        }
      },
      {
        name: 'create_booking',
        description: 'Book an appointment after the caller has agreed the date, time and service. Repeat the details back first.',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'YYYY-MM-DD' },
            time: { type: 'string', description: '24-hour HH:MM' },
            service: { type: 'string', description: 'One of the services offered' },
            customer_name: { type: 'string' },
            note: { type: 'string', description: 'Anything staff should know, in English' }
          },
          required: ['date', 'time']
        }
      },
      {
        name: 'cancel_booking',
        description: "Cancel one of the caller's upcoming bookings (ids come from get_customer_info).",
        parameters: { type: 'object', properties: { booking_id: { type: 'string' } }, required: ['booking_id'] }
      }
    );
  }
  return list;
}

export class VoiceTools {
  readonly results: ToolResults = { bookings: [], cancelled: [], callback: null, endRequested: false, savedName: null };

  constructor(
    private readonly db: Db,
    private readonly ctx: ToolContext
  ) {}

  /** Run one tool. Errors come back as `{ error }` so the model can explain them to the caller. */
  async run(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    try {
      switch (name) {
        case 'get_customer_info':
          return await this.customerInfo();
        case 'save_customer_details':
          return await this.saveDetails(args);
        case 'check_availability':
          return await this.availability(args);
        case 'create_booking':
          return await this.book(args);
        case 'cancel_booking':
          return await this.cancel(args);
        case 'request_staff_callback':
          this.results.callback = { reason: String(args.reason ?? '').slice(0, 300) || 'The caller asked for a person', urgent: args.urgent === true };
          return { ok: true, message: 'A staff member will call the customer back.' };
        case 'end_call':
          this.results.endRequested = true;
          return { ok: true };
        default:
          return { error: `Unknown tool ${name}` };
      }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Something went wrong' };
    }
  }

  private async customerInfo(): Promise<Record<string, unknown>> {
    if (!this.ctx.contactId) return { name: '', notes: '', upcomingBookings: [], test: true };
    const [c] = await this.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.id, this.ctx.contactId), eq(contacts.companyId, this.ctx.companyId)))
      .limit(1);
    if (!c) return { error: 'Customer not found' };
    const upcoming = await this.db
      .select()
      .from(bookings)
      .where(and(eq(bookings.companyId, this.ctx.companyId), eq(bookings.contactId, c.id), eq(bookings.status, 'booked'), gte(bookings.startsAt, new Date())))
      .orderBy(bookings.startsAt)
      .limit(5);
    return {
      name: c.name || c.profileName,
      notes: c.notes.slice(-600),
      upcomingBookings: upcoming.map(b => ({ booking_id: b.id, service: b.service, when: spokenTime(b.startsAt, this.ctx.timezone) }))
    };
  }

  private async saveDetails(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const name = String(args.name ?? '').trim().slice(0, 80);
    const note = String(args.note ?? '').trim().slice(0, 500);
    if (name) this.results.savedName = name;
    if (this.ctx.dryRun || !this.ctx.contactId) return { ok: true };
    const [c] = await this.db
      .select({ notes: contacts.notes })
      .from(contacts)
      .where(and(eq(contacts.id, this.ctx.contactId), eq(contacts.companyId, this.ctx.companyId)))
      .limit(1);
    if (!c) return { error: 'Customer not found' };
    const day = localParts(new Date(), this.ctx.timezone).date;
    await this.db
      .update(contacts)
      .set({
        ...(name ? { name } : {}),
        ...(note ? { notes: `${c.notes ? `${c.notes}\n` : ''}AI call ${day}: ${note}`.slice(-4000) } : {})
      })
      .where(and(eq(contacts.id, this.ctx.contactId), eq(contacts.companyId, this.ctx.companyId)));
    return { ok: true };
  }

  private bookingCheck(date: string): string | null {
    if (!this.ctx.booking.enabled) return 'Bookings are not taken by phone.';
    const today = localParts(new Date(), this.ctx.timezone).date;
    if (date < today) return 'That date has passed.';
    const last = new Date(Date.now() + this.ctx.booking.daysAhead * 86_400_000);
    if (date > localParts(last, this.ctx.timezone).date) return `Bookings can only be made up to ${this.ctx.booking.daysAhead} days ahead.`;
    return null;
  }

  /** Free slots on a date: inside opening hours, in the future, and under capacity. */
  async freeSlots(date: string): Promise<string[]> {
    const { slotMinutes, capacity } = this.ctx.booking;
    const starts = slotStarts(this.ctx.hours, date, slotMinutes);
    if (!starts.length) return [];
    const dayStart = zonedTime(date, '0000', this.ctx.timezone);
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const taken = await this.db
      .select({ startsAt: bookings.startsAt, n: count() })
      .from(bookings)
      .where(and(eq(bookings.companyId, this.ctx.companyId), ne(bookings.status, 'cancelled'), gte(bookings.startsAt, dayStart), lt(bookings.startsAt, dayEnd)))
      .groupBy(bookings.startsAt);
    const used = new Map(taken.map(t => [t.startsAt.getTime(), Number(t.n)]));
    const soon = Date.now() + 15 * 60_000;
    return starts.filter(s => {
      const at = zonedTime(date, s, this.ctx.timezone).getTime();
      return at > soon && (used.get(at) ?? 0) < capacity;
    });
  }

  private async availability(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const date = parseDate(args.date);
    if (!date) return { error: 'Give the date as YYYY-MM-DD.' };
    const problem = this.bookingCheck(date);
    if (problem) return { error: problem };
    const free = await this.freeSlots(date);
    const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00Z`));
    if (!free.length) return { date, day, freeTimes: [], message: 'No free times that day (closed or fully booked). Offer another day.' };
    return { date, day, freeTimes: free.map(pretty) };
  }

  private async book(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const date = parseDate(args.date);
    const time = parseTime(args.time);
    if (!date || !time) return { error: 'Give the date as YYYY-MM-DD and the time as HH:MM.' };
    const problem = this.bookingCheck(date);
    if (problem) return { error: problem };
    const free = await this.freeSlots(date);
    if (!free.includes(time)) {
      return { error: 'That time is not free.', freeTimes: free.map(pretty) };
    }
    const services = this.ctx.booking.services;
    let service = String(args.service ?? '').trim().slice(0, 120);
    if (services.length) {
      const match = services.find(s => s.toLowerCase() === service.toLowerCase()) ?? services.find(s => service && s.toLowerCase().includes(service.toLowerCase()));
      if (!match && services.length > 1) return { error: `Ask which service they want: ${services.join(', ')}.` };
      service = match ?? services[0];
    }
    const customerName = String(args.customer_name ?? '').trim().slice(0, 80) || this.results.savedName || '';
    const startsAt = zonedTime(date, time, this.ctx.timezone);
    const when = spokenTime(startsAt, this.ctx.timezone);
    if (this.ctx.dryRun || !this.ctx.contactId) {
      const made = { id: `test-${this.results.bookings.length + 1}`, service, startsAt, when, customerName };
      this.results.bookings.push(made);
      return { ok: true, booking_id: made.id, when, service, test: true };
    }
    const [row] = await this.db
      .insert(bookings)
      .values({
        companyId: this.ctx.companyId,
        contactId: this.ctx.contactId,
        callId: this.ctx.callId,
        service,
        startsAt,
        durationMinutes: this.ctx.booking.slotMinutes,
        customerName,
        note: String(args.note ?? '').trim().slice(0, 500),
        createdBy: 'ai'
      })
      .returning();
    this.results.bookings.push({ id: row.id, service, startsAt, when, customerName });
    return { ok: true, booking_id: row.id, when, service };
  }

  private async cancel(args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const id = String(args.booking_id ?? '');
    if (this.ctx.dryRun || !this.ctx.contactId) return { ok: true, test: true };
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: 'Unknown booking.' };
    const [row] = await this.db
      .update(bookings)
      .set({ status: 'cancelled' })
      .where(and(eq(bookings.id, id), eq(bookings.companyId, this.ctx.companyId), eq(bookings.contactId, this.ctx.contactId), eq(bookings.status, 'booked')))
      .returning();
    if (!row) return { error: 'That booking was not found for this caller.' };
    this.results.cancelled.push(row.id);
    return { ok: true, cancelled: spokenTime(row.startsAt, this.ctx.timezone) };
  }
}
