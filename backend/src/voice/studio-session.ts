/**
 * Studio mode: listen → think → speak, so any Gemini TTS voice (for example "Hali" on
 * gemini-3.8-flash-tts) can be used.
 *
 *  1. Voice activity detection finds the end of what the caller said.
 *  2. The brain model (e.g. gemini-3.8-flash) hears that audio, calls tools and writes the reply.
 *     A fast model writes a transcript of the caller's words at the same time, for the history.
 *  3. The reply is spoken sentence by sentence with Gemini TTS; the first sentence starts while
 *     the rest are still being made.
 *
 * If the caller talks over the agent, playback stops and the new words are answered instead.
 */
import { Content, GeminiError, Part } from './gemini';
import { Vad, wav } from './audio';
import { AgentSession, addLine, EndReason, SessionDeps } from './session';

export const FAST_MODEL = 'gemini-3.5-flash-lite';
/** Keep the history small: audio of past turns is replaced by text. */
const MAX_HISTORY = 30;
const BARGE_IN_MS = 700;

/** Which thinking setting the brain model accepts; learned on the first call and kept. */
let thinkingMode: 'level' | 'budget' | 'none' = 'level';

export interface StudioOptions {
  brainModel: string;
  ttsModel: string;
  voice: string;
  /** Spoken-style instruction put before each line, e.g. "Say warmly, like a friendly Sri Lankan call-centre agent:". */
  style: string;
  /** Greeting audio made before the call was answered (or null to make it now). */
  greetingAudio: { pcm: Int16Array; rate: number }[] | null;
}

export class StudioSession implements AgentSession {
  private readonly vad = new Vad({ endSilenceMs: 800, startMs: 100 });
  private history: Content[] = [];
  private turn = 0;
  private abort: AbortController | null = null;
  private speechStartedAt = 0;
  private failures = 0;
  private ending = false;
  private closed = false;

  constructor(
    private readonly d: SessionDeps,
    private readonly opts: StudioOptions
  ) {}

  async start(): Promise<void> {
    this.d.media.onAudio(pcm => this.onAudio(pcm));
    addLine(this.d.transcript, 'agent', this.d.greeting);
    this.history.push({ role: 'user', parts: [{ text: '(The call connected.)' }] }, { role: 'model', parts: [{ text: this.d.greeting }] });
    if (this.opts.greetingAudio?.length) {
      for (const c of this.opts.greetingAudio) this.d.media.play(c.pcm, c.rate);
    } else {
      await this.say(this.d.greeting, this.turn).catch(err => {
        this.d.log('Greeting say failed', { error: err instanceof Error ? err.message : String(err) });
      });
    }
  }

  wrapUp(): void {
    if (this.ending) return;
    const turn = ++this.turn;
    this.abort?.abort();
    this.d.media.clearPlayback();
    void (async () => {
      await this.reply(turn, '(The call time limit is reached. Briefly say our team will follow up on WhatsApp, and say goodbye.)', null);
      await this.d.media.drained();
      this.end('max_duration');
    })();
  }

  close(): void {
    this.closed = true;
    this.abort?.abort();
  }

  private end(reason: EndReason): void {
    if (this.ending) return;
    this.ending = true;
    this.d.onEnd(reason);
  }

  private onAudio(pcm: Int16Array): void {
    if (this.closed || this.ending) return;
    const ev = this.vad.push(pcm);
    if (ev?.kind === 'start') this.speechStartedAt = Date.now();
    // Barge-in: the caller has been talking for a moment while we are speaking.
    // Only abort if we are actively playing media (never abort while merely thinking, to avoid background noise cancelling replies).
    if (this.vad.speaking && this.d.media.playing && Date.now() - this.speechStartedAt > BARGE_IN_MS && this.abort) {
      this.d.log('Caller interrupted');
      this.abort.abort();
      this.abort = null;
      this.d.media.clearPlayback();
    }
    if (ev?.kind === 'end' && ev.audio.length > 16000 * 0.4) {
      const turn = ++this.turn;
      void this.reply(turn, null, ev.audio).catch(err => {
        if (!this.closed) this.d.log('Turn reply error', { error: err instanceof Error ? err.message : String(err) });
      });
    }
  }

  /** Answer one caller turn (audio) or an instruction (text). */
  private async reply(turn: number, instruction: string | null, audio: Int16Array | null): Promise<void> {
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    const started = Date.now();
    try {
      const userParts: Part[] = audio
        ? [{ inlineData: { mimeType: 'audio/wav', data: wav(audio, 16000).toString('base64') } }]
        : [{ text: instruction ?? '' }];
      const userTurn: Content = { role: 'user', parts: userParts };
      const transcript = audio ? this.transcribe(audio, abort.signal).catch(() => null) : Promise.resolve(null);
      const working: Content[] = [...this.history, userTurn];
      let text = '';
      for (let step = 0; step < 5; step++) {
        if (abort.signal.aborted) return;
        const parts = await this.think(working, abort.signal);
        const calls = parts.filter(p => p.functionCall);
        text = parts
          .filter(p => p.text && !p.thought)
          .map(p => p.text)
          .join(' ')
          .trim();
        working.push({ role: 'model', parts });
        if (!calls.length) break;
        const responses: Part[] = [];
        for (const c of calls) {
          const fc = c.functionCall!;
          const response = await this.d.tools.run(fc.name, fc.args ?? {});
          responses.push({ functionResponse: { ...(fc.id ? { id: fc.id } : {}), name: fc.name, response } });
        }
        working.push({ role: 'user', parts: responses });
        if (abort.signal.aborted) return;
      }
      if (abort.signal.aborted || turn !== this.turn) return;
      // Keep text, not audio, in the history.
      const heard = await transcript;
      if (heard) addLine(this.d.transcript, 'caller', heard);
      working[this.history.length] = { role: 'user', parts: [{ text: audio ? `(caller said) ${heard ?? '[not clear]'}` : (instruction ?? '') }] };
      this.history = working.slice(-MAX_HISTORY);
      while (this.history.length && (this.history[0].role !== 'user' || this.history[0].parts.some(p => p.functionResponse))) this.history.shift();
      this.failures = 0;
      this.d.log('Studio turn ready', { thinkMs: Date.now() - started, chars: text.length });
      if (text) {
        addLine(this.d.transcript, 'agent', text);
        await this.say(text, turn, abort.signal);
      }
      if (this.d.tools.results.endRequested && turn === this.turn) {
        await this.d.media.drained();
        this.end('agent_ended');
      }
    } catch (err) {
      if (abort.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return;
      this.failures++;
      this.d.log('Studio turn failed', { error: err instanceof Error ? err.message : String(err), failures: this.failures });
      if (this.failures >= 2) {
        this.d.tools.results.callback ??= { reason: 'The AI voice agent had a technical problem during the call', urgent: false };
        await this.say(this.d.sorryLine, turn).catch(() => undefined);
        await this.d.media.drained();
        this.end('ai_error');
      }
    } finally {
      if (this.abort === abort || !this.abort) {
        this.abort = null;
      }
    }
  }

  private async think(contents: Content[], signal: AbortSignal): Promise<Part[]> {
    const body = (mode: typeof thinkingMode): Record<string, unknown> => ({
      systemInstruction: { parts: [{ text: this.d.systemPrompt }] },
      contents,
      tools: this.d.declarations.length ? [{ functionDeclarations: this.d.declarations }] : undefined,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 150,
        ...(mode === 'level' ? { thinkingConfig: { thinkingLevel: 'minimal' } } : mode === 'budget' ? { thinkingConfig: { thinkingBudget: 0 } } : {})
      }
    });
    for (;;) {
      try {
        const { parts } = await this.d.gemini.generate(this.opts.brainModel, body(thinkingMode), AbortSignal.any([signal, AbortSignal.timeout(20_000)]));
        return parts;
      } catch (err) {
        // Older or newer models reject one of the thinking settings: fall back once and remember.
        if (err instanceof GeminiError && err.status === 400 && /think/i.test(err.message) && thinkingMode !== 'none') {
          thinkingMode = thinkingMode === 'level' ? 'budget' : 'none';
          continue;
        }
        throw err;
      }
    }
  }

  private async transcribe(audio: Int16Array, signal: AbortSignal): Promise<string> {
    return this.d.gemini.text(
      FAST_MODEL,
      {
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'audio/wav', data: wav(audio, 16000).toString('base64') } },
              { text: 'Write exactly what the caller says, in the language and script they speak (Sinhala in Sinhala script). Output only the words.' }
            ]
          }
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 300 }
      },
      AbortSignal.any([signal, AbortSignal.timeout(15_000)])
    );
  }

  /** Speak text: streams straight to the caller via SSE audio chunks. */
  private async say(text: string, turn: number, signal?: AbortSignal): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    const ok = () => !signal?.aborted && turn === this.turn && !this.closed;
    try {
      await this.d.gemini.speak(
        this.opts.ttsModel,
        this.opts.voice,
        trimmed,
        (pcm, rate) => {
          if (ok()) this.d.media.play(pcm, rate);
        },
        signal
      );
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) return;
      throw err;
    }
  }
}

/** Make speech before the call is answered (the greeting), so the caller hears it at once. */
export async function synthAll(
  gemini: SessionDeps['gemini'],
  model: string,
  voice: string,
  _style: string,
  text: string
): Promise<{ pcm: Int16Array; rate: number }[]> {
  const out: { pcm: Int16Array; rate: number }[] = [];
  await gemini.speak(model, voice, text, (pcm, rate) => out.push({ pcm, rate }));
  return out;
}
