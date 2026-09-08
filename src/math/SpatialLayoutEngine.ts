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
   * Calibrated so the sphere is centered with equal black space around all four edges
   */
  public static computeCameraDistance(
    N: number,
    fovVertDegrees = 50,
    aspect = 1.0
  ): number {
    const R = this.computeDynamicRadius(N);
    const fovRad = (fovVertDegrees * Math.PI) / 180;
    const aspectMultiplier = Math.max(1.0, 1.0 / Math.max(0.1, aspect));
    const dist = (R / Math.sin(fovRad / 2)) * aspectMultiplier * 1.72;
    return Math.max(900, dist);
  }

  /**
   * Layout: Structured Geodesic Ring Sphere (Clean straight-lined latitude rings)
   * Cards are organized into straight horizontal parallel rings with zero roll
   */
  public static computeStructuredSphere(
    index: number,
    total: number,
    radius: number
  ): { position: [number, number, number]; rotation: [number, number, number] } {
    const N = Math.max(1, total);
    // Determine number of latitude bands based on item count
    const numBands = Math.max(3, Math.min(18, Math.round(Math.sqrt(N * 0.8))));
    
    // Allocate items to bands proportionally to circumference (sin(phi))
    // Compute cumulative capacities
    let totalWeight = 0;
    const bandWeights: number[] = [];
    for (let b = 0; b < numBands; b++) {
      const phi = ((b + 0.5) / numBands) * Math.PI;
      const weight = Math.sin(phi);
      bandWeights.push(weight);
      totalWeight += weight;
    }

    // Determine which band this index belongs to
    let accum = 0;
    let targetBand = 0;
    let indexInBand = 0;
    let countInTargetBand = 1;

    for (let b = 0; b < numBands; b++) {
      const bandCap = Math.max(1, Math.round((bandWeights[b] / totalWeight) * N));
      if (index < accum + bandCap || b === numBands - 1) {
        targetBand = b;
        indexInBand = index - accum;
        countInTargetBand = bandCap;
        break;
      }
      accum += bandCap;
    }

    const phi = ((targetBand + 0.5) / numBands) * Math.PI;
    const theta = (indexInBand / Math.max(1, countInTargetBand)) * 2 * Math.PI;

    const r = radius * Math.sin(phi);
    const x = r * Math.cos(theta);
    const yPos = radius * Math.cos(phi);
    const z = r * Math.sin(theta);

    // Cards face outward with level horizon (straight horizontal lines)
    const rotY = Math.atan2(-x, -z);
    const rotX = Math.asin(Math.max(-1, Math.min(1, yPos / radius)));

    return {
      position: [x, yPos, z],
      rotation: [rotX, rotY, 0],
    };
  }

  /**
   * Layout: Planar Grid Gallery Wall (Pristine straight-lined matrix)
   * Images arranged in clean horizontal rows and vertical columns with equal spacing
   */
  public static computePlanarGrid(
    index: number,
    total: number,
    radius: number
  ): { position: [number, number, number]; rotation: [number, number, number] } {
    const N = Math.max(1, total);
    // 16:9 / 4:3 landscape gallery grid
    const cols = Math.max(3, Math.ceil(Math.sqrt(N * 1.5)));
    const rows = Math.ceil(N / cols);

    const spacingX = this.W_BASE * 1.45;
    const spacingY = this.H_BASE * 1.45;

    const col = index % cols;
    const row = Math.floor(index / cols);

    const x = (col - (cols - 1) / 2) * spacingX;
    const y = ((rows - 1) / 2 - row) * spacingY;
    const z = 0;

    return {
      position: [x, y, z],
      rotation: [0, 0, 0], // Perfectly straight facing forward
    };
  }

  /**
   * Layout: Cylindrical Gallery (Curved wall with straight vertical columns)
   * Cards sit in level horizontal rows and straight vertical columns along an amphitheater arc
   */
  public static computeCylinderGallery(
    index: number,
    total: number,
    radius: number
  ): { position: [number, number, number]; rotation: [number, number, number] } {
    const N = Math.max(1, total);
    const cols = Math.max(6, Math.ceil(Math.sqrt(N * 2)));
    const rows = Math.ceil(N / cols);

    const col = index % cols;
    const row = Math.floor(index / cols);

    // 240 degree curved panoramic amphitheater
    const arcAngle = (240 * Math.PI) / 180;
    const theta = ((col - (cols - 1) / 2) / Math.max(1, cols - 1)) * arcAngle;

    const rCyl = radius * 1.1;
    const x = rCyl * Math.sin(theta);
    const z = -rCyl * Math.cos(theta) + rCyl * 0.25;
    const y = ((rows - 1) / 2 - row) * (this.H_BASE * 1.45);

    // Straight vertical columns with azimuthal curve
    return {
      position: [x, y, z],
      rotation: [0, -theta, 0],
    };
  }

  /**
   * Layout: Ring Carousel (Concentric upright circular rings)
   */
  public static computeRingCarousel(
    index: number,
    total: number,
    radius: number
  ): { position: [number, number, number]; rotation: [number, number, number] } {
    const N = Math.max(1, total);
    const tiers = Math.max(1, Math.min(4, Math.ceil(N / 36)));
    const itemsPerTier = Math.ceil(N / tiers);

    const tier = Math.floor(index / itemsPerTier);
    const indexInTier = index % itemsPerTier;

    const countInTier = Math.min(itemsPerTier, N - tier * itemsPerTier);
    const theta = (indexInTier / Math.max(1, countInTier)) * 2 * Math.PI;

    const tierRadius = radius * (0.8 + tier * 0.35);
    const x = tierRadius * Math.cos(theta);
    const z = tierRadius * Math.sin(theta);
    const y = (tier - (tiers - 1) / 2) * (this.H_BASE * 1.6);

    const rotY = Math.atan2(-x, -z);

    return {
      position: [x, y, z],
      rotation: [0, rotY, 0],
    };
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

      const isSpherical = layoutMode === 'FIBONACCI_SPHERE' || layoutMode === 'STRUCTURED_SPHERE';

      // Geographic sorting special projection for sphere
      if (sortMode === 'GEOGRAPHIC' && isSpherical && item.exif.latitude !== undefined && item.exif.longitude !== undefined) {
        transform = this.computeGeographicPosition(item.exif.latitude, item.exif.longitude, radius);
      } else if (sortMode === 'CHROMATIC' && isSpherical) {
        transform = this.computeChromaticPosition(item.hue, rank, N, radius);
      } else if (sortMode === 'RELATIONAL' && isSpherical) {
        transform = this.computeRelationalPosition(item.people, rank, N, radius);
      } else {
        switch (layoutMode) {
          case 'FIBONACCI_SPHERE':
            transform = this.computeFibonacciSphere(rank, N, radius);
            break;
          case 'STRUCTURED_SPHERE':
            transform = this.computeStructuredSphere(rank, N, radius);
            break;
          case 'PLANAR_GRID':
            transform = this.computePlanarGrid(rank, N, radius);
            break;
          case 'CYLINDER_GALLERY':
            transform = this.computeCylinderGallery(rank, N, radius);
            break;
          case 'RING_CAROUSEL':
            transform = this.computeRingCarousel(rank, N, radius);
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
          default:
            transform = this.computeStructuredSphere(rank, N, radius);
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
