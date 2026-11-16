/**
 * The paid AI chat bot. Runs in the worker (`ai.reply`) after an inbound message, and in the
 * API for the system admin's simulator. Never logs message text.
 */
import { Injectable, Optional } from '@nestjs/common';
import { and, desc, eq, gt, inArray, ne, sql } from 'drizzle-orm';
import { formatMoney } from '@smart-reply/shared';
import type { AiSimulateResponse, CallHours } from '@smart-reply/shared';
import { AppError } from '../../common/errors';
import { AutomationService } from '../../core/automation.service';
import { isOpen } from '../../core/hours';
import { ContactRow, ConversationRow, InboxService, MessageRow } from '../../core/inbox.service';
import { MessagingService } from '../../core/messaging.service';
import type { Db } from '../../db/client';
import {
  aiAddons,
  aiBotLogs,
  aiTrainingExamples,
  assignmentRules,
  callSettings,
  companies,
  contacts,
  conversations,
  knowledgeDocuments,
  messages,
  presence,
  products,
  users
} from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { logger } from '../../infra/logger';
import { Platform, PlatformSecrets } from '../../meta/platform';
import { loadSettings, usageMonth } from './ai.presenters';
import type { AiSettingsRow } from './ai.presenters';
import { BotAnswer, ChatTurn, ProviderConfig, ProviderError, complete } from './ai.provider';
import { INTENT_RULE, RULE_REASON, matchRule } from './ai.rules';
import type { HandoffRule } from './ai.rules';

const HUMAN_QUIET_MS = 10 * 60_000;
const HISTORY = 15;
const KNOWLEDGE_CAP = 12_000;
const CATALOG_CAP = 4_000;
const EXAMPLES_CAP = 4_000;
const CAPTIONED = new Set(['image', 'video', 'document']);

export interface Decision {
  handoff: boolean;
  reason: string;
}

/** Text the bot can answer: a text message, or the caption of a photo, video or document. */
export function botText(m: Pick<MessageRow, 'type' | 'body'>): string {
  if (m.type === 'text' || CAPTIONED.has(m.type)) return m.body.trim();
  return '';
}

function languageRule(mode: AiSettingsRow['languageMode']): string {
  if (mode === 'sinhala') {
    return 'Reply in Sinhala (සිංහල). If the customer writes Sinhala in English letters (Singlish), reply in Singlish.';
  }
  if (mode === 'english') return 'Reply in English.';
  return (
    'Reply in the customer’s own language: Sinhala (සිංහල), Tamil (தமிழ்) or English. ' +
    'If the customer writes Sinhala in English letters (Singlish), reply in Singlish. Match their script and tone.'
  );
}

@Injectable()
export class AiEngine {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly platform: Platform,
    private readonly inbox: InboxService,
    private readonly messaging: MessagingService,
    // Global in the worker; the API only uses the simulator, which never assigns.
    @Optional() private readonly automation?: AutomationService
  ) {}

  /* ───────── Prompt ───────── */

  providerConfig(p: PlatformSecrets, settings: Pick<AiSettingsRow, 'model'>): ProviderConfig | null {
    const model = settings.model.trim() || p.ai.model.trim();
    if (p.ai.provider === 'none' || !p.ai.apiKey || !model) return null;
    return { provider: p.ai.provider, apiKey: p.ai.apiKey, baseUrl: p.ai.baseUrl, model };
  }

  /** System prompt: platform rules, the company's prompt and persona, knowledge, catalog and examples. */
  async buildSystemPrompt(companyId: string, settings: AiSettingsRow, platformPrompt: string): Promise<string> {
    const [company] = await this.db.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1);
    const parts: string[] = [];
    if (platformPrompt.trim()) parts.push(platformPrompt.trim());
    if (settings.systemPrompt.trim()) parts.push(settings.systemPrompt.trim());
    parts.push(
      `You are “${settings.personaName || 'Assistant'}”, the WhatsApp assistant of ${company?.name ?? 'the business'}. ` +
        'Keep replies short and friendly, like a helpful shop assistant on WhatsApp.'
    );
    parts.push(languageRule(settings.languageMode));
    parts.push(
      'Only use facts from the knowledge, catalog and examples below. Never invent prices, stock, delivery times or policies. ' +
        'If you do not know, or the customer wants to negotiate, complains or asks for a person, set "handoff" to true.'
    );
    parts.push(
      'Answer with STRICT JSON only, no other text: ' +
        '{"reply": string, "intent": string (short snake_case such as greeting, price_inquiry, order, delivery, availability, negotiation, complaint, human_request, other), ' +
        '"confidence": integer 0-100 (how sure you are the reply is correct and complete), "handoff": boolean, "reason": string (why, in a few words)}'
    );

    const docs = await this.db
      .select({ title: knowledgeDocuments.title, content: knowledgeDocuments.content })
      .from(knowledgeDocuments)
      .where(and(eq(knowledgeDocuments.companyId, companyId), eq(knowledgeDocuments.status, 'ready')))
      .orderBy(desc(knowledgeDocuments.createdAt));
    let knowledge = '';
    for (const d of docs) {
      if (knowledge.length >= KNOWLEDGE_CAP) break;
      knowledge += `### ${d.title}\n${d.content.trim()}\n\n`;
    }
    if (knowledge) parts.push(`## Knowledge\n${knowledge.slice(0, KNOWLEDGE_CAP).trim()}`);

    const items = await this.db
      .select()
      .from(products)
      .where(and(eq(products.companyId, companyId), eq(products.status, 'active')))
      .orderBy(products.name)
      .limit(200);
    if (items.length) {
      const lines = items.map(p => {
        const unit = p.priceUnit ? ` / ${p.priceUnit}` : '';
        const old = p.oldPriceMinor ? ` (was ${formatMoney(p.oldPriceMinor, p.currency)})` : '';
        return `- ${p.name}${p.sku ? ` [${p.sku}]` : ''}: ${formatMoney(p.priceMinor, p.currency)}${unit}${old}${p.note ? ` — ${p.note}` : ''}`;
      });
      parts.push(`## Catalog\n${lines.join('\n').slice(0, CATALOG_CAP)}`);
    }

    const examples = await this.db
      .select({ q: aiTrainingExamples.question, a: aiTrainingExamples.idealAnswer })
      .from(aiTrainingExamples)
      .where(eq(aiTrainingExamples.companyId, companyId))
      .orderBy(desc(aiTrainingExamples.createdAt))
      .limit(30);
    if (examples.length) {
      let block = '';
      for (const e of examples) {
        const next = `Q: ${e.q}\nA: ${e.a}\n\n`;
        if (block.length + next.length > EXAMPLES_CAP) break;
        block += next;
      }
      if (block) parts.push(`## Approved example answers\n${block.trim()}`);
    }
    return parts.join('\n\n');
  }

  /** Model answer plus the company's handoff rules. */
  decide(settings: AiSettingsRow, text: string, answer: BotAnswer | null): Decision {
    if (!answer) return { handoff: true, reason: 'the AI answer could not be read' };
    const enabled: Record<HandoffRule, boolean> = {
      negotiation: settings.autoHandoffOnNegotiation,
      complaint: settings.autoHandoffOnComplaint,
      staff_request: settings.autoHandoffOnStaffRequest
    };
    for (const rule of Object.keys(enabled) as HandoffRule[]) {
      if (enabled[rule] && matchRule(text, rule)) return { handoff: true, reason: RULE_REASON[rule] };
    }
    const intentRule = INTENT_RULE[answer.intent.toLowerCase()];
    if (intentRule && enabled[intentRule]) return { handoff: true, reason: RULE_REASON[intentRule] };
    if (answer.handoff) return { handoff: true, reason: answer.reason || 'the AI asked for a person' };
    if (!answer.reply) return { handoff: true, reason: 'the AI gave no reply' };
    if (answer.confidence < settings.confidenceThreshold) {
      return { handoff: true, reason: `low confidence (${answer.confidence} < ${settings.confidenceThreshold})` };
    }
    return { handoff: false, reason: answer.reason };
  }

  private turnsFrom(rows: MessageRow[]): ChatTurn[] {
    const out: ChatTurn[] = [];
    for (const r of rows) {
      if (r.direction === 'in') {
        const t = botText(r);
        if (t) out.push({ role: 'user', content: t });
      } else if (r.direction === 'out' && r.body.trim()) {
        out.push({ role: 'assistant', content: r.body.trim() });
      }
    }
    return out;
  }

  /* ───────── Worker ───────── */

  /** Returns true when the bot replied or handed off, false when it did not run. */
  async maybeReply(messageId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ m: messages, conv: conversations, contact: contacts })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .innerJoin(contacts, eq(contacts.id, conversations.contactId))
      .where(eq(messages.id, messageId))
      .limit(1);
    if (!row || row.m.direction !== 'in') return false;
    const { m, conv, contact } = row;
    const companyId = m.companyId;
    const text = botText(m);
    if (!text || contact.blockedAt || !conv.botActive) return false;

    // Safe to run twice: one log row per message.
    const [done] = await this.db.select({ id: aiBotLogs.id }).from(aiBotLogs).where(eq(aiBotLogs.messageId, m.id)).limit(1);
    if (done) return false;

    const [addon] = await this.db.select().from(aiAddons).where(eq(aiAddons.companyId, companyId)).limit(1);
    if (!addon || addon.status !== 'active') return false;
    if (addon.activeUntil && addon.activeUntil.getTime() <= Date.now()) return false;
    const month = usageMonth();
    const used = addon.usageMonth === month ? addon.repliesThisMonth : 0;
    if (used >= addon.monthlyReplyLimit) return false;

    const p = await this.platform.get();
    if (p.ai.globalOff) return false;
    const settings = await loadSettings(this.db, companyId);
    if (!settings.chatBotEnabled) return false;
    const cfg = this.providerConfig(p, settings);
    if (!cfg) return false;

    if (settings.chatBotMode === 'after_hours') {
      const [cs] = await this.db.select({ hours: callSettings.hours }).from(callSettings).where(eq(callSettings.companyId, companyId)).limit(1);
      const hours: CallHours = cs?.hours ?? { enabled: false, timezone: 'Asia/Colombo', weekly: [], holidays: [] };
      if (isOpen(hours)) return false;
    } else if (settings.chatBotMode === 'staff_busy') {
      const [free] = await this.db
        .select({ id: users.id })
        .from(presence)
        .innerJoin(users, eq(users.id, presence.userId))
        .where(
          and(
            eq(presence.companyId, companyId),
            eq(presence.channel, 'chat'),
            eq(presence.status, 'available'),
            eq(users.status, 'active'),
            inArray(users.role, ['manager', 'staff'])
          )
        )
        .limit(1);
      if (free) return false;
    }

    const since = new Date(Date.now() - HUMAN_QUIET_MS);
    const [human] = await this.db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.conversationId, conv.id), eq(messages.senderKind, 'user'), eq(messages.direction, 'out'), gt(messages.createdAt, since)))
      .limit(1);
    if (human) return false;
    // The customer sent more: answer the latest message only.
    const [newer] = await this.db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.conversationId, conv.id), eq(messages.direction, 'in'), ne(messages.id, m.id), sql`${messages.createdAt} > (select m2.created_at from messages m2 where m2.id = ${m.id})`))
      .limit(1);
    if (newer) return false;

    const history = (await this.inbox.recentMessages(conv.id, HISTORY + 5)).filter(r => r.createdAt <= m.createdAt).slice(-HISTORY);
    const system = await this.buildSystemPrompt(companyId, settings, p.ai.defaultPrompt);
    const started = Date.now();
    let answer: BotAnswer | null = null;
    let tokensUsed = 0;
    let providerFailed = false;
    try {
      const res = await complete(cfg, system, this.turnsFrom(history));
      answer = res.answer;
      tokensUsed = res.tokensUsed;
    } catch (err) {
      providerFailed = true;
      logger.warn({ companyId, messageId: m.id, err: err instanceof ProviderError ? err.message : 'AI provider unreachable' }, 'AI provider call failed');
    }
    const latencyMs = Date.now() - started;
    const decision = providerFailed ? { handoff: true, reason: 'AI provider unavailable' } : this.decide(settings, text, answer);
    const output = decision.handoff ? settings.fallbackMessage.trim() : (answer?.reply ?? '');

    const [log] = await this.db
      .insert(aiBotLogs)
      .values({
        companyId,
        channel: 'chat',
        contactId: contact.id,
        conversationId: conv.id,
        messageId: m.id,
        intent: answer?.intent ?? 'unknown',
        confidence: answer?.confidence ?? 0,
        userInput: text.slice(0, 4000),
        botOutput: output.slice(0, 4000),
        status: decision.handoff ? 'handed_off' : 'handled',
        tokensUsed,
        latencyMs
      })
      .returning({ id: aiBotLogs.id });

    if (!providerFailed) {
      await this.db
        .update(aiAddons)
        .set({
          usageMonth: month,
          repliesThisMonth: sql`case when ${aiAddons.usageMonth} = ${month} then ${aiAddons.repliesThisMonth} + 1 else 1 end`,
          tokensThisMonth: sql`case when ${aiAddons.usageMonth} = ${month} then ${aiAddons.tokensThisMonth} + ${tokensUsed} else ${tokensUsed} end`,
          costMinorThisMonth: sql`case when ${aiAddons.usageMonth} = ${month} then ${aiAddons.costMinorThisMonth} else 0 end`
        })
        .where(eq(aiAddons.companyId, companyId));
    }

    if (decision.handoff) {
      const agent = await this.handOff(companyId, conv, contact, output, decision.reason);
      if (agent) await this.db.update(aiBotLogs).set({ agentUserId: agent }).where(eq(aiBotLogs.id, log.id));
    } else {
      await this.send(companyId, conv.id, contact, output);
    }
    logger.info({ companyId, messageId: m.id, status: decision.handoff ? 'handed_off' : 'handled', tokensUsed, latencyMs }, 'AI bot ran');
    return true;
  }

  private async send(companyId: string, conversationId: string, contact: ContactRow, text: string): Promise<void> {
    if (!text) return;
    const [fresh] = await this.db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
    if (!fresh) return;
    try {
      await this.messaging.sendFreeForm(companyId, fresh, contact, { text, fileIds: [] }, { userId: null, kind: 'bot' });
    } catch (err) {
      logger.warn({ companyId, conversationId, code: err instanceof AppError ? err.code : 'ERROR' }, 'AI bot reply not sent');
    }
  }

  /** Fallback message, bot off for this chat, a person assigned, a line in the chat. Returns the owner. */
  private async handOff(companyId: string, conv: ConversationRow, contact: ContactRow, fallback: string, reason: string): Promise<string | null> {
    await this.send(companyId, conv.id, contact, fallback);
    await this.db.update(conversations).set({ botActive: false }).where(eq(conversations.id, conv.id));
    const previousOwner = contact.ownerUserId;
    if (!contact.ownerUserId && this.automation) {
      const [rules] = await this.db.select().from(assignmentRules).where(eq(assignmentRules.companyId, companyId)).limit(1);
      if (rules && rules.autoAssign !== 'off') {
        try {
          await this.automation.autoAssign(companyId, contact, rules);
        } catch (err) {
          logger.warn({ companyId, err: err instanceof Error ? err.message : 'error' }, 'AI handoff auto-assign failed');
        }
      }
    }
    const note = await this.inbox.addInternal(companyId, conv.id, 'system', `AI bot handed off: ${reason}`, null);
    await this.inbox.emitMessage(companyId, note.id);
    await this.inbox.emitConversation(companyId, conv.id, previousOwner);
    return contact.ownerUserId;
  }

  /* ───────── Simulator (system admin) ───────── */

  /** Runs the company's bot on a test message. Sends nothing to WhatsApp and counts no usage. */
  async simulate(companyId: string, message: string, history: { role: 'user' | 'bot'; text: string }[]): Promise<AiSimulateResponse> {
    const p = await this.platform.get();
    const settings = await loadSettings(this.db, companyId);
    const cfg = this.providerConfig(p, settings);
    if (!cfg) throw new AppError('AI_NOT_CONFIGURED', 'Set the AI provider, API key and default model in AI platform settings first.');
    const system = await this.buildSystemPrompt(companyId, settings, p.ai.defaultPrompt);
    const turns: ChatTurn[] = [
      ...history.slice(-HISTORY).map(h => ({ role: h.role === 'bot' ? ('assistant' as const) : ('user' as const), content: h.text })),
      { role: 'user', content: message }
    ];
    const started = Date.now();
    let res: Awaited<ReturnType<typeof complete>>;
    try {
      res = await complete(cfg, system, turns);
    } catch (err) {
      throw new AppError('BAD_REQUEST', err instanceof ProviderError ? err.message : 'Could not reach the AI provider.');
    }
    const latencyMs = Date.now() - started;
    const decision = this.decide(settings, message, res.answer);
    const suggestedActions: string[] = [];
    if (decision.handoff) {
      suggestedActions.push(`Hand off to a person: ${decision.reason}`);
      suggestedActions.push('Save a corrected answer as a training example');
    } else {
      suggestedActions.push('Send the reply');
    }
    if (res.answer && res.answer.confidence < settings.confidenceThreshold + 10) suggestedActions.push('Add knowledge that covers this question');
    return {
      reply: decision.handoff ? settings.fallbackMessage : (res.answer?.reply ?? ''),
      intent: res.answer?.intent ?? 'unknown',
      confidence: res.answer?.confidence ?? 0,
      handoff: decision.handoff,
      latencyMs,
      tokensUsed: res.tokensUsed,
      suggestedActions
    };
  }
}

