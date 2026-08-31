/**
 * SpatialAudioProcessor.ts
 * 3D Spatial Audio Engine powered by the Web Audio API.
 * Calculates real-time 3D panner positioning, HRTF spatialization, dynamic distance attenuation,
 * air-absorption lowpass filtering, and proximity resonance based on Three.js camera kinematics
 * and the 3D coordinates of focused photo memory items.
 */

import { PhotoMemoryItem } from '../types';

export interface SpatialAudioTelemetry {
  listenerPosition: [number, number, number];
  focusedItemPosition: [number, number, number] | null;
  distanceToFocus: number;
  stereoPan: number; // -1.0 (hard left) to +1.0 (hard right)
  distanceGain: number; // 0.0 to 1.0
  filterCutoffHz: number; // Lowpass acoustic cutoff
  isResonating: boolean;
  isMuted: boolean;
}

export interface SpatialVector3 {
  x: number;
  y: number;
  z: number;
}

export class SpatialAudioProcessor {
  private static ctx: AudioContext | null = null;
  private static isMuted = false;

  // Active continuous proximity resonance nodes
  private static resonanceOsc: OscillatorNode | null = null;
  private static resonanceSubOsc: OscillatorNode | null = null;
  private static resonanceFilter: BiquadFilterNode | null = null;
  private static resonanceGain: GainNode | null = null;
  private static resonancePanner: PannerNode | StereoPannerNode | null = null;
  private static resonanceStereoPanner: StereoPannerNode | null = null;
  private static activeResonanceItemId: string | null = null;

  // Master Spatial Gain
  private static masterGain: GainNode | null = null;

  // Current Telemetry
  private static telemetry: SpatialAudioTelemetry = {
    listenerPosition: [0, 0, 1200],
    focusedItemPosition: null,
    distanceToFocus: 0,
    stereoPan: 0,
    distanceGain: 1.0,
    filterCutoffHz: 14000,
    isResonating: false,
    isMuted: false,
  };

  /**
   * Initializes or returns the global Web Audio API AudioContext
   */
  public static getContext(): AudioContext | null {
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
    if (this.ctx && !this.masterGain) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 1.0, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  public static toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    this.telemetry.isMuted = this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : 1.0, this.ctx.currentTime, 0.05);
    }
    return this.isMuted;
  }

  public static setMuted(muted: boolean): void {
    this.isMuted = muted;
    this.telemetry.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 1.0, this.ctx.currentTime, 0.05);
    }
  }

  public static getMuted(): boolean {
    return this.isMuted;
  }

  public static getTelemetry(): SpatialAudioTelemetry {
    return { ...this.telemetry };
  }

  /**
   * Calculates Euclidean distance in 3D space between two points
   */
  public static computeDistance(
    p1: [number, number, number] | SpatialVector3,
    p2: [number, number, number] | SpatialVector3
  ): number {
    const x1 = Array.isArray(p1) ? p1[0] : p1.x;
    const y1 = Array.isArray(p1) ? p1[1] : p1.y;
    const z1 = Array.isArray(p1) ? p1[2] : p1.z;

    const x2 = Array.isArray(p2) ? p2[0] : p2.x;
    const y2 = Array.isArray(p2) ? p2[1] : p2.y;
    const z2 = Array.isArray(p2) ? p2[2] : p2.z;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Computes the normalized stereo panning (-1.0 left to +1.0 right)
   * of a target 3D point relative to the camera's Cartesian position and orientation vectors.
   */
  public static computeStereoPan(
    itemPos: [number, number, number] | SpatialVector3,
    cameraPos: [number, number, number] | SpatialVector3,
    cameraForward: SpatialVector3 = { x: 0, y: 0, z: -1 },
    cameraUp: SpatialVector3 = { x: 0, y: 1, z: 0 }
  ): number {
    const ix = Array.isArray(itemPos) ? itemPos[0] : itemPos.x;
    const iy = Array.isArray(itemPos) ? itemPos[1] : itemPos.y;
    const iz = Array.isArray(itemPos) ? itemPos[2] : itemPos.z;

    const cx = Array.isArray(cameraPos) ? cameraPos[0] : cameraPos.x;
    const cy = Array.isArray(cameraPos) ? cameraPos[1] : cameraPos.y;
    const cz = Array.isArray(cameraPos) ? cameraPos[2] : cameraPos.z;

    // Direction vector from camera to sound item
    const dx = ix - cx;
    const dy = iy - cy;
    const dz = iz - cz;

    // Compute Camera Right vector: R = Forward x Up
    const rx = cameraForward.y * cameraUp.z - cameraForward.z * cameraUp.y;
    const ry = cameraForward.z * cameraUp.x - cameraForward.x * cameraUp.z;
    const rz = cameraForward.x * cameraUp.y - cameraForward.y * cameraUp.x;

    const rLen = Math.hypot(rx, ry, rz) || 1;
    const nRx = rx / rLen;
    const nRy = ry / rLen;
    const nRz = rz / rLen;

    const fLen = Math.hypot(cameraForward.x, cameraForward.y, cameraForward.z) || 1;
    const nFx = cameraForward.x / fLen;
    const nFy = cameraForward.y / fLen;
    const nFz = cameraForward.z / fLen;

    // Project onto camera local right and forward axes
    const localX = dx * nRx + dy * nRy + dz * nRz;
    const localZ = dx * nFx + dy * nFy + dz * nFz;

    const horizontalDist = Math.hypot(localX, localZ);
    if (horizontalDist < 1e-4) return 0;

    const pan = localX / horizontalDist;
    return Math.max(-1.0, Math.min(1.0, pan));
  }

  /**
   * Distance Attenuation Curve:
   * Smoothly scales volume from 1.0 (close focus at ~250-350 units) down to minGain (0.04) at ~2500+ units.
   */
  public static computeDistanceAttenuation(
    distance: number,
    minDistance = 300,
    maxDistance = 2500,
    rolloff = 1.15
  ): number {
    if (distance <= minDistance) return 1.0;
    if (distance >= maxDistance) return 0.04;

    const normalized = (distance - minDistance) / (maxDistance - minDistance);
    const attenuation = Math.pow(1.0 - normalized, rolloff);
    return Math.max(0.04, Math.min(1.0, attenuation));
  }

  /**
   * Distance-based Lowpass Filter Cutoff (Air Absorption Simulation):
   * Sound becomes warmer and high frequencies attenuate as distance increases.
   */
  public static computeAirAbsorptionCutoff(
    distance: number,
    closeCutoff = 16000,
    farCutoff = 850
  ): number {
    const d = Math.max(0, distance);
    const factor = 450 / (450 + d);
    const cutoff = farCutoff + (closeCutoff - farCutoff) * Math.pow(factor, 0.75);
    return Math.max(600, Math.min(18000, cutoff));
  }

  /**
   * Updates the global Web Audio API AudioListener with the Three.js camera position & orientation
   */
  public static updateListener(
    cameraPos: SpatialVector3 | [number, number, number],
    cameraForward: SpatialVector3 = { x: 0, y: 0, z: -1 },
    cameraUp: SpatialVector3 = { x: 0, y: 1, z: 0 }
  ): void {
    const cx = Array.isArray(cameraPos) ? cameraPos[0] : cameraPos.x;
    const cy = Array.isArray(cameraPos) ? cameraPos[1] : cameraPos.y;
    const cz = Array.isArray(cameraPos) ? cameraPos[2] : cameraPos.z;

    this.telemetry.listenerPosition = [cx, cy, cz];

    const ctx = this.getContext();
    if (!ctx) return;

    const listener = ctx.listener;
    if (!listener) return;

    const time = ctx.currentTime;

    // Update Listener Position (supporting modern AudioParam and legacy methods)
    if (listener.positionX && typeof listener.positionX.setTargetAtTime === 'function') {
      listener.positionX.setTargetAtTime(cx, time, 0.03);
      listener.positionY.setTargetAtTime(cy, time, 0.03);
      listener.positionZ.setTargetAtTime(cz, time, 0.03);
    } else if (typeof listener.setPosition === 'function') {
      listener.setPosition(cx, cy, cz);
    }

    // Update Listener Orientation
    if (listener.forwardX && typeof listener.forwardX.setTargetAtTime === 'function') {
      listener.forwardX.setTargetAtTime(cameraForward.x, time, 0.03);
      listener.forwardY.setTargetAtTime(cameraForward.y, time, 0.03);
      listener.forwardZ.setTargetAtTime(cameraForward.z, time, 0.03);
      listener.upX.setTargetAtTime(cameraUp.x, time, 0.03);
      listener.upY.setTargetAtTime(cameraUp.y, time, 0.03);
      listener.upZ.setTargetAtTime(cameraUp.z, time, 0.03);
    } else if (typeof listener.setOrientation === 'function') {
      listener.setOrientation(
        cameraForward.x,
        cameraForward.y,
        cameraForward.z,
        cameraUp.x,
        cameraUp.y,
        cameraUp.z
      );
    }
  }

  /**
   * Dynamically tracks the focused photo memory item in 3D space,
   * calculating distance, stereo panning, attenuation, and proximity drone modulation.
   */
  public static updateFocusedItemSpatialAudio(
    cameraPos: [number, number, number] | SpatialVector3,
    focusedPos: [number, number, number] | null,
    focusedItem: PhotoMemoryItem | null,
    cameraForward?: SpatialVector3,
    cameraUp?: SpatialVector3
  ): void {
    if (!focusedPos || !focusedItem) {
      this.telemetry.focusedItemPosition = null;
      this.telemetry.distanceToFocus = 0;
      this.telemetry.stereoPan = 0;
      this.telemetry.isResonating = false;
      this.stopFocusResonance();
      return;
    }

    const dist = this.computeDistance(cameraPos, focusedPos);
    const forward = cameraForward || {
      x: focusedPos[0] - (Array.isArray(cameraPos) ? cameraPos[0] : cameraPos.x),
      y: focusedPos[1] - (Array.isArray(cameraPos) ? cameraPos[1] : cameraPos.y),
      z: focusedPos[2] - (Array.isArray(cameraPos) ? cameraPos[2] : cameraPos.z),
    };
    const up = cameraUp || { x: 0, y: 1, z: 0 };

    const pan = this.computeStereoPan(focusedPos, cameraPos, forward, up);
    const gain = this.computeDistanceAttenuation(dist, 280, 2200);
    const cutoff = this.computeAirAbsorptionCutoff(dist);

    this.telemetry.focusedItemPosition = [focusedPos[0], focusedPos[1], focusedPos[2]];
    this.telemetry.distanceToFocus = Math.round(dist);
    this.telemetry.stereoPan = Number(pan.toFixed(3));
    this.telemetry.distanceGain = Number(gain.toFixed(3));
    this.telemetry.filterCutoffHz = Math.round(cutoff);
    this.telemetry.isResonating = !this.isMuted;

    // Maintain continuous ambient resonance drone if focused
    if (!this.resonanceOsc || this.activeResonanceItemId !== focusedItem.id) {
      this.startFocusResonance(focusedItem, focusedPos, cameraPos);
    }

    this.modulateFocusResonance(pan, gain, cutoff, dist);
  }

  /**
   * Starts a continuous, warm harmonic proximity resonance keyed to the focused item's color hue
   */
  public static startFocusResonance(
    item: PhotoMemoryItem,
    itemPos: [number, number, number],
    cameraPos: [number, number, number] | SpatialVector3
  ): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    this.stopFocusResonance();

    this.activeResonanceItemId = item.id;
    this.telemetry.isResonating = true;

    // Pitch mapped musically to color hue (root in 110-220Hz range for pleasing ambient drone)
    const basePitch = 130.81 * Math.pow(2, ((item.hue % 360) / 360)); // C3 to C4 scale
    const fifthPitch = basePitch * 1.5; // Perfect fifth overtone

    // Oscillators
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(basePitch, ctx.currentTime);
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(fifthPitch, ctx.currentTime);

    // Filter
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, ctx.currentTime);
    filter.Q.setValueAtTime(1.8, ctx.currentTime);

    // Gain
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.04, ctx.currentTime + 0.3);

    // Stereo Panner or 3D Panner
    let stereoPanner: StereoPannerNode | null = null;
    if (typeof ctx.createStereoPanner === 'function') {
      stereoPanner = ctx.createStereoPanner();
      stereoPanner.pan.setValueAtTime(0, ctx.currentTime);
      gain.connect(filter);
      filter.connect(stereoPanner);
      if (this.masterGain) {
        stereoPanner.connect(this.masterGain);
      } else {
        stereoPanner.connect(ctx.destination);
      }
    } else {
      gain.connect(filter);
      if (this.masterGain) {
        filter.connect(this.masterGain);
      } else {
        filter.connect(ctx.destination);
      }
    }

    osc1.connect(gain);
    osc2.connect(gain);

    osc1.start();
    osc2.start();

    this.resonanceOsc = osc1;
    this.resonanceSubOsc = osc2;
    this.resonanceFilter = filter;
    this.resonanceGain = gain;
    this.resonanceStereoPanner = stereoPanner;
  }

  /**
   * Modulates the active focus resonance parameters in real-time as camera orbits
   */
  private static modulateFocusResonance(
    pan: number,
    distanceGain: number,
    filterCutoff: number,
    distance: number
  ): void {
    if (!this.ctx || !this.resonanceGain || !this.resonanceFilter) return;

    const time = this.ctx.currentTime;
    const targetGain = this.isMuted ? 0.0001 : Math.max(0.0001, 0.055 * distanceGain);

    this.resonanceGain.gain.setTargetAtTime(targetGain, time, 0.08);
    this.resonanceFilter.frequency.setTargetAtTime(filterCutoff, time, 0.08);

    if (this.resonanceStereoPanner) {
      this.resonanceStereoPanner.pan.setTargetAtTime(pan, time, 0.05);
    }
  }

  /**
   * Smoothly fades out and stops the focus proximity resonance
   */
  public static stopFocusResonance(): void {
    if (!this.resonanceOsc) return;

    const osc1 = this.resonanceOsc;
    const osc2 = this.resonanceSubOsc;
    const gain = this.resonanceGain;
    const ctx = this.ctx;

    this.resonanceOsc = null;
    this.resonanceSubOsc = null;
    this.resonanceFilter = null;
    this.resonanceGain = null;
    this.resonanceStereoPanner = null;
    this.activeResonanceItemId = null;
    this.telemetry.isResonating = false;

    if (gain && ctx) {
      try {
        gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
        setTimeout(() => {
          try {
            osc1.stop();
            osc2?.stop();
            osc1.disconnect();
            osc2?.disconnect();
          } catch {}
        }, 150);
      } catch {
        try {
          osc1.stop();
          osc2?.stop();
        } catch {}
      }
    }
  }

  /**
   * Plays a 3D spatialized card selection chime panned and attenuated in 3D space
   */
  public static playSpatialCardSelect(
    itemPos: [number, number, number],
    cameraPos: [number, number, number] | SpatialVector3,
    hue: number,
    cameraForward?: SpatialVector3,
    cameraUp?: SpatialVector3
  ): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const dist = this.computeDistance(cameraPos, itemPos);
    const pan = this.computeStereoPan(itemPos, cameraPos, cameraForward, cameraUp);
    const distanceGain = this.computeDistanceAttenuation(dist, 250, 3000);
    const cutoff = this.computeAirAbsorptionCutoff(dist);

    const noteFreq = 440 * Math.pow(2, ((hue % 360) - 180) / 360);

    const osc = ctx.createOscillator();
    const oscHarmonic = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(noteFreq, ctx.currentTime);

    oscHarmonic.type = 'sine';
    oscHarmonic.frequency.setValueAtTime(noteFreq * 2, ctx.currentTime);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, ctx.currentTime);

    const baseVol = 0.13 * distanceGain;
    gain.gain.setValueAtTime(Math.max(0.0001, baseVol), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.38);

    osc.connect(gain);
    oscHarmonic.connect(gain);
    gain.connect(filter);

    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(pan, ctx.currentTime);
      filter.connect(panner);
      if (this.masterGain) {
        panner.connect(this.masterGain);
      } else {
        panner.connect(ctx.destination);
      }
    } else {
      if (this.masterGain) {
        filter.connect(this.masterGain);
      } else {
        filter.connect(ctx.destination);
      }
    }

    osc.start();
    oscHarmonic.start();
    osc.stop(ctx.currentTime + 0.40);
    oscHarmonic.stop(ctx.currentTime + 0.40);

    // Haptic trigger
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(10);
      } catch {}
    }
  }

  /**
   * Plays a 3D spatialized orbital teleport / focus transition swoosh
   */
  public static playSpatialFocusSwoosh(
    targetPos: [number, number, number],
    cameraPos: [number, number, number] | SpatialVector3
  ): void {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const dist = this.computeDistance(cameraPos, targetPos);
    const pan = this.computeStereoPan(targetPos, cameraPos);
    const distanceGain = this.computeDistanceAttenuation(dist, 200, 3500);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.28);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, ctx.currentTime);
    filter.frequency.linearRampToValueAtTime(2800, ctx.currentTime + 0.25);
    filter.Q.setValueAtTime(1.5, ctx.currentTime);

    const vol = Math.max(0.0001, 0.09 * distanceGain);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);

    osc.connect(filter);
    filter.connect(gain);

    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      // Dynamic spatial pan sweep as camera rushes toward target
      panner.pan.setValueAtTime(pan, ctx.currentTime);
      panner.pan.linearRampToValueAtTime(0, ctx.currentTime + 0.3);
      gain.connect(panner);
      if (this.masterGain) {
        panner.connect(this.masterGain);
      } else {
        panner.connect(ctx.destination);
      }
    } else {
      if (this.masterGain) {
        gain.connect(this.masterGain);
      } else {
        gain.connect(ctx.destination);
      }
    }

    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  }
}
