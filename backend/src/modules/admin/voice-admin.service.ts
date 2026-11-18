/**
 * System admin tools for the AI voice agent: hear the chosen voice, and talk to the agent from
 * the browser (a test call through the voice process, nothing saved).
 */
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { VoiceServerStatus, VoiceTestState } from '@smart-reply/shared';
import { AppError, notFound } from '../../common/errors';
import type { Session } from '../../common/session';
import { env } from '../../config';
import type { Db } from '../../db/client';
import { companies } from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { Queues } from '../../infra/queues';
import { Platform } from '../../meta/platform';
import { loadSettings } from '../ai/ai.presenters';
import { speakingStyle, withVoiceDefaults } from '../../voice/agent.service';
import { concatPcm, wav } from '../../voice/audio';
import { VoiceBus } from '../../voice/bus';
import { Gemini, GeminiError, liveSetup } from '../../voice/gemini';
import { DEFAULT_GREETING, fillGreeting } from '../../voice/prompt';
import { AdminAudit } from './admin.audit';
import { CompaniesService } from './companies.service';

@Injectable()
export class VoiceAdminService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly companies: CompaniesService,
    private readonly platform: Platform,
    private readonly queues: Queues,
    private readonly bus: VoiceBus,
    private readonly audit: AdminAudit
  ) {}

  async status(): Promise<VoiceServerStatus> {
    const p = await this.platform.get();
    return { ...(await this.bus.status()), geminiKeySet: Boolean(p.ai.geminiApiKey) };
  }

  private async gemini(): Promise<Gemini> {
    const p = await this.platform.get();
    if (!p.ai.geminiApiKey) throw new AppError('AI_NOT_CONFIGURED', 'Add the Gemini API key in AI → Platform first.');
    return new Gemini(p.ai.geminiApiKey, env.GEMINI_API_URL);
  }

  /** Speak a line (or the greeting) in the company's voice. Returns a WAV file. */
  async preview(companyId: string, input: { text?: string; mode?: 'live' | 'studio' }): Promise<Buffer> {
    await this.companies.require(companyId);
    const settings = withVoiceDefaults(await loadSettings(this.db, companyId));
    const [company] = await this.db.select({ name: companies.name }).from(companies).where(eq(companies.id, companyId)).limit(1);
    const text =
      input.text?.trim() ||
      fillGreeting(settings.voiceGreeting.trim() || DEFAULT_GREETING[settings.voiceLanguage], company?.name ?? 'our business', settings.personaName || 'Assistant');
    const mode = input.mode ?? settings.voiceMode;
    const gemini = await this.gemini();
    const chunks: Int16Array[] = [];
    let rate = 24000;
    try {
      if (mode === 'studio') {
        await gemini.speak(
          settings.voiceTtsModel,
          settings.voiceTtsVoice,
          text,
          (pcm, r) => {
            chunks.push(pcm);
            rate = r;
          },
          AbortSignal.timeout(40_000)
        );
      } else {
        await this.livePreview(gemini, settings.voiceLiveModel, settings.voiceLiveVoice, text, pcm => chunks.push(pcm));
      }
    } catch (err) {
      throw new AppError('AI_PROVIDER_ERROR', err instanceof GeminiError ? err.message : 'Gemini did not answer. Check the key and model names.');
    }
    return wav(concatPcm(chunks), rate);
  }

  private async livePreview(gemini: Gemini, model: string, voice: string, text: string, onPcm: (pcm: Int16Array) => void): Promise<void> {
    const ws = gemini.live();
    try {
      await ws.setup(liveSetup({ model, voice, systemPrompt: 'You are a voice preview. Read aloud exactly the text the user sends, naturally, and say nothing else.', tools: [] }));
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new GeminiError('Gemini Live preview timed out', null)), 30_000);
        ws.onMessage(m => {
          for (const p of m.serverContent?.modelTurn?.parts ?? []) {
            if (p.inlineData?.data) {
              const b = Buffer.from(p.inlineData.data, 'base64');
              onPcm(new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength - (b.byteLength % 2))));
            }
          }
          if (m.serverContent?.turnComplete) {
            clearTimeout(t);
            resolve();
          }
        });
        ws.onClose(reason => {
          clearTimeout(t);
          reject(new GeminiError(`Gemini Live closed: ${reason}`, null));
        });
        ws.sendText(text);
      });
    } finally {
      ws.close();
    }
  }

  /** Start a browser test call: the voice process answers the browser's offer. */
  async startTest(s: Session, companyId: string, input: { sdpOffer: string; mode?: 'live' | 'studio' }): Promise<{ testId: string; sdpAnswer: string }> {
    const c = await this.companies.require(companyId);
    await this.gemini();
    const st = await this.bus.status();
    if (!st.online) throw new AppError('VOICE_UNAVAILABLE', 'The voice server is not running. Start it with `npm run start:voice` (or the voice service in Docker).');
    const testId = uuidv7();
    await this.queues.add('voice.test', { testId, companyId, sdpOffer: input.sdpOffer, mode: input.mode ?? null }, { attempts: 1, jobId: `voice-test-${testId}` });
    const answer = await this.bus.waitTestAnswer(testId, 25);
    if (!answer) throw new AppError('VOICE_UNAVAILABLE', 'The voice server did not answer in time.');
    if (answer.error || !answer.sdpAnswer) throw new AppError('AI_PROVIDER_ERROR', answer.error ?? 'The test call failed.');
    await this.audit.log(s, companyId, { action: 'ai.voice_test', targetType: 'ai_settings', targetId: companyId, summary: `Test call to the AI voice agent of ${c.name}` });
    return { testId, sdpAnswer: answer.sdpAnswer };
  }

  async test(companyId: string, testId: string): Promise<VoiceTestState> {
    const r = await this.bus.readTest(testId);
    if (!r || r.companyId !== companyId) throw notFound('Test call');
    const { companyId: _ignored, ...state } = r;
    void _ignored;
    return state;
  }

  async hangupTest(companyId: string, testId: string): Promise<{ ok: true }> {
    const r = await this.bus.readTest(testId);
    if (!r || r.companyId !== companyId) throw notFound('Test call');
    await this.bus.control({ action: 'hangup', testId });
    return { ok: true };
  }
}
