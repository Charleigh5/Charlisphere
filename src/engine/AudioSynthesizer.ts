/**
 * AudioSynthesizer.ts
 * Web Audio API procedural sound synthesis for spatial navigation, layout transitions, and memory ambience.
 */

import { SpatialAudioProcessor } from './SpatialAudioProcessor';

export class AudioSynthesizer {
  private static ctx: AudioContext | null = null;
  private static isMuted = false;

  private static getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public static toggleMute(): boolean {
    return SpatialAudioProcessor.toggleMute();
  }

  public static setMuted(muted: boolean): void {
    SpatialAudioProcessor.setMuted(muted);
  }

  public static getMuted(): boolean {
    return SpatialAudioProcessor.getMuted();
  }

  /**
   * Layout Transformation Harmonic Sweep
   */
  public static playLayoutSwoosh(modeIndex: number): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const baseFreqs = [220, 277.18, 329.63, 440];
    const freq = baseFreqs[modeIndex % baseFreqs.length] || 330;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 0.8, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + 0.35);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, ctx.currentTime);
    filter.frequency.linearRampToValueAtTime(2400, ctx.currentTime + 0.2);

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.46);
  }

  /**
   * Card Selection Glass Chime (Spatialized if positions provided)
   */
  public static playCardSelect(
    hue: number = 200,
    itemPos?: [number, number, number],
    cameraPos?: [number, number, number]
  ): void {
    if (this.isMuted) return;

    if (itemPos && cameraPos) {
      SpatialAudioProcessor.playSpatialCardSelect(itemPos, cameraPos, hue);
      return;
    }

    const ctx = this.getContext();
    if (!ctx) return;

    // Pitch mapped to color hue
    const noteFreq = 440 * Math.pow(2, ((hue % 360) - 180) / 360);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(noteFreq, ctx.currentTime);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.31);

    // Haptic feedback trigger if available
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(10);
      } catch {}
    }
  }

  /**
   * Search / Lasso Filter Shimmer
   */
  public static playSearchFilter(): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(1320, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  }

  /**
   * Modal Open Procedural Ping
   */
  public static playModalOpen(): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.18); // G5

    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.23);
  }

  /**
   * VR Immersion Spatial Teleport Sound
   */
  public static playVREnter(): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.5);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(4000, ctx.currentTime + 0.4);

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.56);
  }

  /**
   * Focus Mode Automated Camera Flight Harmonic Swoosh
   * Directionally pitched frequency sweep for next/prev memory transitions.
   */
  public static playFocusTransitionFlight(
    direction: 'next' | 'prev' | 'direct' = 'next',
    targetHue: number = 210
  ): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const baseFreq = 260 * Math.pow(2, ((targetHue % 360) - 180) / 480);
    const startFreq = direction === 'prev' ? baseFreq * 1.35 : baseFreq * 0.75;
    const endFreq = direction === 'prev' ? baseFreq * 0.75 : baseFreq * 1.35;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + 0.45);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime((startFreq + endFreq) * 0.5, ctx.currentTime);
    filter.Q.setValueAtTime(2.5, ctx.currentTime);

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.52);
  }
}

