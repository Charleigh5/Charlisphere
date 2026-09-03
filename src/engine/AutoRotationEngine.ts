/**
 * AutoRotationEngine.ts
 * PhotoSphere 3D Spatial Memory Matrix
 *
 * Implements silky-smooth, ambient auto-rotation with gentle cubic ramp-in,
 * interaction-aware pausing, idle resumption, and subtle organic pitch oscillation.
 */

import { AutoRotationStatus } from '../types';

export interface AutoRotationConfig {
  enabled: boolean;
  idleDelayMs: number; // Inactivity threshold before resuming (default: 4000ms)
  baseSpeedRadPerSec: number; // Slow ambient orbit speed (default: 0.048 rad/s, ~2.75 deg/s)
  rampDurationMs: number; // Smooth acceleration period (default: 1600ms)
  enableBreathingTilt: boolean; // Subtle polar breathing wave
  panDecayRate: number; // Rate at which displaced pan offset returns to origin
}

export interface AutoRotationEvaluation {
  status: AutoRotationStatus;
  isActive: boolean;
  rampFactor: number; // 0.0 to 1.0 (Hermite smoothed)
  angularStep: number; // Radians to advance theta this frame
  remainingIdleMs: number; // Milliseconds until auto-orbit resumes
  tiltOscillationStep: number; // Subtle organic pitch delta
}

export const DEFAULT_AUTO_ROTATION_CONFIG: AutoRotationConfig = {
  enabled: true,
  idleDelayMs: 4000,
  baseSpeedRadPerSec: 0.048,
  rampDurationMs: 1600,
  enableBreathingTilt: true,
  panDecayRate: 0.45,
};

/**
 * Smooth Hermite interpolation (smoothstep) between 0 and 1
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Evaluates current auto-rotation state for the active frame.
 * Pure function designed for both 60-120 FPS continuous render loop and unit test verification.
 */
export function evaluateAutoRotation(params: {
  enabled: boolean;
  idleDurationMs: number;
  deltaSeconds: number;
  timestamp: number;
  isUserInteracting: boolean;
  isFocusModeActive: boolean;
  isModalOpen?: boolean;
  config?: Partial<AutoRotationConfig>;
}): AutoRotationEvaluation {
  const cfg: AutoRotationConfig = {
    ...DEFAULT_AUTO_ROTATION_CONFIG,
    ...params.config,
  };

  // 1. Manually disabled by user
  if (!params.enabled || !cfg.enabled) {
    return {
      status: 'DISABLED',
      isActive: false,
      rampFactor: 0,
      angularStep: 0,
      remainingIdleMs: 0,
      tiltOscillationStep: 0,
    };
  }

  // 2. Paused due to active user interaction (dragging, pinching, panning, mouse wheeling, lassoing)
  if (params.isUserInteracting) {
    return {
      status: 'PAUSED_INTERACTION',
      isActive: false,
      rampFactor: 0,
      angularStep: 0,
      remainingIdleMs: cfg.idleDelayMs,
      tiltOscillationStep: 0,
    };
  }

  // 3. Paused due to close-up focus inspection or active overlay modal
  if (params.isFocusModeActive || params.isModalOpen) {
    return {
      status: 'PAUSED_FOCUS',
      isActive: false,
      rampFactor: 0,
      angularStep: 0,
      remainingIdleMs: cfg.idleDelayMs,
      tiltOscillationStep: 0,
    };
  }

  // 4. Inactivity cooldown period has not elapsed yet
  if (params.idleDurationMs < cfg.idleDelayMs) {
    const remaining = Math.max(0, cfg.idleDelayMs - params.idleDurationMs);
    return {
      status: 'PAUSED_INTERACTION',
      isActive: false,
      rampFactor: 0,
      angularStep: 0,
      remainingIdleMs: remaining,
      tiltOscillationStep: 0,
    };
  }

  // 5. Active Ambient Auto-Rotation with smooth Hermite ramp-in acceleration
  const timeSinceIdleTrigger = params.idleDurationMs - cfg.idleDelayMs;
  const rampFactor = smoothstep(0, cfg.rampDurationMs, timeSinceIdleTrigger);
  const angularStep = cfg.baseSpeedRadPerSec * params.deltaSeconds * rampFactor;

  // Gentle sinusoidal breathing wave in polar inclination (~20s period)
  let tiltOscillationStep = 0;
  if (cfg.enableBreathingTilt) {
    tiltOscillationStep = Math.sin(params.timestamp * 0.00032) * 0.00018 * rampFactor;
  }

  return {
    status: 'ACTIVE',
    isActive: true,
    rampFactor,
    angularStep,
    remainingIdleMs: 0,
    tiltOscillationStep,
  };
}
