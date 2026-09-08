/**
 * ShimmerPulseEngine.ts
 * PhotoSphere 3D Memory Matrix - Drag & Re-order Visual Feedback Engine
 * 
 * Provides immediate visual feedback through subtle 'shimmer' and 'pulse' animations
 * when memory nodes are directly dragged in 3D space, hovered over adjacent slots,
 * or re-ordered across the spatial matrix (via drag-to-swap or layout sort modes).
 */

import * as THREE from 'three';
import { PhotoMemoryItem } from '../types';

export interface DragState {
  isDragging: boolean;
  draggedIndex: number;
  draggedId: string | null;
  dragPlane: THREE.Plane;
  dragOffset: THREE.Vector3;
  currentIntersection: THREE.Vector3;
  startWorldPos: THREE.Vector3;
  dragStartTime: number;
  nearestTargetIndex: number;
  nearestTargetDistance: number;
}

export interface ReorderWaveState {
  isActive: boolean;
  startTime: number;
  originIndex: number;
  durationMs: number;
  waveSpeed: number; // distance delay coefficient
}

export interface NodeAnimationFeedback {
  scaleMultiplier: number;
  opacityMultiplier: number;
  shimmerIntensity: number;
  haloOpacity: number;
  haloColor: number;
  elevationOffset: THREE.Vector3;
  isDragged: boolean;
  isSnapTarget: boolean;
  isReordering: boolean;
}

export class ShimmerPulseEngine {
  private static instance: ShimmerPulseEngine | null = null;

  // Active Drag State
  private dragState: DragState = {
    isDragging: false,
    draggedIndex: -1,
    draggedId: null,
    dragPlane: new THREE.Plane(),
    dragOffset: new THREE.Vector3(),
    currentIntersection: new THREE.Vector3(),
    startWorldPos: new THREE.Vector3(),
    dragStartTime: 0,
    nearestTargetIndex: -1,
    nearestTargetDistance: Infinity,
  };

  // Re-order Wave State
  private reorderWave: ReorderWaveState = {
    isActive: false,
    startTime: 0,
    originIndex: -1,
    durationMs: 750,
    waveSpeed: 18, // ms per index distance
  };

  // Pre-allocated vectors to eliminate runtime garbage collection in render loop
  private vCamDir = new THREE.Vector3();
  private vCardPos = new THREE.Vector3();
  private vHitPoint = new THREE.Vector3();
  private vTempElevation = new THREE.Vector3();

  // Visual Magnetic Snap Tether Line & Reticle Ring
  private magneticGroup: THREE.Group;
  private snapLine: THREE.Line;
  private snapLineGeo: THREE.BufferGeometry;
  private snapLineMat: THREE.LineBasicMaterial;
  private reticleMesh: THREE.Mesh;
  private reticleGeo: THREE.RingGeometry;
  private reticleMat: THREE.MeshBasicMaterial;

  constructor(scene?: THREE.Scene | THREE.Group) {
    this.magneticGroup = new THREE.Group();
    this.magneticGroup.name = 'PhotoSphere_MagneticSnapIndicators';

    // Snap tether line connecting dragged node to target slot
    const linePositions = new Float32Array(6);
    this.snapLineGeo = new THREE.BufferGeometry();
    this.snapLineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    this.snapLineMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0,
      depthTest: false,
    });
    this.snapLine = new THREE.Line(this.snapLineGeo, this.snapLineMat);
    this.magneticGroup.add(this.snapLine);

    // Luminous magnetic target reticle ring
    this.reticleGeo = new THREE.RingGeometry(24, 28, 32);
    this.reticleMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24, // Warm Amber/Gold
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    this.reticleMesh = new THREE.Mesh(this.reticleGeo, this.reticleMat);
    this.reticleMesh.visible = false;
    this.magneticGroup.add(this.reticleMesh);

    if (scene) {
      scene.add(this.magneticGroup);
    }
  }

  public static getInstance(scene?: THREE.Scene | THREE.Group): ShimmerPulseEngine {
    if (!this.instance) {
      this.instance = new ShimmerPulseEngine(scene);
    }
    return this.instance;
  }

  public attachToScene(scene: THREE.Scene | THREE.Group) {
    if (this.magneticGroup.parent !== scene) {
      if (this.magneticGroup.parent) {
        this.magneticGroup.parent.remove(this.magneticGroup);
      }
      scene.add(this.magneticGroup);
    }
  }

  /**
   * Begins 3D dragging of a memory node
   */
  public startDrag(
    index: number,
    item: PhotoMemoryItem,
    ray: THREE.Ray,
    camera: THREE.PerspectiveCamera,
    timestamp: number
  ): boolean {
    camera.getWorldDirection(this.vCamDir);
    this.vCardPos.set(item.currentPos[0], item.currentPos[1], item.currentPos[2]);

    // Plane coplanar with card, facing the camera normal
    const planeNormal = this.vCamDir.clone().negate().normalize();
    this.dragState.dragPlane.setFromNormalAndCoplanarPoint(planeNormal, this.vCardPos);

    const hit = ray.intersectPlane(this.dragState.dragPlane, this.vHitPoint);
    if (!hit) {
      return false;
    }

    this.dragState.isDragging = true;
    this.dragState.draggedIndex = index;
    this.dragState.draggedId = item.id;
    this.dragState.dragOffset.copy(this.vCardPos).sub(this.vHitPoint);
    this.dragState.currentIntersection.copy(this.vHitPoint);
    this.dragState.startWorldPos.copy(this.vCardPos);
    this.dragState.dragStartTime = timestamp;
    this.dragState.nearestTargetIndex = -1;
    this.dragState.nearestTargetDistance = Infinity;

    return true;
  }

  /**
   * Updates dragged node position in 3D space and computes magnetic proximity to other slots
   */
  public updateDrag(
    ray: THREE.Ray,
    items: PhotoMemoryItem[],
    camera: THREE.PerspectiveCamera,
    timestamp: number
  ): { targetSlotIndex: number; hasMoved: boolean } {
    if (!this.dragState.isDragging || this.dragState.draggedIndex < 0) {
      return { targetSlotIndex: -1, hasMoved: false };
    }

    const hit = ray.intersectPlane(this.dragState.dragPlane, this.vHitPoint);
    if (!hit) {
      return { targetSlotIndex: this.dragState.nearestTargetIndex, hasMoved: false };
    }

    this.dragState.currentIntersection.copy(this.vHitPoint);

    // Apply offset so node stays pinned relative to initial grab point
    const draggedItem = items[this.dragState.draggedIndex];
    if (draggedItem) {
      const targetX = this.vHitPoint.x + this.dragState.dragOffset.x;
      const targetY = this.vHitPoint.y + this.dragState.dragOffset.y;
      const targetZ = this.vHitPoint.z + this.dragState.dragOffset.z;

      draggedItem.currentPos[0] = targetX;
      draggedItem.currentPos[1] = targetY;
      draggedItem.currentPos[2] = targetZ;

      draggedItem.targetPos[0] = targetX;
      draggedItem.targetPos[1] = targetY;
      draggedItem.targetPos[2] = targetZ;
    }

    // Find nearest neighbor slot for potential re-ordering swap
    let nearestIdx = -1;
    let minDistance = 220; // Magnetic snap radius in world units

    for (let i = 0; i < items.length; i++) {
      if (i === this.dragState.draggedIndex) continue;
      const other = items[i];
      const dist = Math.hypot(
        draggedItem.currentPos[0] - other.targetPos[0],
        draggedItem.currentPos[1] - other.targetPos[1],
        draggedItem.currentPos[2] - other.targetPos[2]
      );
      if (dist < minDistance) {
        minDistance = dist;
        nearestIdx = i;
      }
    }

    this.dragState.nearestTargetIndex = nearestIdx;
    this.dragState.nearestTargetDistance = minDistance;

    // Update magnetic tether line & reticle ring
    if (nearestIdx >= 0 && items[nearestIdx]) {
      const targetSlot = items[nearestIdx];
      const posAttr = this.snapLineGeo.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;

      arr[0] = draggedItem.currentPos[0];
      arr[1] = draggedItem.currentPos[1];
      arr[2] = draggedItem.currentPos[2];

      arr[3] = targetSlot.targetPos[0];
      arr[4] = targetSlot.targetPos[1];
      arr[5] = targetSlot.targetPos[2];

      posAttr.needsUpdate = true;
      this.snapLineMat.opacity = Math.max(0.2, (1 - minDistance / 220) * 0.85);

      this.reticleMesh.position.set(targetSlot.targetPos[0], targetSlot.targetPos[1], targetSlot.targetPos[2]);
      this.reticleMesh.quaternion.copy(camera.quaternion);
      const reticleScale = 1.0 + Math.sin(timestamp * 0.015) * 0.18;
      this.reticleMesh.scale.set(reticleScale, reticleScale, 1);
      this.reticleMat.opacity = Math.max(0.3, (1 - minDistance / 220) * 0.9);
      this.reticleMesh.visible = true;
    } else {
      this.snapLineMat.opacity = 0;
      this.reticleMesh.visible = false;
    }

    const distFromStart = Math.hypot(
      draggedItem.currentPos[0] - this.dragState.startWorldPos.x,
      draggedItem.currentPos[1] - this.dragState.startWorldPos.y,
      draggedItem.currentPos[2] - this.dragState.startWorldPos.z
    );

    return {
      targetSlotIndex: nearestIdx,
      hasMoved: distFromStart > 15,
    };
  }

  /**
   * Concludes drag operation, optionally triggering slot swap / re-order
   */
  public endDrag(
    items: PhotoMemoryItem[],
    onSwapSlots?: (indexA: number, indexB: number) => void
  ): { didReorder: boolean; swappedPair?: [number, number] } {
    if (!this.dragState.isDragging) {
      return { didReorder: false };
    }

    const fromIdx = this.dragState.draggedIndex;
    const toIdx = this.dragState.nearestTargetIndex;
    let didReorder = false;
    let swappedPair: [number, number] | undefined = undefined;

    if (fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx && fromIdx < items.length && toIdx < items.length) {
      // Execute swap
      if (onSwapSlots) {
        onSwapSlots(fromIdx, toIdx);
      } else {
        // Direct target transform swap
        const tempTargetPos = [...items[fromIdx].targetPos] as [number, number, number];
        const tempTargetRot = [...items[fromIdx].targetRotation] as [number, number, number];

        items[fromIdx].targetPos = [...items[toIdx].targetPos];
        items[fromIdx].targetRotation = [...items[toIdx].targetRotation];

        items[toIdx].targetPos = tempTargetPos;
        items[toIdx].targetRotation = tempTargetRot;
      }

      // Trigger high-energy re-order shimmer wave from drop site
      this.triggerReorderWave(toIdx, items.length);
      didReorder = true;
      swappedPair = [fromIdx, toIdx];
    }

    // Reset drag state
    this.dragState.isDragging = false;
    this.dragState.draggedIndex = -1;
    this.dragState.draggedId = null;
    this.dragState.nearestTargetIndex = -1;
    this.snapLineMat.opacity = 0;
    this.reticleMesh.visible = false;

    return { didReorder, swappedPair };
  }

  /**
   * Triggers a spatial re-order shimmer & pulse ripple wave
   */
  public triggerReorderWave(originIndex: number = -1, totalItems: number = 100, durationMs: number = 850) {
    this.reorderWave = {
      isActive: true,
      startTime: performance.now(),
      originIndex: originIndex >= 0 ? originIndex : Math.floor(totalItems / 2),
      durationMs,
      waveSpeed: Math.max(8, Math.min(22, 1200 / Math.max(1, totalItems))),
    };
  }

  public isDragging(): boolean {
    return this.dragState.isDragging;
  }

  public getDraggedIndex(): number {
    return this.dragState.draggedIndex;
  }

  public getNearestTargetIndex(): number {
    return this.dragState.nearestTargetIndex;
  }

  /**
   * Computes per-node dynamic shimmer, pulse, and elevation modifiers
   */
  public evaluateNode(
    index: number,
    item: PhotoMemoryItem,
    timestamp: number,
    camera: THREE.PerspectiveCamera
  ): NodeAnimationFeedback {
    const isDragged = this.dragState.isDragging && this.dragState.draggedIndex === index;
    const isSnapTarget = this.dragState.isDragging && this.dragState.nearestTargetIndex === index;

    let scaleMultiplier = 1.0;
    let opacityMultiplier = 1.0;
    let shimmerIntensity = 0.0;
    let haloOpacity = 0.0;
    let haloColor = 0x38bdf8;
    this.vTempElevation.set(0, 0, 0);
    let isReordering = false;

    camera.getWorldDirection(this.vCamDir);

    // 1. Dragged Node: Active breathing pulse, forward elevation & iridescent shimmer
    if (isDragged) {
      const dragElapsed = timestamp - this.dragState.dragStartTime;
      // Organic pulse breathing oscillation
      const pulseOsc = Math.sin(dragElapsed * 0.012) * 0.08;
      scaleMultiplier = 1.36 + pulseOsc;

      // Subtle high-frequency shimmer tremor on scale & brightness
      const shimmerTremor = Math.sin(timestamp * 0.035) * 0.03;
      scaleMultiplier += shimmerTremor;

      shimmerIntensity = 0.95 + Math.sin(timestamp * 0.02) * 0.05;
      haloOpacity = 0.98;

      // Dynamic iridescent shimmer cycling between native hue, electric cyan and gold
      const hueShift = (item.hue + Math.sin(timestamp * 0.008) * 45 + 360) % 360;
      haloColor = this.hslToHex(hueShift, 95, 60);

      // Elevate forward toward camera so it effortlessly floats above the matrix
      this.vTempElevation.copy(this.vCamDir).multiplyScalar(-48);
    }
    // 2. Magnetic Snap Target Slot: Anticipation pulse & amber beacon
    else if (isSnapTarget) {
      const targetPulse = Math.sin(timestamp * 0.018) * 0.09;
      scaleMultiplier = 1.18 + targetPulse;
      shimmerIntensity = 0.75 + Math.sin(timestamp * 0.025) * 0.15;
      haloOpacity = 0.92;
      haloColor = 0xfbbf24; // Amber Gold target highlight
      this.vTempElevation.copy(this.vCamDir).multiplyScalar(-24);
    }

    // 3. Re-order Ripple Wave: Staggered pulse and shimmer sweeping across the nodes
    if (this.reorderWave.isActive) {
      const timeSinceWaveStart = timestamp - this.reorderWave.startTime;
      const totalWaveLifetime = this.reorderWave.durationMs + 600;

      if (timeSinceWaveStart > totalWaveLifetime) {
        this.reorderWave.isActive = false;
      } else {
        // Distance from wave epicenter
        const distFromCenter = Math.abs(index - this.reorderWave.originIndex);
        const nodeWaveArrival = distFromCenter * this.reorderWave.waveSpeed;
        const nodeElapsed = timeSinceWaveStart - nodeWaveArrival;

        if (nodeElapsed > 0 && nodeElapsed < this.reorderWave.durationMs) {
          isReordering = true;
          const progress = nodeElapsed / this.reorderWave.durationMs;

          // Elastic bell curve pulse
          const waveElevation = Math.sin(progress * Math.PI);
          // High-energy decay shimmer
          const waveShimmer = Math.sin(progress * Math.PI * 6.5) * (1.0 - progress);

          scaleMultiplier += waveElevation * 0.24 + waveShimmer * 0.06;
          shimmerIntensity = Math.max(shimmerIntensity, waveElevation * 0.88);
          haloOpacity = Math.max(haloOpacity, waveElevation * 0.85);

          // Blend halo color towards golden-cyan celebration sheen
          const blendHue = (item.hue + waveElevation * 60) % 360;
          haloColor = this.hslToHex(blendHue, 90, 65);

          // Wave elevation towards camera
          this.vTempElevation.addScaledVector(this.vCamDir, -waveElevation * 32);
        }
      }
    }

    return {
      scaleMultiplier,
      opacityMultiplier,
      shimmerIntensity,
      haloOpacity,
      haloColor,
      elevationOffset: this.vTempElevation,
      isDragged,
      isSnapTarget,
      isReordering,
    };
  }

  private hslToHex(h: number, s: number, l: number): number {
    h = (h % 360) / 360;
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;

    let r: number, g: number, b: number;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }

    const ir = Math.round(r * 255);
    const ig = Math.round(g * 255);
    const ib = Math.round(b * 255);
    return (ir << 16) | (ig << 8) | ib;
  }

  public dispose() {
    this.snapLineGeo.dispose();
    this.snapLineMat.dispose();
    this.reticleGeo.dispose();
    this.reticleMat.dispose();
    if (this.magneticGroup.parent) {
      this.magneticGroup.parent.remove(this.magneticGroup);
    }
  }
}
