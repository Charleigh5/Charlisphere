/**
 * SpatialTransitionEngine.ts
 * High-performance GSAP-driven 3D coordinate morphing and cinematic camera transitions
 * between FIBONACCI_SPHERE, DNA_HELIX, GALAXY_CONSTELLATION, and CUBIC_MATRIX spatial formations.
 */

import gsap from 'gsap';
import { Layout3DMode, PhotoMemoryItem } from '../types';

export interface CameraTransitionPreset {
  targetPhi: number;
  radiusMultiplier: number;
  thetaDelta?: number;
  duration: number;
  ease: string;
  description: string;
}

export interface TransitionState {
  isTransitioning: boolean;
  fromMode: Layout3DMode | null;
  toMode: Layout3DMode;
  progress: number; // 0.0 to 1.0
  activeItemCount: number;
}

export interface TransitionHandle {
  kill: () => void;
  isRunning: () => boolean;
  getProgress: () => number;
  seek: (progress: number) => void;
  timeline: gsap.core.Timeline;
}

export class SpatialTransitionEngine {
  /**
   * Human-readable display titles for each spatial formation
   */
  public static readonly LAYOUT_TITLES: Record<Layout3DMode, string> = {
    FIBONACCI_SPHERE: 'Fibonacci Sphere',
    DNA_HELIX: 'DNA Helix',
    GALAXY_CONSTELLATION: 'Galaxy Constellation',
    CUBIC_MATRIX: 'Cubic Matrix',
  };

  /**
   * Layout icons / emoji glyphs for visual feedback
   */
  public static readonly LAYOUT_GLYPHS: Record<Layout3DMode, string> = {
    FIBONACCI_SPHERE: '🌐',
    DNA_HELIX: '🧬',
    GALAXY_CONSTELLATION: '🌌',
    CUBIC_MATRIX: '🧊',
  };

  /**
   * Camera choreography presets calibrated for each 3D geometry
   */
  public static readonly CAMERA_PRESETS: Record<Layout3DMode, CameraTransitionPreset> = {
    FIBONACCI_SPHERE: {
      targetPhi: Math.PI * 0.5, // Balanced equatorial orbit
      radiusMultiplier: 1.0,
      duration: 1.25,
      ease: 'power2.out',
      description: 'Equatorial spherical framing',
    },
    DNA_HELIX: {
      targetPhi: Math.PI * 0.44, // Gentle elevation to perceive vertical helix pitch
      radiusMultiplier: 1.18, // Zoom out to frame full vertical height
      duration: 1.35,
      ease: 'power2.out',
      description: 'Vertical parallax framing',
    },
    GALAXY_CONSTELLATION: {
      targetPhi: Math.PI * 0.32, // 35° top-down elevation to behold spiral galactic arms
      radiusMultiplier: 1.10,
      duration: 1.35,
      ease: 'power2.out',
      description: 'Top-down galactic disk perspective',
    },
    CUBIC_MATRIX: {
      targetPhi: Math.PI * 0.38, // Classic isometric 3D perspective
      thetaDelta: Math.PI * 0.25, // 45° corner diagonal rotation
      radiusMultiplier: 1.14,
      duration: 1.3,
      ease: 'power2.out',
      description: 'Isometric volumetric perspective',
    },
  };

  /**
   * Computes the shortest angular difference in radians between two angles,
   * preventing 360° spin artifacts when interpolating Euler rotations.
   */
  public static calculateShortestAngle(current: number, target: number): number {
    let diff = (target - current) % (2 * Math.PI);
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    return diff;
  }

  /**
   * Calculates a 3D parabolic expansion arc vector so cards bloom outward
   * gracefully during mid-flight instead of colliding in a straight line through the center (0,0,0).
   */
  public static calculateArcVector(
    startPos: [number, number, number],
    targetPos: [number, number, number],
    toMode: Layout3DMode,
    arcScale = 1.0
  ): [number, number, number] {
    // Chord vector between start and target
    const chordX = targetPos[0] - startPos[0];
    const chordY = targetPos[1] - startPos[1];
    const chordZ = targetPos[2] - startPos[2];
    const chordLen = Math.hypot(chordX, chordY, chordZ);

    // Midpoint vector from origin
    let midX = (startPos[0] + targetPos[0]) * 0.5;
    let midY = (startPos[1] + targetPos[1]) * 0.5;
    let midZ = (startPos[2] + targetPos[2]) * 0.5;
    let midDist = Math.hypot(midX, midY, midZ);

    // If path traverses directly through origin (midDist near zero), deflect outward perpendicularly to chord
    if (midDist < 1e-3 && chordLen > 1e-3) {
      // Pick non-collinear test vector
      const testX = Math.abs(chordX) < Math.abs(chordY) ? 1 : 0;
      const testY = Math.abs(chordX) < Math.abs(chordY) ? 0 : 1;
      const testZ = 0;

      // Cross product to get orthogonal unit vector
      const perpX = testY * chordZ - testZ * chordY;
      const perpY = testZ * chordX - testX * chordZ;
      const perpZ = testX * chordY - testY * chordX;
      const perpLen = Math.hypot(perpX, perpY, perpZ) || 1;

      midX = perpX / perpLen;
      midY = perpY / perpLen;
      midZ = perpZ / perpLen;
      midDist = 1;
    }

    const safeDist = midDist || 1;
    let normX = midX / safeDist;
    let normY = midY / safeDist;
    let normZ = midZ / safeDist;

    // Mode-specific expansion tailoring
    let magnitude = 120 * arcScale;

    switch (toMode) {
      case 'GALAXY_CONSTELLATION':
        // Flare primarily in horizontal plane with subtle vertical wave
        normY *= 0.4;
        magnitude = 140 * arcScale;
        break;
      case 'DNA_HELIX':
        // Flare radially away from central vertical spine (Y-axis)
        const radDist = Math.hypot(midX, midZ) || 1;
        normX = midX / radDist;
        normZ = midZ / radDist;
        normY = (Math.random() - 0.5) * 0.2;
        magnitude = 110 * arcScale;
        break;
      case 'CUBIC_MATRIX':
        // Volumetric burst outward
        magnitude = 130 * arcScale;
        break;
      case 'FIBONACCI_SPHERE':
      default:
        magnitude = 100 * arcScale;
        break;
    }

    return [normX * magnitude, normY * magnitude, normZ * magnitude];
  }

  /**
   * Computes a wave-propagation stagger delay based on item index and layout mode.
   * Creates a natural rippling cascade across the 3D surface.
   */
  public static getStaggerDelay(index: number, total: number, toMode: Layout3DMode): number {
    const safeTotal = Math.max(1, total);
    const normalized = index / safeTotal;
    const maxStagger = 0.38; // Maximum delay in seconds across the swarm

    switch (toMode) {
      case 'DNA_HELIX':
        // Cascade vertically along the ascending double helix
        return normalized * maxStagger;
      case 'GALAXY_CONSTELLATION':
        // Ripple outwards from the galactic core to the outer spiral arms
        return Math.sqrt(normalized) * maxStagger;
      case 'CUBIC_MATRIX':
        // Ripple symmetrically in volumetric clusters
        return (Math.sin(normalized * Math.PI) * 0.7 + normalized * 0.3) * maxStagger;
      case 'FIBONACCI_SPHERE':
      default:
        // Golden spiral ripple from North Pole to South Pole
        return normalized * maxStagger;
    }
  }

  /**
   * Orchestrates a full GSAP transition timeline for all 3D memory nodes,
   * animating coordinates, Euler rotations, and cinematic camera framing.
   */
  public static startTransition(options: {
    items: PhotoMemoryItem[];
    targetTransforms: { position: [number, number, number]; rotation: [number, number, number] }[];
    fromMode: Layout3DMode | null;
    toMode: Layout3DMode;
    cameraState: {
      radius: number;
      targetRadius: number;
      phi: number;
      targetPhi: number;
      theta: number;
      targetTheta: number;
    };
    baseCameraDistance: number;
    onProgress?: (progress: number) => void;
    onUpdate?: () => void;
    onComplete?: () => void;
  }): TransitionHandle {
    const {
      items,
      targetTransforms,
      fromMode,
      toMode,
      cameraState,
      baseCameraDistance,
      onProgress,
      onUpdate,
      onComplete,
    } = options;

    // Master GSAP Timeline
    const tl = gsap.timeline({
      onUpdate: () => {
        onProgress?.(tl.progress());
        onUpdate?.();
      },
      onComplete: () => {
        // Ensure all target values are finalized accurately
        for (let i = 0; i < items.length; i++) {
          if (targetTransforms[i]) {
            items[i].currentPos = [...targetTransforms[i].position];
            items[i].targetPos = [...targetTransforms[i].position];
            items[i].rotation = [...targetTransforms[i].rotation];
            items[i].targetRotation = [...targetTransforms[i].rotation];
          }
        }
        onProgress?.(1.0);
        onComplete?.();
      },
    });

    // 1. Cinematic Camera Choreography via GSAP
    const camPreset = this.CAMERA_PRESETS[toMode] || this.CAMERA_PRESETS.FIBONACCI_SPHERE;
    const targetRadius = Math.max(600, baseCameraDistance * camPreset.radiusMultiplier);

    tl.to(
      cameraState,
      {
        targetRadius,
        targetPhi: camPreset.targetPhi,
        targetTheta: camPreset.thetaDelta
          ? cameraState.targetTheta + camPreset.thetaDelta
          : cameraState.targetTheta,
        duration: camPreset.duration,
        ease: camPreset.ease,
      },
      0
    );

    // 2. Individual 3D Node Trajectory Interpolation via GSAP
    const itemCount = Math.min(items.length, targetTransforms.length);

    for (let i = 0; i < itemCount; i++) {
      const item = items[i];
      const targetTransform = targetTransforms[i];
      if (!targetTransform) continue;

      // Capture initial state at the start of transition
      const startPos: [number, number, number] = [
        item.currentPos[0],
        item.currentPos[1],
        item.currentPos[2],
      ];
      const targetPos: [number, number, number] = targetTransform.position;

      const startRot: [number, number, number] = [
        item.rotation[0],
        item.rotation[1],
        item.rotation[2],
      ];
      const targetRot: [number, number, number] = targetTransform.rotation;

      // Compute shortest Euler angular delta
      const deltaRotX = this.calculateShortestAngle(startRot[0], targetRot[0]);
      const deltaRotY = this.calculateShortestAngle(startRot[1], targetRot[1]);
      const deltaRotZ = this.calculateShortestAngle(startRot[2], targetRot[2]);

      // Calculate parabolic expansion arc
      const arcVec = this.calculateArcVector(startPos, targetPos, toMode);
      const delay = this.getStaggerDelay(i, itemCount, toMode);

      // Interpolation proxy object for GSAP
      const proxy = { progress: 0 };

      // Update target Pos/Rot references so render loop stays synchronized
      item.targetPos = [...targetPos];
      item.targetRotation = [...targetRot];

      tl.to(
        proxy,
        {
          progress: 1,
          duration: 1.15,
          delay,
          ease: 'power2.inOut',
          onUpdate: () => {
            const p = proxy.progress;
            // Parabolic curve: sin(p * PI) peaks at 1.0 when p = 0.5
            const arcFactor = Math.sin(p * Math.PI);

            // Interpolate position with outward arc bloom
            item.currentPos[0] = startPos[0] + (targetPos[0] - startPos[0]) * p + arcVec[0] * arcFactor;
            item.currentPos[1] = startPos[1] + (targetPos[1] - startPos[1]) * p + arcVec[1] * arcFactor;
            item.currentPos[2] = startPos[2] + (targetPos[2] - startPos[2]) * p + arcVec[2] * arcFactor;

            // Interpolate Euler rotation along shortest arc
            item.rotation[0] = startRot[0] + deltaRotX * p;
            item.rotation[1] = startRot[1] + deltaRotY * p;
            item.rotation[2] = startRot[2] + deltaRotZ * p;
          },
        },
        0
      );
    }

    return {
      kill: () => {
        tl.kill();
      },
      isRunning: () => tl.isActive(),
      getProgress: () => tl.progress(),
      seek: (progress: number) => {
        tl.progress(progress);
      },
      timeline: tl,
    };
  }
}
