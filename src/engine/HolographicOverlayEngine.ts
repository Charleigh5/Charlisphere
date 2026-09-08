/**
 * HolographicOverlayEngine.ts
 * PhotoSphere 3D Memory Matrix - Spatial Holographic Metadata Overlays
 * 
 * Provides subtle, floating holographic HUD telemetry overlays anchored to selected
 * and focused memory nodes in the 3D scene, rendering location, date, and AI-generated tags.
 */

import * as THREE from 'three';
import { PhotoMemoryItem, ExifData } from '../types';

export interface HoloOverlayConfig {
  enabled: boolean;
  maxSimultaneousOverlays: number;
  canvasWidth: number;
  canvasHeight: number;
  spriteScaleX: number;
  spriteScaleY: number;
  tetherColor: number;
  tetherFocusColor: number;
  offsetDistanceX: number;
  offsetDistanceY: number;
  floatAmplitude: number;
  floatFrequency: number;
}

export const DEFAULT_HOLO_CONFIG: HoloOverlayConfig = {
  enabled: true,
  maxSimultaneousOverlays: 8,
  canvasWidth: 540,
  canvasHeight: 240,
  spriteScaleX: 115,
  spriteScaleY: 51,
  tetherColor: 0x38bdf8, // Sky Cyan
  tetherFocusColor: 0xfbbf24, // Amber Gold
  offsetDistanceX: 85,
  offsetDistanceY: 35,
  floatAmplitude: 3.5,
  floatFrequency: 0.0025,
};

/**
 * Formats epoch timestamp into clean human-readable date
 */
export function formatHoloDate(timestamp: number): string {
  if (!timestamp || isNaN(timestamp)) {
    return 'Undated Memory';
  }
  try {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Undated Memory';
  }
}

/**
 * Formats EXIF geolocation or metadata into a concise holographic location string
 */
export function formatHoloLocation(exif?: ExifData): string {
  if (!exif) return 'Earth Orbit • Global Grid';
  if (exif.locationName && exif.locationName.trim().length > 0) {
    const name = exif.locationName.trim();
    return name.length > 28 ? name.slice(0, 26) + '…' : name;
  }
  if (typeof exif.latitude === 'number' && typeof exif.longitude === 'number') {
    const latHemi = exif.latitude >= 0 ? 'N' : 'S';
    const lonHemi = exif.longitude >= 0 ? 'E' : 'W';
    return `${Math.abs(exif.latitude).toFixed(2)}°${latHemi}, ${Math.abs(exif.longitude).toFixed(2)}°${lonHemi}`;
  }
  return 'Earth Orbit • Global Grid';
}

/**
 * Extracts and sanitizes AI-generated tags for spatial HUD display
 */
export function formatHoloTags(tags?: string[], maxCount: number = 3): string[] {
  if (!tags || !tags.length) {
    return ['#memory', '#visual'];
  }
  return tags
    .filter((t) => Boolean(t && t.trim().length > 0))
    .slice(0, maxCount)
    .map((t) => {
      const clean = t.trim().toLowerCase().replace(/\s+/g, '-');
      return clean.startsWith('#') ? clean : `#${clean}`;
    });
}

/**
 * Generates high-DPI 2D canvas texture for holographic metadata banner
 */
export function createHoloTexture(
  item: PhotoMemoryItem,
  isFocused: boolean = false,
  config: HoloOverlayConfig = DEFAULT_HOLO_CONFIG
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = config.canvasWidth;
  canvas.height = config.canvasHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    const fallback = new THREE.CanvasTexture(canvas);
    return fallback;
  }

  const w = config.canvasWidth;
  const h = config.canvasHeight;
  const pad = 12;
  const primaryColor = isFocused ? '#fbbf24' : (item.dominantColor || '#38bdf8');
  const accentGlow = isFocused ? 'rgba(251, 191, 36, 0.45)' : 'rgba(56, 189, 248, 0.40)';

  ctx.clearRect(0, 0, w, h);

  // 1. Futuristic Glassmorphic Background Backplate
  ctx.save();
  ctx.shadowColor = accentGlow;
  ctx.shadowBlur = isFocused ? 26 : 18;
  ctx.fillStyle = 'rgba(6, 11, 24, 0.88)';

  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(pad, pad, w - pad * 2, h - pad * 2, 16);
  } else {
    ctx.rect(pad, pad, w - pad * 2, h - pad * 2);
  }
  ctx.fill();

  // Subtle luminous cyber boundary stroke
  ctx.lineWidth = isFocused ? 2.5 : 1.8;
  ctx.strokeStyle = primaryColor;
  ctx.stroke();
  ctx.restore();

  // 2. Subtle Holographic Scanline Sheen
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
  for (let y = pad + 4; y < h - pad; y += 8) {
    ctx.fillRect(pad + 4, y, w - pad * 2 - 8, 2);
  }

  // Top Light Gradient
  const topGrad = ctx.createLinearGradient(pad, pad, pad, pad + 45);
  topGrad.addColorStop(0, isFocused ? 'rgba(251, 191, 36, 0.15)' : 'rgba(56, 189, 248, 0.12)');
  topGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(pad, pad, w - pad * 2, 45);
  ctx.restore();

  // 3. High-Tech Corner Reticle Brackets (HUD Styling)
  ctx.save();
  ctx.strokeStyle = primaryColor;
  ctx.lineWidth = 2.5;
  const bracketLen = 14;

  // Top-Left
  ctx.beginPath();
  ctx.moveTo(pad + 6, pad + 6 + bracketLen);
  ctx.lineTo(pad + 6, pad + 6);
  ctx.lineTo(pad + 6 + bracketLen, pad + 6);
  ctx.stroke();

  // Top-Right
  ctx.beginPath();
  ctx.moveTo(w - pad - 6 - bracketLen, pad + 6);
  ctx.lineTo(w - pad - 6, pad + 6);
  ctx.lineTo(w - pad - 6, pad + 6 + bracketLen);
  ctx.stroke();

  // Bottom-Left
  ctx.beginPath();
  ctx.moveTo(pad + 6, h - pad - 6 - bracketLen);
  ctx.lineTo(pad + 6, h - pad - 6);
  ctx.lineTo(pad + 6 + bracketLen, h - pad - 6);
  ctx.stroke();

  // Bottom-Right
  ctx.beginPath();
  ctx.moveTo(w - pad - 6 - bracketLen, h - pad - 6);
  ctx.lineTo(w - pad - 6, h - pad - 6);
  ctx.lineTo(w - pad - 6, h - pad - 6 - bracketLen);
  ctx.stroke();
  ctx.restore();

  // 4. Header Bar: Holographic Node Identifier
  ctx.save();
  // Status Pill Background
  ctx.fillStyle = isFocused ? 'rgba(251, 191, 36, 0.14)' : 'rgba(56, 189, 248, 0.12)';
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(pad + 18, pad + 14, 180, 22, 11);
    ctx.fill();
  } else {
    ctx.fillRect(pad + 18, pad + 14, 180, 22);
  }

  // Glowing Cyber Dot
  ctx.fillStyle = primaryColor;
  ctx.shadowColor = primaryColor;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(pad + 28, pad + 25, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Category / Node Tag
  ctx.save();
  ctx.fillStyle = '#e2e8f0';
  ctx.font = "bold 10px 'Plus Jakarta Sans', system-ui, sans-serif";
  const headerText = isFocused ? 'FOCUSED MEMORY NODE' : 'SPATIAL NODE • METADATA';
  ctx.fillText(headerText, pad + 38, pad + 29);

  // Category Badge (Right Side)
  const categoryStr = (item.category || 'Memory').toUpperCase();
  ctx.fillStyle = isFocused ? '#fde68a' : '#7dd3fc';
  ctx.font = "bold 10px 'Plus Jakarta Sans', monospace";
  ctx.textAlign = 'right';
  ctx.fillText(`[ ${categoryStr} ]`, w - pad - 18, pad + 29);
  ctx.restore();

  // 5. Memory Title
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.font = "bold 20px 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 4;
  const title = item.title && item.title.trim().length > 0 ? item.title : 'Untitled Memory';
  const displayTitle = title.length > 32 ? title.slice(0, 30) + '…' : title;
  ctx.fillText(displayTitle, pad + 18, pad + 66);
  ctx.restore();

  // 6. Metadata Row: Date & Geolocation
  const formattedDate = formatHoloDate(item.timestamp);
  const formattedLoc = formatHoloLocation(item.exif);

  ctx.save();
  // Date Row
  ctx.fillStyle = '#38bdf8';
  ctx.font = "14px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillText('📅', pad + 18, pad + 98);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = "500 13px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillText(formattedDate, pad + 38, pad + 98);

  // Geolocation Row
  ctx.fillStyle = '#f43f5e';
  ctx.font = "14px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillText('📍', pad + 18, pad + 128);

  ctx.fillStyle = '#94a3b8';
  ctx.font = "500 13px 'Plus Jakarta Sans', system-ui, sans-serif";
  ctx.fillText(formattedLoc, pad + 38, pad + 128);
  ctx.restore();

  // Divider Line
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad + 18, pad + 146);
  ctx.lineTo(w - pad - 18, pad + 146);
  ctx.stroke();
  ctx.restore();

  // 7. AI-Generated Semantic Tags Section
  ctx.save();
  ctx.fillStyle = isFocused ? '#fbbf24' : '#38bdf8';
  ctx.font = "bold 10px 'Plus Jakarta Sans', monospace";
  ctx.fillText('✨ AI SEMANTIC TAGS:', pad + 18, pad + 168);

  const tags = formatHoloTags(item.tags, 3);
  let tagStartX = pad + 18;
  const tagY = pad + 180;

  tags.forEach((tag) => {
    ctx.font = "bold 11px 'Plus Jakarta Sans', monospace";
    const textMetrics = ctx.measureText(tag);
    const pillWidth = textMetrics.width + 18;
    const pillHeight = 22;

    if (tagStartX + pillWidth < w - pad - 18) {
      // Pill Background
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.strokeStyle = isFocused ? 'rgba(251, 191, 36, 0.4)' : 'rgba(56, 189, 248, 0.35)';
      ctx.lineWidth = 1;

      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(tagStartX, tagY, pillWidth, pillHeight, 6);
      } else {
        ctx.rect(tagStartX, tagY, pillWidth, pillHeight);
      }
      ctx.fill();
      ctx.stroke();

      // Tag Text
      ctx.fillStyle = isFocused ? '#fde68a' : '#bae6fd';
      ctx.fillText(tag, tagStartX + 9, tagY + 15);

      tagStartX += pillWidth + 8;
    }
  });

  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

interface ActiveHoloNode {
  itemId: string;
  isFocused: boolean;
  sprite: THREE.Sprite;
  tetherLine: THREE.Line;
  tetherGeometry: THREE.BufferGeometry;
  texture: THREE.CanvasTexture;
  targetPos: THREE.Vector3;
  currentPos: THREE.Vector3;
  targetOpacity: number;
  currentOpacity: number;
  cacheKey: string;
}

/**
 * HolographicOverlayManager
 * Coordinates spatial life-cycle, rendering, dynamic tether lines, and billboarding
 * for holographic metadata overlays in the Three.js scene.
 */
export class HolographicOverlayManager {
  private group: THREE.Group;
  private activeNodes: Map<string, ActiveHoloNode> = new Map();
  private config: HoloOverlayConfig;
  private vCardCenter = new THREE.Vector3();
  private vCamRight = new THREE.Vector3();
  private vCamUp = new THREE.Vector3();
  private vTarget = new THREE.Vector3();

  constructor(scene: THREE.Group | THREE.Scene, config: Partial<HoloOverlayConfig> = {}) {
    this.config = { ...DEFAULT_HOLO_CONFIG, ...config };
    this.group = new THREE.Group();
    this.group.name = 'PhotoSphere_HolographicOverlays';
    scene.add(this.group);
  }

  public setEnabled(enabled: boolean) {
    this.config.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.config.enabled;
  }

  public getActiveOverlayCount(): number {
    return this.activeNodes.size;
  }

  /**
   * Updates holographic overlays for current selection & focus state
   */
  public update(
    selectedIds: Set<string>,
    focusedItem: PhotoMemoryItem | null,
    items: PhotoMemoryItem[],
    showOverlays: boolean,
    timestamp: number,
    camera: THREE.PerspectiveCamera
  ) {
    const isGloballyEnabled = showOverlays && this.config.enabled;

    // Collect targeted items (focused item always takes priority, then selected items up to cap)
    const targetItemMap = new Map<string, { item: PhotoMemoryItem; isFocused: boolean }>();

    if (isGloballyEnabled) {
      if (focusedItem) {
        targetItemMap.set(focusedItem.id, { item: focusedItem, isFocused: true });
      }

      if (selectedIds && selectedIds.size > 0) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (selectedIds.has(item.id) && !targetItemMap.has(item.id)) {
            if (targetItemMap.size >= this.config.maxSimultaneousOverlays) break;
            targetItemMap.set(item.id, { item, isFocused: false });
          }
        }
      }
    }

    // Camera basis vectors for billboard offset calculation
    this.vCamRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    this.vCamUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();

    // 1. Remove or fade out nodes that are no longer targeted
    const toRemove: string[] = [];
    this.activeNodes.forEach((node, id) => {
      if (!targetItemMap.has(id)) {
        node.targetOpacity = 0.0;
        node.currentOpacity += (0.0 - node.currentOpacity) * 0.18;
        node.sprite.material.opacity = node.currentOpacity;
        (node.tetherLine.material as THREE.LineBasicMaterial).opacity = node.currentOpacity * 0.65;

        if (node.currentOpacity < 0.02) {
          toRemove.push(id);
        }
      }
    });

    toRemove.forEach((id) => {
      this.destroyNode(id);
    });

    // 2. Spawn or update targeted nodes
    let index = 0;
    targetItemMap.forEach(({ item, isFocused }, id) => {
      let node = this.activeNodes.get(id);
      const cacheKey = `${item.id}_${item.tags ? item.tags.join(',') : ''}_${item.exif?.locationName || ''}_${isFocused}`;

      this.vCardCenter.set(item.currentPos[0], item.currentPos[1], item.currentPos[2]);

      // Calculate billboard offset in camera-relative plane
      const floatOsc = Math.sin(timestamp * this.config.floatFrequency + index * 1.8) * this.config.floatAmplitude;
      const offsetX = this.config.offsetDistanceX;
      const offsetY = this.config.offsetDistanceY + floatOsc;

      this.vTarget.copy(this.vCardCenter)
        .addScaledVector(this.vCamRight, offsetX)
        .addScaledVector(this.vCamUp, offsetY);

      if (!node) {
        // Create new holographic overlay node
        const texture = createHoloTexture(item, isFocused, this.config);
        const spriteMat = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          opacity: 0,
          depthTest: false,
        });

        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(this.config.spriteScaleX, this.config.spriteScaleY, 1);
        sprite.position.copy(this.vTarget);

        // Tether Line connecting node corner to holographic overlay
        const tetherPositions = new Float32Array(6);
        tetherPositions[0] = this.vCardCenter.x;
        tetherPositions[1] = this.vCardCenter.y;
        tetherPositions[2] = this.vCardCenter.z;
        tetherPositions[3] = this.vTarget.x;
        tetherPositions[4] = this.vTarget.y;
        tetherPositions[5] = this.vTarget.z;

        const tetherGeometry = new THREE.BufferGeometry();
        tetherGeometry.setAttribute('position', new THREE.BufferAttribute(tetherPositions, 3));

        const tetherMat = new THREE.LineBasicMaterial({
          color: isFocused ? this.config.tetherFocusColor : this.config.tetherColor,
          transparent: true,
          opacity: 0,
          depthTest: false,
        });

        const tetherLine = new THREE.Line(tetherGeometry, tetherMat);

        this.group.add(tetherLine);
        this.group.add(sprite);

        node = {
          itemId: id,
          isFocused,
          sprite,
          tetherLine,
          tetherGeometry,
          texture,
          targetPos: this.vTarget.clone(),
          currentPos: this.vTarget.clone(),
          targetOpacity: 0.96,
          currentOpacity: 0,
          cacheKey,
        };

        this.activeNodes.set(id, node);
      } else {
        // Check if focus or content updated, requiring texture refresh
        if (node.cacheKey !== cacheKey || node.isFocused !== isFocused) {
          node.texture.dispose();
          node.texture = createHoloTexture(item, isFocused, this.config);
          node.sprite.material.map = node.texture;
          node.sprite.material.needsUpdate = true;
          (node.tetherLine.material as THREE.LineBasicMaterial).color.setHex(
            isFocused ? this.config.tetherFocusColor : this.config.tetherColor
          );
          node.isFocused = isFocused;
          node.cacheKey = cacheKey;
        }

        node.targetPos.copy(this.vTarget);
        node.targetOpacity = 0.96;
      }

      // Smooth interpolation for floating motion
      node.currentPos.lerp(node.targetPos, 0.14);
      node.sprite.position.copy(node.currentPos);

      node.currentOpacity += (node.targetOpacity - node.currentOpacity) * 0.15;
      node.sprite.material.opacity = node.currentOpacity;

      // Update tether line coordinates
      const posAttr = node.tetherGeometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;

      // Start tether from card position
      arr[0] = this.vCardCenter.x;
      arr[1] = this.vCardCenter.y;
      arr[2] = this.vCardCenter.z;

      // End tether at left edge of the holographic overlay
      const tetherEnd = this.vTarget.clone().addScaledVector(this.vCamRight, -this.config.spriteScaleX * 0.42);
      arr[3] = tetherEnd.x;
      arr[4] = tetherEnd.y;
      arr[5] = tetherEnd.z;

      posAttr.needsUpdate = true;
      (node.tetherLine.material as THREE.LineBasicMaterial).opacity = node.currentOpacity * 0.70;

      index++;
    });
  }

  private destroyNode(id: string) {
    const node = this.activeNodes.get(id);
    if (!node) return;

    this.group.remove(node.sprite);
    this.group.remove(node.tetherLine);

    node.texture.dispose();
    node.sprite.material.dispose();
    node.tetherGeometry.dispose();
    (node.tetherLine.material as THREE.Material).dispose();

    this.activeNodes.delete(id);
  }

  public clear() {
    this.activeNodes.forEach((_, id) => {
      this.destroyNode(id);
    });
    this.activeNodes.clear();
  }

  public dispose() {
    this.clear();
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}
