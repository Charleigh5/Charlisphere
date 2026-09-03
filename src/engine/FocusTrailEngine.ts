/**
 * FocusTrailEngine.ts
 * Manages spatial navigation history and generates smooth 3D glowing path splines,
 * progressive color gradients, pulse energy particles, and waypoint orientation beacons.
 */

import { PhotoMemoryItem, FocusTrailWaypoint } from '../types';

export interface SplinePoint3D {
  position: [number, number, number];
  color: [number, number, number]; // RGB 0..1
  alpha: number; // 0..1
  progress: number; // 0..1 along path
}

export class FocusTrailEngine {
  private static instance: FocusTrailEngine | null = null;
  private waypoints: FocusTrailWaypoint[] = [];
  private maxCapacity: number = 12;

  public static getInstance(): FocusTrailEngine {
    if (!FocusTrailEngine.instance) {
      FocusTrailEngine.instance = new FocusTrailEngine();
    }
    return FocusTrailEngine.instance;
  }

  constructor(maxCapacity = 12) {
    this.maxCapacity = maxCapacity;
  }

  public setMaxCapacity(capacity: number): void {
    this.maxCapacity = Math.max(3, capacity);
    if (this.waypoints.length > this.maxCapacity) {
      this.waypoints = this.waypoints.slice(this.waypoints.length - this.maxCapacity);
    }
  }

  /**
   * Adds or updates a visited item in the focus trail history.
   * If the item is already the latest visited node, its live position is updated.
   * Consecutive duplicate focuses are prevented.
   */
  public addWaypoint(item: PhotoMemoryItem): boolean {
    if (!item) return false;

    const last = this.waypoints[this.waypoints.length - 1];
    if (last && last.id === item.id) {
      // Update coordinates of current focused waypoint
      last.position = [item.currentPos[0], item.currentPos[1], item.currentPos[2]];
      return false;
    }

    const newWaypoint: FocusTrailWaypoint = {
      id: item.id,
      position: [item.currentPos[0], item.currentPos[1], item.currentPos[2]],
      timestamp: Date.now(),
      hue: item.hue,
      dominantColor: item.dominantColor || '#38bdf8',
      title: item.title,
    };

    this.waypoints.push(newWaypoint);
    if (this.waypoints.length > this.maxCapacity) {
      this.waypoints.shift();
    }

    return true;
  }

  /**
   * Synchronizes current waypoint coordinates with live item positions.
   * Used when nodes move during layout transitions or physics simulations.
   */
  public syncPositions(itemsMap: Map<string, PhotoMemoryItem>): void {
    for (const wp of this.waypoints) {
      const liveItem = itemsMap.get(wp.id);
      if (liveItem) {
        wp.position[0] = liveItem.currentPos[0];
        wp.position[1] = liveItem.currentPos[1];
        wp.position[2] = liveItem.currentPos[2];
      }
    }
  }

  public clear(): void {
    this.waypoints = [];
  }

  public remove(id: string): void {
    this.waypoints = this.waypoints.filter((w) => w.id !== id);
  }

  public getWaypoints(): FocusTrailWaypoint[] {
    return [...this.waypoints];
  }

  public get waypointCount(): number {
    return this.waypoints.length;
  }

  /**
   * Mathematical Catmull-Rom point calculation in 3D
   */
  public static catmullRom(
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number],
    t: number
  ): [number, number, number] {
    const t2 = t * t;
    const t3 = t2 * t;

    const v0 = (p2[0] - p0[0]) * 0.5;
    const v1 = (p3[0] - p1[0]) * 0.5;
    const x = (2 * p1[0] - 2 * p2[0] + v0 + v1) * t3 + (-3 * p1[0] + 3 * p2[0] - 2 * v0 - v1) * t2 + v0 * t + p1[0];

    const v0y = (p2[1] - p0[1]) * 0.5;
    const v1y = (p3[1] - p1[1]) * 0.5;
    const y = (2 * p1[1] - 2 * p2[1] + v0y + v1y) * t3 + (-3 * p1[1] + 3 * p2[1] - 2 * v0y - v1y) * t2 + v0y * t + p1[1];

    const v0z = (p2[2] - p0[2]) * 0.5;
    const v1z = (p3[2] - p1[2]) * 0.5;
    const z = (2 * p1[2] - 2 * p2[2] + v0z + v1z) * t3 + (-3 * p1[2] + 3 * p2[2] - 2 * v0z - v1z) * t2 + v0z * t + p1[2];

    return [x, y, z];
  }

  /**
   * Converts HSL (hue in degrees 0..360, s in 0..1, l in 0..1) to normalized RGB [0..1]
   */
  public static hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = (h % 360) / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r1 = 0, g1 = 0, b1 = 0;

    if (hp >= 0 && hp < 1) { r1 = c; g1 = x; b1 = 0; }
    else if (hp >= 1 && hp < 2) { r1 = x; g1 = c; b1 = 0; }
    else if (hp >= 2 && hp < 3) { r1 = 0; g1 = c; b1 = x; }
    else if (hp >= 3 && hp < 4) { r1 = 0; g1 = x; b1 = c; }
    else if (hp >= 4 && hp < 5) { r1 = x; g1 = 0; b1 = c; }
    else if (hp >= 5 && hp < 6) { r1 = c; g1 = 0; b1 = x; }

    const m = l - c / 2;
    return [
      Math.max(0, Math.min(1, r1 + m)),
      Math.max(0, Math.min(1, g1 + m)),
      Math.max(0, Math.min(1, b1 + m)),
    ];
  }

  /**
   * Generates a smooth, interpolated 3D spline through all active waypoints.
   * Attaches progressive vertex colors and alpha fading for subtle cosmic glow.
   */
  public generateSplinePoints(samplesPerSegment = 20): SplinePoint3D[] {
    const pts = this.waypoints.map((w) => w.position);
    if (pts.length < 2) return [];

    const result: SplinePoint3D[] = [];
    const n = pts.length;

    // Start RGB from oldest waypoint, End RGB at latest focused waypoint
    const startHue = this.waypoints[0].hue || 200;
    const endHue = this.waypoints[n - 1].hue || 195;

    const startColor = FocusTrailEngine.hslToRgb(startHue, 0.75, 0.55);
    const endColor = FocusTrailEngine.hslToRgb(endHue, 0.95, 0.65);

    if (n === 2) {
      // Simple 2-point direct linear path with subtle arching
      const p0 = pts[0];
      const p1 = pts[1];
      const count = samplesPerSegment;

      for (let i = 0; i <= count; i++) {
        const t = i / count;
        // Subtle natural curvature perpendicular to straight line
        const midLift = Math.sin(t * Math.PI) * 15;
        const x = p0[0] + (p1[0] - p0[0]) * t;
        const y = p0[1] + (p1[1] - p0[1]) * t + midLift;
        const z = p0[2] + (p1[2] - p0[2]) * t;

        // Progressive alpha (older = 0.2, newest = 0.95)
        const alpha = 0.2 + t * 0.75;
        const r = startColor[0] + (endColor[0] - startColor[0]) * t;
        const g = startColor[1] + (endColor[1] - startColor[1]) * t;
        const b = startColor[2] + (endColor[2] - startColor[2]) * t;

        result.push({
          position: [x, y, z],
          color: [r, g, b],
          alpha,
          progress: t,
        });
      }
      return result;
    }

    // 3 or more points: Multi-segment Catmull-Rom spline
    const totalSegments = n - 1;
    const totalSamples = totalSegments * samplesPerSegment;
    let globalSampleIdx = 0;

    for (let seg = 0; seg < totalSegments; seg++) {
      const p0 = seg === 0 ? pts[0] : pts[seg - 1];
      const p1 = pts[seg];
      const p2 = pts[seg + 1];
      const p3 = seg + 2 < n ? pts[seg + 2] : pts[seg + 1];

      const isLastSeg = seg === totalSegments - 1;
      const stepLimit = isLastSeg ? samplesPerSegment : samplesPerSegment - 1;

      for (let s = 0; s <= stepLimit; s++) {
        const localT = s / samplesPerSegment;
        const pt = FocusTrailEngine.catmullRom(p0, p1, p2, p3, localT);

        const globalProgress = globalSampleIdx / totalSamples;
        globalSampleIdx++;

        // Exponential ease for alpha: older segments are delicate and subtle, latest is prominent
        const alpha = Math.min(0.95, 0.15 + Math.pow(globalProgress, 1.2) * 0.80);

        // Interpolate color along the entire path
        const r = startColor[0] + (endColor[0] - startColor[0]) * globalProgress;
        const g = startColor[1] + (endColor[1] - startColor[1]) * globalProgress;
        const b = startColor[2] + (endColor[2] - startColor[2]) * globalProgress;

        result.push({
          position: pt,
          color: [r, g, b],
          alpha,
          progress: globalProgress,
        });
      }
    }

    return result;
  }

  /**
   * Evaluates the 3D position along the generated spline for an animated energy pulse
   * @param splinePoints Pre-sampled spline points
   * @param u Parameter in range [0, 1]
   */
  public static evaluatePulsePosition(
    splinePoints: SplinePoint3D[],
    u: number
  ): [number, number, number] | null {
    if (splinePoints.length === 0) return null;
    if (splinePoints.length === 1) return splinePoints[0].position;

    const clampedU = Math.max(0, Math.min(1, u));
    const targetIdx = clampedU * (splinePoints.length - 1);
    const lowIdx = Math.floor(targetIdx);
    const highIdx = Math.min(splinePoints.length - 1, Math.ceil(targetIdx));
    const frac = targetIdx - lowIdx;

    const p0 = splinePoints[lowIdx].position;
    const p1 = splinePoints[highIdx].position;

    return [
      p0[0] + (p1[0] - p0[0]) * frac,
      p0[1] + (p1[1] - p0[1]) * frac,
      p0[2] + (p1[2] - p0[2]) * frac,
    ];
  }

  /**
   * Calculates visual beacon attributes for a specific waypoint
   * @param waypointIndex 0 (oldest) to total - 1 (latest focused)
   * @param totalWaypoints Total count of active waypoints
   */
  public static calculateBeaconProps(
    waypointIndex: number,
    totalWaypoints: number
  ): {
    scale: number;
    opacity: number;
    isLatest: boolean;
    ringRadius: number;
  } {
    if (totalWaypoints <= 1) {
      return {
        scale: 1.2,
        opacity: 0.95,
        isLatest: true,
        ringRadius: 28,
      };
    }

    const progress = waypointIndex / (totalWaypoints - 1);
    const isLatest = waypointIndex === totalWaypoints - 1;

    // Scale from 0.7 (oldest) to 1.35 (latest)
    const scale = 0.7 + progress * 0.65;
    // Opacity from 0.25 (oldest) to 0.95 (latest)
    const opacity = 0.25 + progress * 0.70;
    const ringRadius = 18 + progress * 14;

    return {
      scale,
      opacity,
      isLatest,
      ringRadius,
    };
  }
}
