// Web Audio API Ringtone & Chime Synthesizer
// Generates realistic outgoing ringback tones, incoming call chimes, and call status beeps without external files

class CallAudioService {
  private ctx: AudioContext | null = null;
  private loopTimer: any = null;
  private activeNodes: Array<{ stop: () => void }> = [];

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public stopAll(): void {
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    for (const node of this.activeNodes) {
      try {
        node.stop();
      } catch {}
    }
    this.activeNodes = [];
  }

  /**
   * Outgoing ring tone: standard smooth telephone chime (440Hz + 480Hz)
   * Pattern: 1.5s tone, 2.5s silence, looping
   */
  public playOutgoingRing(): void {
    this.stopAll();
    const playBurst = () => {
      try {
        const ctx = this.getContext();
        const now = ctx.currentTime;

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(440, now);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(480, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
        gain.gain.setValueAtTime(0.08, now + 1.4);
        gain.gain.linearRampToValueAtTime(0, now + 1.5);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.5);
        osc2.stop(now + 1.5);

        this.activeNodes.push({
          stop: () => {
            try {
              osc1.stop();
              osc2.stop();
            } catch {}
          },
        });
      } catch {}
    };

    playBurst();
    this.loopTimer = setInterval(playBurst, 4000);
  }

  /**
   * Incoming ring tone: modern melodic Telegram-style marimba chime sequence
   * Loops every 2.8 seconds
   */
  public playIncomingRing(): void {
    this.stopAll();
    const notes = [
      { f: 523.25, time: 0.0, dur: 0.18 }, // C5
      { f: 659.25, time: 0.2, dur: 0.18 }, // E5
      { f: 783.99, time: 0.4, dur: 0.22 }, // G5
      { f: 1046.5, time: 0.65, dur: 0.35 }, // C6
      { f: 783.99, time: 1.05, dur: 0.18 }, // G5
      { f: 1046.5, time: 1.25, dur: 0.4 },  // C6
    ];

    const playSequence = () => {
      try {
        const ctx = this.getContext();
        const start = ctx.currentTime;

        notes.forEach(({ f, time, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(f, start + time);

          const noteStart = start + time;
          gain.gain.setValueAtTime(0, noteStart);
          gain.gain.linearRampToValueAtTime(0.12, noteStart + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, noteStart + dur);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(noteStart);
          osc.stop(noteStart + dur);

          this.activeNodes.push({
            stop: () => {
              try {
                osc.stop();
              } catch {}
            },
          });
        });
      } catch {}
    };

    playSequence();
    this.loopTimer = setInterval(playSequence, 2800);
  }

  /**
   * Call connected chime: friendly ascending two-tone
   */
  public playConnectedChime(): void {
    this.stopAll();
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(880, now + 0.12);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
      gain.gain.setValueAtTime(0.12, now + 0.22);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch {}
  }

  /**
   * Call ended tone: 3 short descending disconnect beeps
   */
  public playEndBeep(): void {
    this.stopAll();
    try {
      const ctx = this.getContext();
      const start = ctx.currentTime;
      const tones = [587.33, 440, 329.63]; // D5, A4, E4

      tones.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = start + idx * 0.12;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.1, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t);
        osc.stop(t + 0.1);
      });
    } catch {}
  }
}

export const callAudio = new CallAudioService();
