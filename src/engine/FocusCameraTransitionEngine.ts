/**
 * FocusCameraTransitionEngine.ts
 * High-performance cinematic 3D camera flight sequencer and arc interpolation
 * for smooth, automated transitions between photo memory nodes in Focus Mode.
 */

import gsap from 'gsap';
import * as THREE from 'three';
import { PhotoMemoryItem } from '../types';
import { computeFocusCameraTransform } from '../components/PhotoSphereCanvas';

export type FocusNavDirection = 'next' | 'prev' | 'direct';

export interface FocusFlightTrajectory {
  startPos: [number, number, number];
  endPos: [number, number, number];
  distance: number;
  startTheta: number;
  endTheta: number;
  deltaTheta: number;
  startPhi: number;
  endPhi: number;
  startRadius: number;
  endRadius: number;
  peakRadius: number;
  arcNormal: [number, number, number];
  arcHeight: number;
  duration: number;
  direction: FocusNavDirection;
}

export interface FocusFlightProgressState {
  pan: [number, number, number];
  theta: number;
  phi: number;
  radius: number;
  effectiveFocusDistance: number;
  progress: number;
}

export interface FocusFlightHandle {
  kill: () => void;
  isRunning: () => boolean;
  getProgress: () => number;
  timeline: gsap.core.Timeline;
}

export class FocusCameraTransitionEngine {
  /**
   * Computes the shortest angular difference in radians between two angles,
   * avoiding long 360-degree rotation spin artifacts when crossing -π / +π boundaries.
   */
  public static calculateShortestAngle(current: number, target: number): number {
    let diff = (target - current) % (2 * Math.PI);
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    return diff;
  }

  /**
   * Calculates a safe outward normal vector for the transition arc so the camera's
   * focal point and viewing path curve above the 3D sphere rather than cutting
   * through the center or clipping intervening photo cards.
   */
  public static calculateArcNormal(
    startPos: [number, number, number],
    endPos: [number, number, number],
    direction: FocusNavDirection = 'next'
  ): [number, number, number] {
    const [sx, sy, sz] = startPos;
    const [ex, ey, ez] = endPos;

    // Midpoint between start and end
    let mx = (sx + ex) * 0.5;
    let my = (sy + ey) * 0.5;
    let mz = (sz + ez) * 0.5;
    let mDist = Math.hypot(mx, my, mz);

    // Chord vector
    const cx = ex - sx;
    const cy = ey - sy;
    const cz = ez - sz;
    const cDist = Math.hypot(cx, cy, cz);

    // If start and end are antipodal (midpoint near 0,0,0), synthesize a perpendicular normal
    if (mDist < 1e-3 || cDist < 1e-3) {
      // Cross with Y-axis or Z-axis
      const upY = Math.abs(cy) < 0.9 * (cDist || 1) ? 1 : 0;
      const upZ = upY === 1 ? 0 : 1;
      const px = cy * upZ - cz * upY;
      const py = cz * 0 - cx * upZ;
      const pz = cx * upY - cy * 0;
      const pLen = Math.hypot(px, py, pz) || 1;
      return [px / pLen, py / pLen, pz / pLen];
    }

    // Normalized outward radial vector
    let nx = mx / mDist;
    let ny = my / mDist;
    let nz = mz / mDist;

    // Add subtle lateral banking based on direction for enhanced visual kinetic flow
    if (direction === 'next' || direction === 'prev') {
      const sign = direction === 'next' ? 1 : -1;
      // Cross chord with radial normal to get tangential lateral vector
      const lx = cy * nz - cz * ny;
      const ly = cz * nx - cx * nz;
      const lz = cx * ny - cy * nx;
      const lLen = Math.hypot(lx, ly, lz);
      if (lLen > 1e-3) {
        nx += (lx / lLen) * 0.18 * sign;
        ny += (ly / lLen) * 0.18 * sign;
        nz += (lz / lLen) * 0.18 * sign;
        const finalLen = Math.hypot(nx, ny, nz) || 1;
        nx /= finalLen;
        ny /= finalLen;
        nz /= finalLen;
      }
    }

    return [nx, ny, nz];
  }

  /**
   * Computes dynamic flight duration (in seconds) based on 3D distance between items.
   * Calibrated for cinematic pacing: brisk enough to feel responsive, yet smooth enough
   * to appreciate the sweeping flight vista across the constellation.
   */
  public static calculateFlightDuration(distance: number): number {
    // Distance typically ranges from ~100 to ~2000 units
    const clampedDist = Math.max(80, Math.min(2400, distance));
    const normalized = (clampedDist - 80) / (2400 - 80);
    // 0.82 seconds for close neighbors up to 1.25 seconds for opposite hemispheres
    return 0.82 + normalized * 0.43;
  }

  /**
   * Builds the complete mathematical flight trajectory between two memory nodes.
   */
  public static computeFlightTrajectory(options: {
    startPan: [number, number, number];
    endPan: [number, number, number];
    startTheta: number;
    startPhi: number;
    startRadius: number;
    endFocusDistance?: number;
    direction?: FocusNavDirection;
  }): FocusFlightTrajectory {
    const {
      startPan,
      endPan,
      startTheta,
      startPhi,
      startRadius,
      endFocusDistance = 320,
      direction = 'next',
    } = options;

    const dx = endPan[0] - startPan[0];
    const dy = endPan[1] - startPan[1];
    const dz = endPan[2] - startPan[2];
    const distance = Math.hypot(dx, dy, dz);

    const endTransform = computeFocusCameraTransform(endPan, endFocusDistance);
    const deltaTheta = this.calculateShortestAngle(startTheta, endTransform.targetTheta);

    // Parabolic Arc Height: lifts camera focal path above cards
    const arcHeight = Math.max(50, Math.min(280, distance * 0.28));

    // Dolly pullback: camera zooms out during flight, then descends into framing
    const pullBack = Math.max(100, Math.min(320, distance * 0.32));
    const peakRadius = Math.max(startRadius, endFocusDistance) + pullBack;

    const arcNormal = this.calculateArcNormal(startPan, endPan, direction);
    const duration = this.calculateFlightDuration(distance);

    return {
      startPos: [...startPan],
      endPos: [...endPan],
      distance,
      startTheta,
      endTheta: endTransform.targetTheta,
      deltaTheta,
      startPhi,
      endPhi: endTransform.targetPhi,
      startRadius,
      endRadius: endFocusDistance,
      peakRadius,
      arcNormal,
      arcHeight,
      duration,
      direction,
    };
  }

  /**
   * Evaluates camera spherical parameters and 3D pan coordinates at normalized progress t in [0, 1].
   */
  public static evaluateFlightAtProgress(
    trajectory: FocusFlightTrajectory,
    progress: number
  ): FocusFlightProgressState {
    const t = Math.max(0, Math.min(1, progress));

    // Smooth cubic ease-in-out curve
    const easeT = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    // Linear chord interpolation
    const lx = trajectory.startPos[0] + (trajectory.endPos[0] - trajectory.startPos[0]) * easeT;
    const ly = trajectory.startPos[1] + (trajectory.endPos[1] - trajectory.startPos[1]) * easeT;
    const lz = trajectory.startPos[2] + (trajectory.endPos[2] - trajectory.startPos[2]) * easeT;

    // Outward parabolic bell curve: 0 at t=0, 1 at t=0.5, 0 at t=1
    const arcFactor = Math.sin(Math.PI * t);
    const arcLift = arcFactor * trajectory.arcHeight;

    const pan: [number, number, number] = [
      lx + trajectory.arcNormal[0] * arcLift,
      ly + trajectory.arcNormal[1] * arcLift,
      lz + trajectory.arcNormal[2] * arcLift,
    ];

    // Spherical orientation interpolation
    const theta = trajectory.startTheta + trajectory.deltaTheta * easeT;
    let phi = trajectory.startPhi + (trajectory.endPhi - trajectory.startPhi) * easeT;
    phi = Math.max(0.08, Math.min(3.06, phi)); // Prevent gimbal singularities

    // Parabolic dolly pullback: startRadius -> peakRadius -> endRadius
    const radiusBase = trajectory.startRadius + (trajectory.endRadius - trajectory.startRadius) * easeT;
    const radiusLift = arcFactor * (trajectory.peakRadius - Math.max(trajectory.startRadius, trajectory.endRadius));
    const radius = radiusBase + radiusLift;

    // Effective focal plane distance for Depth of Field rack focus
    const effectiveFocusDistance = radius;

    return {
      pan,
      theta,
      phi,
      radius,
      effectiveFocusDistance,
      progress: t,
    };
  }

  /**
   * Executes a GSAP-driven automated flight animation sequence that smoothly
   * transitions the camera to the next item instead of jumping directly.
   */
  public static startFlightSequence(options: {
    cameraState: {
      panOffset: THREE.Vector3;
      targetPanOffset: THREE.Vector3;
      theta: number;
      targetTheta: number;
      phi: number;
      targetPhi: number;
      radius: number;
      targetRadius: number;
      momentum: { x: number; y: number };
      panMomentum: THREE.Vector3;
      zoomMomentum: number;
    };
    toItem: PhotoMemoryItem;
    fromItem?: PhotoMemoryItem | null;
    direction?: FocusNavDirection;
    focusDistance?: number;
    onProgress?: (progress: number, state: FocusFlightProgressState) => void;
    onComplete?: () => void;
  }): FocusFlightHandle {
    const {
      cameraState,
      toItem,
      fromItem,
      direction = 'next',
      focusDistance = 320,
      onProgress,
      onComplete,
    } = options;

    // Zero out residual user drag/orbit momentum
    cameraState.momentum.x = 0;
    cameraState.momentum.y = 0;
    cameraState.panMomentum.set(0, 0, 0);
    cameraState.zoomMomentum = 0;

    // Starting coordinates from current live camera state
    const startPan: [number, number, number] = [
      cameraState.panOffset.x,
      cameraState.panOffset.y,
      cameraState.panOffset.z,
    ];

    // Destination coordinates
    const endPan: [number, number, number] = [...toItem.targetPos];

    const trajectory = this.computeFlightTrajectory({
      startPan,
      endPan,
      startTheta: cameraState.theta,
      startPhi: cameraState.phi,
      startRadius: cameraState.radius,
      endFocusDistance: focusDistance,
      direction,
    });

    const flightObject = { progress: 0 };

    const tl = gsap.timeline({
      onUpdate: () => {
        const state = this.evaluateFlightAtProgress(trajectory, flightObject.progress);

        // Update live and target camera state synchronously
        cameraState.panOffset.set(state.pan[0], state.pan[1], state.pan[2]);
        cameraState.targetPanOffset.set(state.pan[0], state.pan[1], state.pan[2]);

        cameraState.theta = state.theta;
        cameraState.targetTheta = state.theta;

        cameraState.phi = state.phi;
        cameraState.targetPhi = state.phi;

        cameraState.radius = state.radius;
        cameraState.targetRadius = state.radius;

        onProgress?.(flightObject.progress, state);
      },
      onComplete: () => {
        // Finalize exact destination framing parameters
        const finalTransform = computeFocusCameraTransform(endPan, focusDistance);
        cameraState.targetPanOffset.set(endPan[0], endPan[1], endPan[2]);
        cameraState.panOffset.set(endPan[0], endPan[1], endPan[2]);

        cameraState.targetTheta = finalTransform.targetTheta;
        cameraState.theta = finalTransform.targetTheta;

        cameraState.targetPhi = finalTransform.targetPhi;
        cameraState.phi = finalTransform.targetPhi;

        cameraState.targetRadius = focusDistance;
        cameraState.radius = focusDistance;

        onComplete?.();
      },
    });

    tl.to(flightObject, {
      progress: 1,
      duration: trajectory.duration,
      ease: 'power2.inOut',
    });

    return {
      kill: () => {
        tl.kill();
      },
      isRunning: () => tl.isActive(),
      getProgress: () => flightObject.progress,
      timeline: tl,
    };
  }
}
