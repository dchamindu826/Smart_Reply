/**
 * Whether the AI voice agent may answer a company's calls right now, and when.
 * The agent is part of the AI add-on that LUMI AI activates; the system admin turns the voice
 * bot on and sets the Gemini key. Managers and staff cannot change any of this.
 */
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { aiAddons, aiBotSettings } from '../db/schema';
import { InjectDb } from '../infra/db';
import { Platform } from '../meta/platform';

export type VoiceAnswerWhen = 'always' | 'after_hours' | 'no_answer';

@Injectable()
export class VoicePolicy {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly platform: Platform
  ) {}

  /** The company's answer rule, or null when the voice agent is not available. */
  async when(companyId: string): Promise<VoiceAnswerWhen | null> {
    const [addon] = await this.db.select().from(aiAddons).where(eq(aiAddons.companyId, companyId)).limit(1);
    if (!addon || addon.status !== 'active') return null;
    if (addon.activeUntil && addon.activeUntil.getTime() <= Date.now()) return null;
    const [st] = await this.db
      .select({ on: aiBotSettings.voiceBotEnabled, when: aiBotSettings.voiceAnswerWhen })
      .from(aiBotSettings)
      .where(eq(aiBotSettings.companyId, companyId))
      .limit(1);
    if (!st?.on) return null;
    const p = await this.platform.get();
    if (p.ai.globalOff || !p.ai.geminiApiKey) return null;
    return st.when;
  }
}
