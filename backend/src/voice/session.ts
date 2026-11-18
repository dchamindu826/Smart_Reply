/** Shared pieces of a voice agent call session (Live and Studio modes). */
import type { CallMedia } from './media';
import type { FunctionDeclaration, Gemini } from './gemini';
import type { VoiceTools } from './tools';

export interface TranscriptLine {
  role: 'caller' | 'agent';
  text: string;
  at: string;
}

export type EndReason = 'agent_ended' | 'caller_hung_up' | 'max_duration' | 'ai_error' | 'media_closed' | 'stopped';

export interface SessionDeps {
  media: CallMedia;
  gemini: Gemini;
  tools: VoiceTools;
  declarations: FunctionDeclaration[];
  systemPrompt: string;
  greeting: string;
  /** Spoken when the AI fails and the call must end. */
  sorryLine: string;
  transcript: TranscriptLine[];
  /** Called once when the session wants the call to end. */
  onEnd: (reason: EndReason) => void;
  log: (msg: string, data?: Record<string, unknown>) => void;
}

export interface AgentSession {
  start(): Promise<void>;
  /** Time is nearly up: say goodbye and end. */
  wrapUp(): void;
  close(): void;
}

export function addLine(transcript: TranscriptLine[], role: TranscriptLine['role'], text: string): void {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return;
  const last = transcript[transcript.length - 1];
  if (last && last.role === role && Date.now() - Date.parse(last.at) < 4000) last.text = `${last.text} ${t}`;
  else transcript.push({ role, text: t, at: new Date().toISOString() });
}
