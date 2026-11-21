/**
 * The AI voice agent (runs in the voice process). Answers a WhatsApp call that routing gave it,
 * runs a Live or Studio session over the call audio, and afterwards saves the transcript and a
 * summary, sends the WhatsApp booking confirmation and asks staff to call back when needed.
 *
 * The same session code runs browser test calls from the admin console (`dryRun`: nothing saved).
 */
import { Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { maskPhone } from '@smart-reply/shared';
import { env } from '../config';
import { InboxService } from '../core/inbox.service';
import { MessagingService, windowOpen } from '../core/messaging.service';
import { PushService } from '../core/push.service';
import type { Db } from '../db/client';
import { aiAddons, calls, companies, contacts, presence, users } from '../db/schema';
import { InjectDb } from '../infra/db';
import { logger } from '../infra/logger';
import { Platform, WhatsappAccounts } from '../meta/platform';
import { AiEngine } from '../modules/ai/ai.engine';
import { loadSettings, usageMonth } from '../modules/ai/ai.presenters';
import { CallsCore } from '../modules/calls/calls.core';
import { CallsEngine } from '../modules/calls/calls.engine';
import { VoiceBus, VoiceControl, VoiceTestResult } from './bus';
import { Gemini } from './gemini';
import { LiveSession } from './live-session';
import { CallMedia, MediaOptions } from './media';
import { DEFAULT_GREETING, SORRY_LINE, buildVoicePrompt, fillGreeting } from './prompt';
import { AgentSession, EndReason, SessionDeps, TranscriptLine } from './session';
import { FAST_MODEL, StudioSession, synthAll } from './studio-session';
import { ToolContext, VoiceTools, toolDeclarations } from './tools';

type AiSettingsRow = Awaited<ReturnType<typeof loadSettings>>;

export const DEFAULT_BRAIN_MODEL = 'gemini-3.5-flash-lite';
const GREETING_WAIT_MS = 4000;
/** A call older than this is not answered any more (Meta gives up on ringing calls). */
const STALE_MS = 75_000;

interface Prepared {
  settings: AiSettingsRow;
  gemini: Gemini;
  mode: 'live' | 'studio';
  systemPrompt: string;
  greeting: string;
  sorryLine: string;
  style: string;
  toolCtx: ToolContext;
  companyName: string;
}

interface Running {
  key: string;
  media: CallMedia;
  session: AgentSession | null;
  finish: (reason: EndReason) => Promise<void>;
}

/** Empty model or voice names fall back to the defaults. */
export function withVoiceDefaults<T extends Pick<AiSettingsRow, 'voiceLiveModel' | 'voiceLiveVoice' | 'voiceTtsModel' | 'voiceTtsVoice' | 'voiceModel'>>(s: T): T {
  return {
    ...s,
    voiceLiveModel: s.voiceLiveModel.trim() || 'gemini-3.8-live',
    voiceLiveVoice: s.voiceLiveVoice.trim() || 'Kore',
    voiceTtsModel: s.voiceTtsModel.trim() || 'gemini-3.8-flash-tts',
    voiceTtsVoice: s.voiceTtsVoice.trim() || 'Hali',
    voiceModel:
      s.voiceModel.trim() && !s.voiceModel.includes('-tts') && !s.voiceModel.includes('-live')
        ? s.voiceModel.trim()
        : DEFAULT_BRAIN_MODEL
  };
}

export function speakingStyle(lang: AiSettingsRow['voiceLanguage'], custom: string, speed: number): string {
  const base =
    custom.trim() ||
    (lang === 'english'
      ? 'Say this in a warm, calm and natural voice, like a friendly customer-service agent on a phone call:'
      : 'Say this in natural, warm, everyday Sri Lankan Sinhala, like a friendly call-centre agent on a phone call:');
  const pace = speed >= 1.08 ? ' Speak a little quickly.' : speed <= 0.92 ? ' Speak a little slowly and clearly.' : '';
  return pace ? `${base.replace(/:$/, '.')}${pace}` : base;
}

@Injectable()
export class VoiceAgent {
  private readonly running = new Map<string, Running>();

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly platform: Platform,
    private readonly whatsapp: WhatsappAccounts,
    private readonly core: CallsCore,
    private readonly engine: CallsEngine,
    private readonly ai: AiEngine,
    private readonly inbox: InboxService,
    private readonly messaging: MessagingService,
    private readonly push: PushService,
    private readonly bus: VoiceBus
  ) {}

  get active(): number {
    return this.running.size;
  }

  private mediaOptions(): MediaOptions {
    return {
      publicIp: env.VOICE_PUBLIC_IP || undefined,
      portRange: [env.VOICE_PORT_MIN, env.VOICE_PORT_MAX]
    };
  }

  /** Control messages from the API/worker. */
  onControl(msg: VoiceControl): void {
    const key = msg.callId ? `call:${msg.callId}` : msg.testId ? `test:${msg.testId}` : null;
    const r = key ? this.running.get(key) : undefined;
    if (r && msg.action === 'hangup') void r.finish('caller_hung_up');
  }

  /** Stop every call (process shutdown). */
  async stopAll(): Promise<void> {
    await Promise.all([...this.running.values()].map(r => r.finish('stopped')));
  }

  /* ───────── Setup ───────── */

  private async prepare(companyId: string, contact: { name: string } | null, opts: { dryRun: boolean; contactId: string | null; callId: string | null; mode: 'live' | 'studio' | null }): Promise<Prepared> {
    const p = await this.platform.get();
    if (!p.ai.geminiApiKey) throw new Error('No Gemini API key is set');
    const settings = withVoiceDefaults(await loadSettings(this.db, companyId));
    const [company] = await this.db.select({ name: companies.name, timezone: companies.timezone }).from(companies).where(eq(companies.id, companyId)).limit(1);
    const st = await this.core.settings(companyId);
    const timezone = st.hours.timezone || company?.timezone || 'Asia/Colombo';
    const services = settings.voiceServices
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 40);
    const mode = opts.mode ?? settings.voiceMode;
    const companyName = company?.name ?? 'our business';
    const persona = settings.personaName || 'Assistant';
    const greeting = fillGreeting(settings.voiceGreeting.trim() || DEFAULT_GREETING[settings.voiceLanguage], companyName, persona);
    const booking = {
      enabled: settings.voiceBookingEnabled,
      services,
      slotMinutes: settings.voiceSlotMinutes,
      capacity: settings.voiceSlotCapacity,
      daysAhead: settings.voiceBookingDaysAhead
    };
    const systemPrompt = buildVoicePrompt({
      companyName,
      personaName: persona,
      language: settings.voiceLanguage,
      platformPrompt: p.ai.defaultPrompt,
      companyPrompt: settings.systemPrompt,
      knowledge: await this.ai.knowledgeContext(companyId),
      timezone,
      hours: st.hours,
      greeting,
      callerName: contact?.name ?? '',
      booking,
      mode
    });
    return {
      settings,
      gemini: new Gemini(p.ai.geminiApiKey, env.GEMINI_API_URL),
      mode,
      systemPrompt,
      greeting,
      sorryLine: SORRY_LINE[settings.voiceLanguage],
      style: speakingStyle(settings.voiceLanguage, settings.voiceStyle, settings.voiceSpeed),
      companyName,
      toolCtx: { companyId, contactId: opts.contactId, callId: opts.callId, timezone, hours: st.hours, booking, dryRun: opts.dryRun }
    };
  }

  /* ───────── Real WhatsApp calls ───────── */

  async answerCall(callId: string): Promise<void> {
    const [row] = await this.db.select().from(calls).where(eq(calls.id, callId)).limit(1);
    if (!row || row.outcome !== 'ringing' || !row.handledByAi || !row.sdpOffer || !row.waCallId) return;
    if (Date.now() - row.startedAt.getTime() > STALE_MS) return this.engine.aiUnavailable(callId, 'too_late');
    if (this.running.size >= env.VOICE_MAX_CALLS) return this.engine.aiUnavailable(callId, 'busy');
    const wa = await this.whatsapp.find(row.companyId);
    if (!wa) return this.engine.aiUnavailable(callId, 'no_whatsapp');
    const [contact] = await this.db.select().from(contacts).where(eq(contacts.id, row.contactId)).limit(1);
    if (!contact) return this.engine.aiUnavailable(callId, 'no_contact');

    let prep: Prepared;
    try {
      prep = await this.prepare(row.companyId, { name: contact.name || contact.profileName }, { dryRun: false, contactId: contact.id, callId: row.id, mode: null });
    } catch (err) {
      return this.engine.aiUnavailable(callId, err instanceof Error ? err.message : 'setup_failed');
    }
    // Make the greeting while we answer, so the caller hears it as soon as audio connects.
    const greetingAudio = prep.mode === 'studio' ? this.greetingAudio(prep) : Promise.resolve(null);

    let media: CallMedia;
    let sdpAnswer: string;
    try {
      ({ media, sdpAnswer } = await CallMedia.answer(row.sdpOffer, this.mediaOptions()));
    } catch (err) {
      logger.warn({ err, callId }, 'Voice agent could not create call audio');
      return this.engine.aiUnavailable(callId, 'media_failed');
    }

    const [claimed] = await this.db
      .update(calls)
      .set({ outcome: 'ongoing', answeredAt: new Date(), ringingUserIds: [] })
      .where(and(eq(calls.id, row.id), eq(calls.outcome, 'ringing'), eq(calls.handledByAi, true)))
      .returning();
    if (!claimed) {
      await media.close();
      return;
    }
    const session = { sdp_type: 'answer', sdp: sdpAnswer };
    try {
      await wa.graph.callAction(wa.phoneNumberId, { call_id: row.waCallId, action: 'pre_accept', session });
      await wa.graph.callAction(wa.phoneNumberId, { call_id: row.waCallId, action: 'accept', session, biz_opaque_callback_data: row.id });
    } catch (err) {
      logger.warn({ err, callId }, 'Meta did not accept the AI answer');
      await media.close();
      const [failed] = await this.db.update(calls).set({ outcome: 'failed', endedAt: new Date() }).where(eq(calls.id, row.id)).returning();
      await this.core.event(row.companyId, row.id, 'ai_answer_failed', null);
      await this.core.emitUpdated(failed);
      return;
    }
    await this.core.event(row.companyId, row.id, 'ai_answered', null, { mode: prep.mode });
    await this.core.emitUpdated(claimed);
    logger.info({ callId, mode: prep.mode, from: maskPhone(contact.waId ?? '') }, 'AI voice agent answered a call');

    void this.run(`call:${row.id}`, prep, media, await withTimeout(greetingAudio, GREETING_WAIT_MS), async (reason, transcript, tools, seconds) => {
      await this.finishCall(row.id, prep, reason, transcript, tools, seconds);
    });
  }

  private async greetingAudio(prep: Prepared): Promise<{ pcm: Int16Array; rate: number }[] | null> {
    try {
      return await synthAll(prep.gemini, prep.settings.voiceTtsModel, prep.settings.voiceTtsVoice, prep.style, prep.greeting);
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : err }, 'Greeting speech failed');
      return null;
    }
  }

  /* ───────── Session runner (calls and tests) ───────── */

  private async run(
    key: string,
    prep: Prepared,
    media: CallMedia,
    greetingAudio: { pcm: Int16Array; rate: number }[] | null,
    after: (reason: EndReason, transcript: TranscriptLine[], tools: VoiceTools, seconds: number) => Promise<void>
  ): Promise<void> {
    const transcript: TranscriptLine[] = [];
    const tools = new VoiceTools(this.db, prep.toolCtx);
    const started = Date.now();
    let finished = false;
    const timers: NodeJS.Timeout[] = [];
    const entry: Running = { key, media, session: null, finish: async () => undefined };
    const finish = async (reason: EndReason) => {
      if (finished) return;
      finished = true;
      for (const t of timers) clearTimeout(t);
      entry.session?.close();
      await media.close();
      this.running.delete(key);
      const seconds = Math.round((Date.now() - started) / 1000);
      logger.info({ key, reason, seconds, turns: transcript.length }, 'AI voice session ended');
      try {
        await after(reason, transcript, tools, seconds);
      } catch (err) {
        logger.error({ err, key }, 'After-call work failed');
      }
    };
    entry.finish = finish;
    this.running.set(key, entry);
    media.onClose(() => void finish('media_closed'));

    try {
      await media.connected(15_000);
    } catch {
      await finish('media_closed');
      return;
    }

    const deps: SessionDeps = {
      media,
      gemini: prep.gemini,
      tools,
      declarations: toolDeclarations(prep.toolCtx.booking.enabled),
      systemPrompt: prep.systemPrompt,
      greeting: prep.greeting,
      sorryLine: prep.sorryLine,
      transcript,
      onEnd: reason => void finish(reason),
      log: (msg, data) => logger.info({ key, ...data }, msg)
    };
    const studio = () =>
      new StudioSession(deps, {
        brainModel:
          prep.settings.voiceModel.trim() && !prep.settings.voiceModel.includes('-tts')
            ? prep.settings.voiceModel.trim()
            : DEFAULT_BRAIN_MODEL,
        ttsModel: prep.settings.voiceTtsModel,
        voice: prep.settings.voiceTtsVoice,
        style: prep.style,
        greetingAudio
      });
    let session: AgentSession = prep.mode === 'live' ? new LiveSession(deps, { model: prep.settings.voiceLiveModel, voice: prep.settings.voiceLiveVoice }) : studio();
    entry.session = session;
    try {
      await session.start();
    } catch (err) {
      logger.warn({ key, err: err instanceof Error ? err.message : err }, `${prep.mode} session failed to start`);
      session.close();
      if (prep.mode === 'live') {
        // Live failed (model, key or region): carry on with Studio so the caller is not left in silence.
        session = studio();
        entry.session = session;
        try {
          await session.start();
        } catch {
          await finish('ai_error');
          return;
        }
      } else {
        await finish('ai_error');
        return;
      }
    }
    const max = prep.settings.voiceMaxCallSeconds * 1000;
    timers.push(setTimeout(() => entry.session?.wrapUp(), max));
    timers.push(setTimeout(() => void finish('max_duration'), max + 30_000));
  }

  /* ───────── After a real call ───────── */

  private async finishCall(callId: string, prep: Prepared, reason: EndReason, transcript: TranscriptLine[], tools: VoiceTools, seconds: number): Promise<void> {
    const [row] = await this.db.select().from(calls).where(eq(calls.id, callId)).limit(1);
    if (!row) return;
    if (reason !== 'caller_hung_up' && row.waCallId) {
      const wa = await this.whatsapp.find(row.companyId);
      try {
        await wa?.graph.callAction(wa.phoneNumberId, { call_id: row.waCallId, action: 'terminate' });
      } catch (err) {
        logger.warn({ err, callId }, 'Terminate on WhatsApp failed');
      }
    }
    if (row.outcome === 'ongoing') {
      const now = new Date();
      const dur = row.answeredAt ? Math.round((now.getTime() - row.answeredAt.getTime()) / 1000) : seconds;
      const [u] = await this.db
        .update(calls)
        .set({ outcome: 'answered', endedAt: now, durationSeconds: dur })
        .where(and(eq(calls.id, row.id), eq(calls.outcome, 'ongoing')))
        .returning();
      if (u) await this.engine.afterAnsweredEnd(u, dur);
    }
    await this.core.event(row.companyId, row.id, 'ai_ended', null, { reason, seconds, bookings: tools.results.bookings.length });

    // Usage for the add-on (minutes are shown to LUMI AI and the manager).
    const month = usageMonth();
    await this.db
      .update(aiAddons)
      .set({
        usageMonth: month,
        voiceSecondsThisMonth: sql`case when ${aiAddons.usageMonth} = ${month} then ${aiAddons.voiceSecondsThisMonth} + ${seconds} else ${seconds} end`,
        repliesThisMonth: sql`case when ${aiAddons.usageMonth} = ${month} then ${aiAddons.repliesThisMonth} else 0 end`,
        tokensThisMonth: sql`case when ${aiAddons.usageMonth} = ${month} then ${aiAddons.tokensThisMonth} else 0 end`,
        costMinorThisMonth: sql`case when ${aiAddons.usageMonth} = ${month} then ${aiAddons.costMinorThisMonth} else 0 end`
      })
      .where(eq(aiAddons.companyId, row.companyId));

    const summary = await this.summarise(prep, transcript, tools);
    const [saved] = await this.db
      .update(calls)
      .set({ transcript: transcript as unknown as Record<string, unknown>, aiSummary: summary })
      .where(eq(calls.id, row.id))
      .returning();

    const [contact] = await this.db.select().from(contacts).where(eq(contacts.id, row.contactId)).limit(1);
    if (contact) {
      const conv = await this.inbox.ensureConversation(row.companyId, contact.id);
      if (summary) {
        const note = await this.inbox.addInternal(row.companyId, conv.id, 'note', `🤖 AI call summary\n${summary}`, null, undefined, true);
        await this.inbox.emitMessage(row.companyId, note.id);
      }
      for (const b of tools.results.bookings) {
        await this.core.systemLine(row.companyId, contact.id, `Booking made by the AI agent · ${b.service ? `${b.service} · ` : ''}${b.when}`);
      }
      if (tools.results.bookings.length && prep.settings.voiceConfirmOnWhatsapp && !contact.blockedAt) {
        const fresh = await this.inbox.ensureConversation(row.companyId, contact.id);
        if (windowOpen(fresh)) {
          try {
            await this.messaging.sendFreeForm(row.companyId, fresh, contact, { text: confirmationText(prep, tools), fileIds: [] }, { userId: null, kind: 'bot' });
          } catch (err) {
            logger.warn({ err, callId }, 'Booking confirmation not sent');
          }
        } else {
          await this.core.systemLine(row.companyId, contact.id, 'Booking confirmation not sent: the WhatsApp 24-hour window is closed');
        }
      }
      if (tools.results.callback) await this.askForCallback(row.companyId, contact, tools.results.callback, row.id);
      else if (summary) await this.remindAfterCall(row.companyId, contact, conv.id, summary);
    }
    if (saved) await this.core.emitUpdated(saved);
  }

  private async askForCallback(companyId: string, contact: typeof contacts.$inferSelect, cb: { reason: string; urgent: boolean }, callId: string): Promise<void> {
    await this.core.systemLine(companyId, contact.id, `${cb.urgent ? 'Urgent: ' : ''}the caller asked for a call back · ${cb.reason}`);
    const managers = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.companyId, companyId), eq(users.role, 'manager'), eq(users.status, 'active')));
    const to = new Set(managers.map(m => m.id));
    if (contact.ownerUserId) to.add(contact.ownerUserId);
    const name = contact.name || contact.profileName || 'A caller';
    await this.push.notify([...to], `${cb.urgent ? 'Urgent call back' : 'Call back'}: ${name}`, cb.reason, { kind: 'call', callId });
  }

  /** A separate reminder after the AI answered a call: to the owner, or the people on duty, else the managers. */
  private async remindAfterCall(companyId: string, contact: typeof contacts.$inferSelect, conversationId: string, summary: string): Promise<void> {
    const to = new Set<string>();
    if (contact.ownerUserId) to.add(contact.ownerUserId);
    else {
      const onDuty = await this.db
        .select({ id: users.id })
        .from(presence)
        .innerJoin(users, eq(users.id, presence.userId))
        .where(and(eq(presence.companyId, companyId), inArray(presence.status, ['available', 'oncall']), eq(users.status, 'active')));
      onDuty.forEach(u => to.add(u.id));
    }
    if (to.size === 0) {
      const managers = await this.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.companyId, companyId), eq(users.role, 'manager'), eq(users.status, 'active')));
      managers.forEach(m => to.add(m.id));
    }
    const next = /What you should do:\s*(.+)/i.exec(summary)?.[1]?.trim() || summary;
    const name = contact.name || contact.profileName || 'A caller';
    await this.push.notify([...to], `AI answered a call from ${name}`, next, { kind: 'ai', conversationId });
  }

  private async summarise(prep: Prepared, transcript: TranscriptLine[], tools: VoiceTools): Promise<string | null> {
    if (!transcript.some(l => l.role === 'caller')) return tools.results.bookings.length ? `Booked: ${tools.results.bookings.map(b => b.when).join('; ')}` : null;
    const text = transcript.map(l => `${l.role === 'caller' ? 'Caller' : 'Agent'}: ${l.text}`).join('\n');
    const facts = [
      ...tools.results.bookings.map(b => `Booking made: ${b.service || 'appointment'}, ${b.when}`),
      ...(tools.results.callback ? [`Call back requested: ${tools.results.callback.reason}`] : [])
    ].join('\n');
    try {
      const out = await prep.gemini.text(
        FAST_MODEL,
        {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text:
                    'Write a handover note for the staff about this phone call between a customer and our AI agent, in simple English, ' +
                    'as exactly two lines and plain text only:\n' +
                    'What the AI did: <one or two sentences: what the caller wanted and what the AI told or did for them>\n' +
                    'What you should do: <one or two sentences: exactly what the staff member should do now for this customer, or "Nothing"> \n\n' +
                    `${facts ? `${facts}\n\n` : ''}${text.slice(0, 20_000)}`
                }
              ]
            }
          ],
          generationConfig: { temperature: 0.2, maxOutputTokens: 300 }
        },
        AbortSignal.timeout(30_000)
      );
      return out.slice(0, 2000) || null;
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : err }, 'Call summary failed');
      return facts || null;
    }
  }

  /* ───────── Browser test calls (admin console) ───────── */

  async testCall(job: { testId: string; companyId: string; sdpOffer: string; mode: 'live' | 'studio' | null }): Promise<void> {
    const result: VoiceTestResult = { status: 'connecting', transcript: [], bookings: [], callback: null };
    let prep: Prepared;
    let media: CallMedia;
    try {
      if (this.running.size >= env.VOICE_MAX_CALLS) throw new Error('The voice server is busy. Try again in a minute.');
      prep = await this.prepare(job.companyId, null, { dryRun: true, contactId: null, callId: null, mode: job.mode });
      result.mode = prep.mode;
      const greeting = prep.mode === 'studio' ? this.greetingAudio(prep) : Promise.resolve(null);
      const answered = await CallMedia.answer(job.sdpOffer, this.mediaOptions());
      media = answered.media;
      await this.bus.testAnswer(job.testId, { sdpAnswer: answered.sdpAnswer });
      await this.bus.saveTest(job.testId, job.companyId, result);
      const audio = await withTimeout(greeting, GREETING_WAIT_MS);
      result.status = 'live';
      await this.bus.saveTest(job.testId, job.companyId, result);
      void this.run(`test:${job.testId}`, prep, media, audio, async (reason, transcript, tools, seconds) => {
        await this.bus.saveTest(job.testId, job.companyId, {
          status: 'ended',
          mode: prep.mode,
          endReason: reason,
          seconds,
          transcript,
          bookings: tools.results.bookings.map(b => ({ service: b.service, when: b.when })),
          callback: tools.results.callback?.reason ?? null
        });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'The test call failed';
      await this.bus.testAnswer(job.testId, { error: msg });
      await this.bus.saveTest(job.testId, job.companyId, { ...result, status: 'failed', error: msg });
    }
  }
}

function confirmationText(prep: Prepared, tools: VoiceTools): string {
  const lines = tools.results.bookings.map(b => `• ${b.service ? `${b.service} — ` : ''}${b.when}`).join('\n');
  if (prep.settings.voiceLanguage === 'english') {
    return `✅ Your booking with ${prep.companyName} is confirmed:\n${lines}\n\nReply here if you need to change it.`;
  }
  return `✅ ${prep.companyName} සමඟ ඔබේ booking එක තහවුරුයි:\n${lines}\n\nවෙනස් කරන්න ඕන නම් මෙතනට reply කරන්න.\n\nYour booking is confirmed. Reply here to change it.`;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let t: NodeJS.Timeout | undefined;
  const timeout = new Promise<null>(resolve => {
    t = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(t);
  }
}
