/**
 * Live mode: Gemini Live speech-to-speech. The model hears the caller directly, handles
 * turn-taking and interruptions itself, calls our tools and speaks with a Live voice.
 * Lowest delay (about a second).
 */
import { liveSetup, LiveServerMessage, LiveSocket } from './gemini';
import { rateOf, bufferToPcm, concatPcm } from './audio';
import { AgentSession, addLine, EndReason, SessionDeps } from './session';

export class LiveSession implements AgentSession {
  private ws: LiveSocket | null = null;
  private callerText = '';
  private agentText = '';
  private pending: Int16Array[] = [];
  private ending = false;
  private closed = false;

  constructor(
    private readonly d: SessionDeps,
    private readonly opts: { model: string; voice: string }
  ) {}

  async start(): Promise<void> {
    const ws = this.d.gemini.live();
    this.ws = ws;
    ws.onMessage(m => this.handle(m));
    await ws.setup(liveSetup({ model: this.opts.model, voice: this.opts.voice, systemPrompt: this.d.systemPrompt, tools: this.d.declarations }));
    ws.onClose(reason => {
      if (!this.closed) {
        this.d.log('Gemini Live closed', { reason });
        this.end('ai_error');
      }
    });
    this.d.media.onAudio(pcm => {
      // 40 ms per message keeps the socket light without adding noticeable delay.
      this.pending.push(pcm);
      if (this.pending.length >= 2) {
        ws.sendAudio(concatPcm(this.pending));
        this.pending = [];
      }
    });
    ws.sendText(`(The phone call has just connected. Greet the caller now by saying: "${this.d.greeting}")`);
  }

  wrapUp(): void {
    this.ws?.sendText(
      '(The call time limit is nearly reached. Politely tell the caller our team will follow up on WhatsApp if anything is left, say goodbye, then call end_call.)'
    );
    setTimeout(() => this.end('max_duration'), 20_000);
  }

  close(): void {
    this.closed = true;
    this.flushCaller();
    this.flushAgent();
    this.ws?.close();
  }

  private end(reason: EndReason): void {
    if (this.ending) return;
    this.ending = true;
    this.d.onEnd(reason);
  }

  private flushCaller(): void {
    addLine(this.d.transcript, 'caller', this.callerText);
    this.callerText = '';
  }

  private flushAgent(): void {
    addLine(this.d.transcript, 'agent', this.agentText);
    this.agentText = '';
  }

  private handle(m: LiveServerMessage): void {
    if (this.closed) return;
    const sc = m.serverContent;
    if (sc) {
      if (sc.inputTranscription?.text) this.callerText += sc.inputTranscription.text;
      if (sc.outputTranscription?.text) {
        if (this.callerText) this.flushCaller();
        this.agentText += sc.outputTranscription.text;
      }
      for (const p of sc.modelTurn?.parts ?? []) {
        if (p.inlineData?.data && p.inlineData.mimeType.startsWith('audio/')) {
          if (this.callerText) this.flushCaller();
          this.d.media.play(bufferToPcm(Buffer.from(p.inlineData.data, 'base64')), rateOf(p.inlineData.mimeType));
        }
      }
      if (sc.interrupted) {
        // The caller talked over the agent: stop speaking at once.
        this.d.media.clearPlayback();
        this.flushAgent();
      }
      if (sc.turnComplete) {
        this.flushAgent();
        if (this.d.tools.results.endRequested) void this.hangUpAfterSpeech();
      }
    }
    if (m.toolCall?.functionCalls?.length) void this.runTools(m.toolCall.functionCalls);
    if (m.goAway) this.d.log('Gemini Live will close soon', { timeLeft: m.goAway.timeLeft });
    if (m.error) {
      this.d.log('Gemini Live error', { message: m.error.message });
    }
  }

  private async runTools(calls: { id: string; name: string; args?: Record<string, unknown> }[]): Promise<void> {
    const functionResponses = [];
    for (const c of calls) {
      const response = await this.d.tools.run(c.name, c.args ?? {});
      functionResponses.push({ id: c.id, name: c.name, response });
    }
    this.ws?.send({ toolResponse: { functionResponses } });
    if (this.d.tools.results.endRequested) {
      // Usually the goodbye was already spoken; give it a moment, then hang up.
      setTimeout(() => void this.hangUpAfterSpeech(), 6000);
    }
  }

  private async hangUpAfterSpeech(): Promise<void> {
    if (this.ending) return;
    await this.d.media.drained();
    await new Promise(r => setTimeout(r, 400));
    this.end('agent_ended');
  }
}
