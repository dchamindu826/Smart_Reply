/**
 * WhatsApp-Style Sound Effects Engine
 * Built using Web Audio API for zero-latency, offline reliability, and zero external asset dependencies.
 */

class SoundEffectsEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private ringtoneInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Check localStorage if available
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('smart_reply_sound_muted');
        if (stored !== null) {
          this.isMuted = stored === 'true';
        }
      } catch {
        // Ignore localStorage error
      }
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!AudioCtx) return null;

      if (!this.ctx || this.ctx.state === 'closed') {
        this.ctx = new AudioCtx();
      }

      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }

      return this.ctx;
    } catch {
      return null;
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('smart_reply_sound_muted', String(muted));
      } catch {
        // Ignore
      }
    }
    if (muted) {
      this.stopCallRingtone();
    }
  }

  public toggleMuted(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  /**
   * WhatsApp Outgoing Message Sent Sound (Crisp Swoosh / Pop-Tick)
   * Plays when staff or user sends a reply/message in chat.
   */
  public playSentSound() {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Crisp fast pitch-envelope chirp
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(1800, now + 0.04);
      osc.frequency.exponentialRampToValueAtTime(1400, now + 0.07);

      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch {
      // AudioContext auto-play restriction fallback
    }
  }

  /**
   * WhatsApp Incoming Message Received Sound (Iconic Droplet Pop / Chime)
   * Plays when a new message or reply is received from a customer in chat.
   */
  public playReceivedSound() {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Note 1: E6 (1318 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1046.5, now); // C6
      osc1.frequency.exponentialRampToValueAtTime(1318.5, now + 0.06); // E6

      gain1.gain.setValueAtTime(0.18, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.16);

      // Note 2: Harmonic overtone (2093 Hz) with subtle stereo feel
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(2093, now + 0.03); // C7

      gain2.gain.setValueAtTime(0.08, now + 0.03);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      osc2.start(now + 0.03);
      osc2.stop(now + 0.14);
    } catch {
      // Autoplay fallback
    }
  }

  /**
   * WhatsApp Incoming Voice Call Ringtone Melody
   * Repeated chime sequence: D5 -> G5 -> E5 with gentle marimba resonance.
   */
  public playCallChime() {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Note 1: D5 (587.33 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Note 2: G5 (783.99 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(783.99, now + 0.15);
      gain2.gain.setValueAtTime(0.14, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.55);

      // Note 3: B5 (987.77 Hz)
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(987.77, now + 0.32);
      gain3.gain.setValueAtTime(0.15, now + 0.32);
      gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
      osc3.connect(gain3);
      gain3.connect(ctx.destination);
      osc3.start(now + 0.32);
      osc3.stop(now + 0.75);

      // Note 4: High resolution chime E6 (1318.5 Hz)
      const osc4 = ctx.createOscillator();
      const gain4 = ctx.createGain();
      osc4.type = 'sine';
      osc4.frequency.setValueAtTime(1318.5, now + 0.5);
      gain4.gain.setValueAtTime(0.12, now + 0.5);
      gain4.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
      osc4.connect(gain4);
      gain4.connect(ctx.destination);
      osc4.start(now + 0.5);
      osc4.stop(now + 0.95);
    } catch {
      // Autoplay fallback
    }
  }

  /**
   * Starts loop of incoming call ringtone
   */
  public startCallRingtone(intervalMs: number = 2400) {
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
    }
    this.playCallChime();
    this.ringtoneInterval = setInterval(() => {
      this.playCallChime();
    }, intervalMs);
  }

  /**
   * Stops loop of incoming call ringtone
   */
  public stopCallRingtone() {
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
  }

  /**
   * WhatsApp Call Connected / Answered Sound
   */
  public playCallAnswerSound() {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
    } catch {
      // Fallback
    }
  }

  /**
   * WhatsApp Call Ended / Declined Disconnect Tone
   */
  public playCallEndSound() {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Descending two-tone beep (440Hz -> 330Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(440, now);
      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.18);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(329.63, now + 0.18);
      gain2.gain.setValueAtTime(0.12, now + 0.18);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.18);
      osc2.stop(now + 0.38);
    } catch {
      // Fallback
    }
  }

  /**
   * WhatsApp Voice Note Recording Start Beep
   */
  public playRecordStartBeep() {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.08); // D6

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.1);
    } catch {
      // Fallback
    }
  }

  /**
   * WhatsApp Discard / Trash Sound
   */
  public playTrashSound() {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.1);

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch {
      // Fallback
    }
  }
}

// Export singleton instance
export const sounds = new SoundEffectsEngine();

// Convenience helper functions
export const playSentSound = () => sounds.playSentSound();
export const playReceivedSound = () => sounds.playReceivedSound();
export const playCallChime = () => sounds.playCallChime();
export const startCallRingtone = (intervalMs?: number) => sounds.startCallRingtone(intervalMs);
export const stopCallRingtone = () => sounds.stopCallRingtone();
export const playCallAnswerSound = () => sounds.playCallAnswerSound();
export const playCallEndSound = () => sounds.playCallEndSound();
export const playRecordStartBeep = () => sounds.playRecordStartBeep();
export const playTrashSound = () => sounds.playTrashSound();
