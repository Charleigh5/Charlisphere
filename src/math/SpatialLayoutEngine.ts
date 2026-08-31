/**
 * SpatialLayoutEngine.ts
 * High-performance 3D coordinate transform matrix & mathematical density scaling.
 */

import { Layout3DMode, SpatialSortMode, PhotoMemoryItem } from '../types';

export class SpatialLayoutEngine {
  public static readonly R_MIN = 380;
  public static readonly K_DENSITY = 115.837; // Calibrated so R(360)=620px, R(1000)=1030px, R(30)=380px
  public static readonly R_BASE = 620;
  public static readonly W_BASE = 72; // Base card width in 3D units
  public static readonly H_BASE = 54; // Base card height (4:3 ratio)

  /**
   * 2.1 Dynamic Constant Surface Density Scaling Law
   * R(N) = max(R_min, k_density * sqrt(N / (4 * PI)))
   */
  public static computeDynamicRadius(N: number): number {
    const safeN = Math.max(1, N);
    const calculated = this.K_DENSITY * Math.sqrt(safeN / (4 * Math.PI));
    return Math.max(this.R_MIN, calculated);
  }

  /**
   * 2.2 Viewport, Device DPI & Aspect Ratio Adaptive Card Sizing
   */
  public static computeCardDimensions(
    viewportWidth: number,
    viewportHeight: number,
    N: number
  ): { width: number; height: number } {
    const R = this.computeDynamicRadius(N);
    const minVp = Math.min(viewportWidth, viewportHeight);
    const scaleFactor = Math.pow(minVp / 1080, 0.35) * Math.pow(R / this.R_BASE, 0.25);
    
    const w = Math.max(28, this.W_BASE * scaleFactor);
    const h = Math.max(21, this.H_BASE * scaleFactor);
    return { width: w, height: h };
  }

  /**
   * 2.2 Adaptive Camera Distance
   * D_cam(N, FOV, aspect) = (R(N) / sin(FOV_vert / 2)) * max(1.0, 1.0 / aspect) * 1.18
   */
  public static computeCameraDistance(
    N: number,
    fovVertDegrees = 50,
    aspect = 1.0
  ): number {
    const R = this.computeDynamicRadius(N);
    const fovRad = (fovVertDegrees * Math.PI) / 180;
    const aspectMultiplier = Math.max(1.0, 1.0 / Math.max(0.1, aspect));
    const dist = (R / Math.sin(fovRad / 2)) * aspectMultiplier * 1.18;
    return Math.max(600, dist);
  }

  /**
   * 2.3 Incremental Fibonacci Spot Allocation (Golden Spiral on Sphere)
   */
  public static computeFibonacciSphere(
    index: number,
    total: number,
    radius: number
  ): { position: [number, number, number]; rotation: [number, number, number] } {
    const N = Math.max(1, total);
    const phi = Math.PI * (3 - Math.sqrt(5)); // Golden angle ~2.399963 rad
    
    const y = 1 - (2 * index + 1) / N; // from 1 to -1
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = index * phi;

    const x = radius * r * Math.cos(theta);
    const yPos = radius * y;
    const z = radius * r * Math.sin(theta);

    // Card orientation: outward facing normal from sphere center
    const rotY = Math.atan2(-x, -z);
    const rotX = Math.asin(Math.max(-1, Math.min(1, yPos / radius)));

    return {
      position: [x, yPos, z],
      rotation: [rotX, rotY, 0],
    };
  }

  /**
   * Layout 2: DNA Timeline Helix
   */
  public static computeDnaHelix(
    index: number,
    total: number,
    radius: number
  ): { position: [number, number, number]; rotation: [number, number, number] } {
    const N = Math.max(1, total);
    const turns = Math.max(3, Math.min(12, Math.floor(N / 20)));
    const strand = index % 2; // Double helix strands
    const strandOffset = strand * Math.PI;
    const norm = index / N;

    const theta = norm * 2 * Math.PI * turns + strandOffset;
    const rHelix = radius * 0.75;
    const height = radius * 2.6;

    const x = rHelix * Math.cos(theta);
    const y = (norm - 0.5) * height;
    const z = rHelix * Math.sin(theta);

    const rotY = -theta + Math.PI / 2;
    return {
      position: [x, y, z],
      rotation: [0, rotY, 0],
    };
  }

  /**
   * Layout 3: Galaxy Constellation
   */
  public static computeGalaxyConstellation(
    index: number,
    total: number,
    radius: number
  ): { position: [number, number, number]; rotation: [number, number, number] } {
    const N = Math.max(1, total);
    const goldenRatio = 1.61803398875;
    const angle = index * goldenRatio * 2 * Math.PI;
    const rCore = radius * 0.25;
    const spread = (radius * 0.85) / Math.sqrt(N);
    const dist = rCore + Math.sqrt(index) * spread;

    const x = dist * Math.cos(angle);
    const z = dist * Math.sin(angle);
    const waveAmp = radius * 0.22;
    const y = Math.sin(index * 0.3) * waveAmp * (1 - index / N);

    const rotY = Math.atan2(-x, -z);
    return {
      position: [x, y, z],
      rotation: [0.1 * Math.sin(index), rotY, 0],
    };
  }

  /**
   * Layout 4: Cubic 3D Matrix
   */
  public static computeCubicMatrix(
    index: number,
    total: number,
    radius: number
  ): { position: [number, number, number]; rotation: [number, number, number] } {
    const N = Math.max(1, total);
    const dim = Math.max(2, Math.ceil(Math.cbrt(N)));
    const spacing = (radius * 1.8) / dim;

    const gx = index % dim;
    const gy = Math.floor(index / dim) % dim;
    const gz = Math.floor(index / (dim * dim));

    const x = (gx - (dim - 1) / 2) * spacing;
    const y = (gy - (dim - 1) / 2) * spacing;
    const z = (gz - (dim - 1) / 2) * spacing;

    return {
      position: [x, y, z],
      rotation: [0, 0, 0],
    };
  }

  /**
   * Compute positions based on Layout Mode and Spatial Sorting Mode
   */
  public static calculateTargetTransforms(
    items: PhotoMemoryItem[],
    layoutMode: Layout3DMode,
    sortMode: SpatialSortMode
  ): Array<{ position: [number, number, number]; rotation: [number, number, number] }> {
    const N = items.length;
    const radius = this.computeDynamicRadius(N);

    // Apply sorting first to map spatial rank
    const sortedIndices = this.getSortedIndices(items, sortMode);

    const results: Array<{ position: [number, number, number]; rotation: [number, number, number] }> = new Array(N);

    for (let rank = 0; rank < N; rank++) {
      const originalIdx = sortedIndices[rank];
      const item = items[originalIdx];

      let transform: { position: [number, number, number]; rotation: [number, number, number] };

      // Geographic sorting special projection for sphere
      if (sortMode === 'GEOGRAPHIC' && layoutMode === 'FIBONACCI_SPHERE' && item.exif.latitude !== undefined && item.exif.longitude !== undefined) {
        transform = this.computeGeographicPosition(item.exif.latitude, item.exif.longitude, radius);
      } else if (sortMode === 'CHROMATIC' && layoutMode === 'FIBONACCI_SPHERE') {
        transform = this.computeChromaticPosition(item.hue, rank, N, radius);
      } else if (sortMode === 'RELATIONAL' && layoutMode === 'FIBONACCI_SPHERE') {
        transform = this.computeRelationalPosition(item.people, rank, N, radius);
      } else {
        switch (layoutMode) {
          case 'FIBONACCI_SPHERE':
            transform = this.computeFibonacciSphere(rank, N, radius);
            break;
          case 'DNA_HELIX':
            transform = this.computeDnaHelix(rank, N, radius);
            break;
          case 'GALAXY_CONSTELLATION':
            transform = this.computeGalaxyConstellation(rank, N, radius);
            break;
          case 'CUBIC_MATRIX':
            transform = this.computeCubicMatrix(rank, N, radius);
            break;
        }
      }

      results[originalIdx] = transform;
    }

    return results;
  }

  /**
   * Geographic Coordinates to 3D Sphere Surface
   */
  public static computeGeographicPosition(
    lat: number,
    lng: number,
    radius: number
  ): { position: [number, number, number]; rotation: [number, number, number] } {
    const phi = ((90 - lat) * Math.PI) / 180;
    const theta = ((lng + 180) * Math.PI) / 180;

    const x = -radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * Math.sin(phi) * Math.sin(theta);

    const rotY = Math.atan2(-x, -z);
    const rotX = Math.asin(Math.max(-1, Math.min(1, y / radius)));

    return {
      position: [x, y, z],
      rotation: [rotX, rotY, 0],
    };
  }

  /**
   * Chromatic Longitude Ring mapping (0 to 360 deg hue)
   */
  public static computeChromaticPosition(
    hue: number,
    rank: number,
    total: number,
    radius: number
  ): { position: [number, number, number]; rotation: [number, number, number] } {
    const theta = (hue * Math.PI) / 180;
    const yNorm = 1 - (2 * rank + 1) / total;
    const r = Math.sqrt(Math.max(0, 1 - yNorm * yNorm));

    const x = radius * r * Math.cos(theta);
    const y = radius * yNorm;
    const z = radius * r * Math.sin(theta);

    const rotY = Math.atan2(-x, -z);
    const rotX = Math.asin(Math.max(-1, Math.min(1, y / radius)));

    return {
      position: [x, y, z],
      rotation: [rotX, rotY, 0],
    };
  }

  /**
   * Relational / People Cluster Orbit
   */
  public static computeRelationalPosition(
    people: string[],
    rank: number,
    total: number,
    radius: number
  ): { position: [number, number, number]; rotation: [number, number, number] } {
    // Generate deterministic cluster angle based on primary person hash
    const primaryPerson = people[0] || 'General';
    let hash = 0;
    for (let i = 0; i < primaryPerson.length; i++) {
      hash = (hash << 5) - hash + primaryPerson.charCodeAt(i);
      hash |= 0;
    }
    const clusterCenterAngle = (Math.abs(hash) % 360) * (Math.PI / 180);
    const spreadAngle = clusterCenterAngle + ((rank % 12) - 6) * 0.12;

    const yNorm = 1 - (2 * rank + 1) / total;
    const r = Math.sqrt(Math.max(0, 1 - yNorm * yNorm));

    const x = radius * r * Math.cos(spreadAngle);
    const y = radius * yNorm;
    const z = radius * r * Math.sin(spreadAngle);

    const rotY = Math.atan2(-x, -z);
    const rotX = Math.asin(Math.max(-1, Math.min(1, y / radius)));

    return {
      position: [x, y, z],
      rotation: [rotX, rotY, 0],
    };
  }

  /**
   * Sort items based on the active mode and return ranked indices
   */
  public static getSortedIndices(items: PhotoMemoryItem[], sortMode: SpatialSortMode): number[] {
    const indices = items.map((_, i) => i);

    switch (sortMode) {
      case 'CHRONOLOGICAL':
        indices.sort((a, b) => items[a].timestamp - items[b].timestamp);
        break;
      case 'GEOGRAPHIC':
        indices.sort((a, b) => (items[a].exif.longitude || 0) - (items[b].exif.longitude || 0));
        break;
      case 'CHROMATIC':
        indices.sort((a, b) => items[a].hue - items[b].hue);
        break;
      case 'RELATIONAL':
        indices.sort((a, b) => {
          const pA = items[a].people[0] || 'zzz';
          const pB = items[b].people[0] || 'zzz';
          return pA.localeCompare(pB);
        });
        break;
      case 'SEMANTIC':
        indices.sort((a, b) => {
          if (items[a].category !== items[b].category) {
            return items[a].category.localeCompare(items[b].category);
          }
          return items[b].sentimentScore - items[a].sentimentScore;
        });
        break;
    }

    return indices;
  }
}
