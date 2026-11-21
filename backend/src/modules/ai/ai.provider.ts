/**
 * The one internal interface to the AI provider. Plain `fetch`, no SDKs, so the provider can be
 * swapped in the admin console. Customer text goes to the provider; it is never logged here.
 */
import { z } from 'zod';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ProviderConfig {
  provider: 'openai' | 'anthropic';
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface BotAnswer {
  reply: string;
  intent: string;
  confidence: number;
  handoff: boolean;
  reason: string;
}

export interface CompletionResult {
  answer: BotAnswer | null;
  tokensUsed: number;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number | null
  ) {
    super(message);
  }
}

const answerSchema = z.object({
  reply: z.coerce.string().default(''),
  response: z.coerce.string().optional(),
  message: z.coerce.string().optional(),
  text: z.coerce.string().optional(),
  answer: z.coerce.string().optional(),
  intent: z.coerce.string().default('unknown'),
  confidence: z.coerce.number().default(0),
  handoff: z
    .union([z.boolean(), z.string()])
    .transform(v => (typeof v === 'boolean' ? v : v.toLowerCase() === 'true'))
    .default(false),
  reason: z.coerce.string().default('')
});

/** Reads the model's JSON even when it is wrapped in a code fence or has text around it. */
export function parseAnswer(text: string): BotAnswer | null {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const candidates = [cleaned];
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(cleaned.slice(start, end + 1));
  for (const c of candidates) {
    let data: unknown;
    try {
      data = JSON.parse(c);
    } catch {
      continue;
    }
    const parsed = answerSchema.safeParse(data);
    if (!parsed.success) continue;
    const a = parsed.data;
    let confidence = Number.isFinite(a.confidence) ? a.confidence : 0;
    // Some models answer 0–1 instead of 0–100.
    if (confidence > 0 && confidence <= 1 && !Number.isInteger(confidence)) confidence *= 100;
    const replyText = a.reply || a.response || a.message || a.text || a.answer || '';
    return {
      reply: replyText.trim(),
      intent: a.intent.trim().slice(0, 60) || 'unknown',
      confidence: Math.max(0, Math.min(100, Math.round(confidence))),
      handoff: a.handoff,
      reason: a.reason.trim().slice(0, 300)
    };
  }
  return null;
}

/** Anthropic needs alternating roles starting with the user. */
function alternate(turns: ChatTurn[]): ChatTurn[] {
  const out: ChatTurn[] = [];
  for (const t of turns) {
    if (!t.content.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.role === t.role) last.content += `\n${t.content}`;
    else out.push({ ...t });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return (text ? JSON.parse(text) : {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function errorMessage(body: Record<string, unknown>, status: number): string {
  const e = body.error as { message?: unknown } | string | undefined;
  const msg = typeof e === 'string' ? e : typeof e?.message === 'string' ? e.message : '';
  return `AI provider HTTP ${status}${msg ? `: ${msg.slice(0, 200)}` : ''}`;
}

export async function complete(cfg: ProviderConfig, system: string, turns: ChatTurn[]): Promise<CompletionResult> {
  const res = await completeRaw(cfg, system, turns);
  return { answer: parseAnswer(res.text), tokensUsed: res.tokensUsed };
}

/** Any JSON object the model returns (fences and text around it are ignored), or null. */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  for (const c of [cleaned, start >= 0 && end > start ? cleaned.slice(start, end + 1) : '']) {
    if (!c) continue;
    try {
      const data: unknown = JSON.parse(c);
      if (data && typeof data === 'object' && !Array.isArray(data)) return data as Record<string, unknown>;
    } catch {
      continue;
    }
  }
  return null;
}

/** One completion that answers in JSON, for jobs other than the reply (the AI handover note). */
export async function completeJson(cfg: ProviderConfig, system: string, turns: ChatTurn[]): Promise<{ data: Record<string, unknown> | null; tokensUsed: number }> {
  const res = await completeRaw(cfg, system, turns);
  return { data: parseJsonObject(res.text), tokensUsed: res.tokensUsed };
}

async function completeRaw(cfg: ProviderConfig, system: string, turns: ChatTurn[]): Promise<{ text: string; tokensUsed: number }> {
  const signal = AbortSignal.timeout(45_000);
  if (cfg.provider === 'openai') {
    const base = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'system', content: system }, ...turns.filter(t => t.content.trim())],
        response_format: { type: 'json_object' },
        temperature: 0.3
      }),
      signal
    });
    const body = await readJson(res);
    if (!res.ok) throw new ProviderError(errorMessage(body, res.status), res.status);
    const choices = body.choices as { message?: { content?: string } }[] | undefined;
    const usage = body.usage as { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number } | undefined;
    const text = choices?.[0]?.message?.content ?? '';
    return {
      text,
      tokensUsed: usage?.total_tokens ?? (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0)
    };
  }
  const base = (cfg.baseUrl || 'https://api.anthropic.com').replace(/\/$/, '');
  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: cfg.model, max_tokens: 800, system, messages: alternate(turns) }),
    signal
  });
  const body = await readJson(res);
  if (!res.ok) throw new ProviderError(errorMessage(body, res.status), res.status);
  const content = body.content as { type?: string; text?: string }[] | undefined;
  const usage = body.usage as { input_tokens?: number; output_tokens?: number } | undefined;
  const text = (content ?? [])
    .filter(c => c.type === 'text')
    .map(c => c.text ?? '')
    .join('');
  return { text, tokensUsed: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0) };
}
