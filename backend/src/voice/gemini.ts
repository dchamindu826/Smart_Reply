/**
 * Minimal Gemini API client for the voice agent: plain `fetch` and the built-in WebSocket, no SDK.
 *
 *  - `generate`:  generateContent (the Studio-mode brain, transcription, call summaries)
 *  - `speak`:     streamGenerateContent with AUDIO output (Gemini TTS, e.g. gemini-3.8-flash-tts)
 *  - `LiveSocket`: Live API (BidiGenerateContent) for speech-to-speech (e.g. gemini-3.8-live)
 *
 * Customer audio and text go to Google; nothing here logs them.
 */
import { bufferToPcm, rateOf } from './audio';

export interface Part {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
  thought?: boolean;
  thoughtSignature?: string;
}

export interface Content {
  role: 'user' | 'model';
  parts: Part[];
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters?: { type: 'object'; properties: Record<string, { type: string; description?: string; enum?: string[] }>; required?: string[] };
}

export class GeminiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null
  ) {
    super(message);
  }
}

interface GenerateResponse {
  candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
  usageMetadata?: { totalTokenCount?: number };
  error?: { message?: string };
}

export class Gemini {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://generativelanguage.googleapis.com'
  ) {}

  private url(model: string, method: string, query = ''): string {
    const m = model.startsWith('models/') ? model.slice(7) : model;
    return `${this.baseUrl.replace(/\/$/, '')}/v1beta/models/${encodeURIComponent(m)}:${method}${query}`;
  }

  private headers(): Record<string, string> {
    return { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey };
  }

  /** One generateContent call. Returns the first candidate's parts. */
  async generate(model: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<{ parts: Part[]; tokens: number }> {
    const res = await fetch(this.url(model, 'generateContent'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(30_000)
    });
    const data = (await res.json().catch(() => ({}))) as GenerateResponse;
    if (!res.ok) throw new GeminiError(`Gemini HTTP ${res.status}: ${(data.error?.message ?? '').slice(0, 300)}`, res.status);
    return { parts: data.candidates?.[0]?.content?.parts ?? [], tokens: data.usageMetadata?.totalTokenCount ?? 0 };
  }

  /** Plain text out of a generateContent call. */
  async text(model: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
    const { parts } = await this.generate(model, body, signal);
    return parts
      .filter(p => p.text && !p.thought)
      .map(p => p.text)
      .join('')
      .trim();
  }

  /**
   * Text to speech, streamed: `onAudio` gets 16-bit PCM chunks as they arrive.
   * Resolves when the stream ends; rejects on HTTP errors.
   */
  async speak(
    model: string,
    voice: string,
    prompt: string,
    onAudio: (pcm: Int16Array, rate: number) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const res = await fetch(this.url(model, 'streamGenerateContent', '?alt=sse'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
        }
      }),
      signal: signal ?? AbortSignal.timeout(30_000)
    });
    if (!res.ok || !res.body) {
      const data = (await res.json().catch(() => ({}))) as GenerateResponse;
      throw new GeminiError(`Gemini TTS HTTP ${res.status}: ${(data.error?.message ?? '').slice(0, 300)}`, res.status);
    }
    let carry = new Uint8Array(0);
    let got = false;
    for await (const event of sse(res.body)) {
      let data: GenerateResponse;
      try {
        data = JSON.parse(event) as GenerateResponse;
      } catch {
        continue;
      }
      if (data.error) throw new GeminiError(`Gemini TTS: ${data.error.message ?? 'error'}`, null);
      for (const p of data.candidates?.[0]?.content?.parts ?? []) {
        if (!p.inlineData?.data) continue;
        const bytes = Buffer.from(p.inlineData.data, 'base64');
        // Keep sample alignment across chunks.
        const joined = new Uint8Array(carry.length + bytes.length);
        joined.set(carry);
        joined.set(bytes, carry.length);
        const even = joined.length - (joined.length % 2);
        carry = joined.slice(even);
        if (even > 0) {
          got = true;
          onAudio(bufferToPcm(joined.subarray(0, even)), rateOf(p.inlineData.mimeType));
        }
      }
    }
    if (!got) throw new GeminiError('Gemini TTS returned no audio', null);
  }

  /** Open a Live API session. */
  live(): LiveSocket {
    const base = this.baseUrl.replace(/\/$/, '').replace(/^http/, 'ws');
    return new LiveSocket(`${base}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(this.apiKey)}`);
  }
}

/** Server-sent events: yields each `data:` payload. */
async function* sse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  const reader = body.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx).replace(/^\r?\n\r?\n/, '');
      const data = block
        .split(/\r?\n/)
        .filter(l => l.startsWith('data:'))
        .map(l => l.slice(5).trimStart())
        .join('\n');
      if (data) yield data;
    }
  }
  const tail = buffer
    .split(/\r?\n/)
    .filter(l => l.startsWith('data:'))
    .map(l => l.slice(5).trimStart())
    .join('\n');
  if (tail) yield tail;
}

export interface LiveServerMessage {
  setupComplete?: Record<string, never>;
  serverContent?: {
    modelTurn?: { parts?: Part[] };
    turnComplete?: boolean;
    interrupted?: boolean;
    generationComplete?: boolean;
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
  };
  toolCall?: { functionCalls?: { id: string; name: string; args?: Record<string, unknown> }[] };
  toolCallCancellation?: { ids?: string[] };
  goAway?: { timeLeft?: string };
  error?: { message?: string };
}

/** A Live API WebSocket with JSON in and out. */
export class LiveSocket {
  private ws: WebSocket;
  private handlers: ((m: LiveServerMessage) => void)[] = [];
  private closeHandlers: ((reason: string) => void)[] = [];
  private opened: Promise<void>;
  closed = false;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('error', () => reject(new GeminiError('Could not connect to Gemini Live', null)), { once: true });
    });
    const decoder = new TextDecoder();
    this.ws.addEventListener('message', ev => {
      const raw = typeof ev.data === 'string' ? ev.data : decoder.decode(ev.data as ArrayBuffer);
      let msg: LiveServerMessage;
      try {
        msg = JSON.parse(raw) as LiveServerMessage;
      } catch {
        return;
      }
      for (const h of this.handlers) h(msg);
    });
    this.ws.addEventListener('close', ev => {
      this.closed = true;
      for (const h of this.closeHandlers) h(ev.reason || `closed (${ev.code})`);
    });
  }

  onMessage(h: (m: LiveServerMessage) => void): void {
    this.handlers.push(h);
  }

  onClose(h: (reason: string) => void): void {
    this.closeHandlers.push(h);
  }

  /** Send the setup message and wait for `setupComplete`. */
  async setup(setup: Record<string, unknown>, timeoutMs = 10_000): Promise<void> {
    await this.opened;
    const done = new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new GeminiError('Gemini Live setup timed out', null)), timeoutMs);
      this.onMessage(m => {
        if (m.setupComplete) {
          clearTimeout(t);
          resolve();
        }
      });
      this.onClose(reason => {
        clearTimeout(t);
        reject(new GeminiError(`Gemini Live closed: ${reason}`, null));
      });
    });
    this.send({ setup });
    await done;
  }

  send(msg: Record<string, unknown>): void {
    if (this.closed || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  sendAudio(pcm16k: Int16Array): void {
    this.send({
      realtimeInput: { audio: { data: Buffer.from(pcm16k.buffer, pcm16k.byteOffset, pcm16k.byteLength).toString('base64'), mimeType: 'audio/pcm;rate=16000' } }
    });
  }

  sendText(text: string): void {
    this.send({ realtimeInput: { text } });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

/** Gemini Live setup for a phone call. */
export function liveSetup(opts: {
  model: string;
  voice: string;
  systemPrompt: string;
  tools: FunctionDeclaration[];
}): Record<string, unknown> {
  return {
    model: opts.model.startsWith('models/') ? opts.model : `models/${opts.model}`,
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voice } } }
    },
    systemInstruction: { parts: [{ text: opts.systemPrompt }] },
    tools: opts.tools.length ? [{ functionDeclarations: opts.tools }] : [],
    inputAudioTranscription: {},
    outputAudioTranscription: {}
  };
}
