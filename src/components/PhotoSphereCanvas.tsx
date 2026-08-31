/**
 * PhotoSphereCanvas.tsx
 * High-performance WebGL 3D Spatial Canvas powered by Three.js.
 * Handles continuous 60fps rendering, cubic layout interpolation, touch ergonomics,
 * camera kinematics, and screen-space lasso picking.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { TAARenderPass } from 'three/addons/postprocessing/TAARenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PhotoMemoryItem, Layout3DMode, SpatialSortMode, SpatialClusterTheme } from '../types';
import { SpatialLayoutEngine } from '../math/SpatialLayoutEngine';
import { TextureManager } from '../engine/TextureManager';
import { AudioSynthesizer } from '../engine/AudioSynthesizer';
import { SpatialAudioProcessor } from '../engine/SpatialAudioProcessor';
import { VectorNlpEngine } from '../engine/VectorNlpEngine';
import { WebXREngine } from '../engine/WebXREngine';

export const IDLE_AUTO_ORBIT_DELAY_MS = 5000;
export const AUTO_ORBIT_SPEED_RAD_PER_SEC = 0.065;

export interface XRControllerHandle {
  startVR: (performanceMode?: boolean, gestureSensitivity?: number) => Promise<void>;
  endVR: () => Promise<void>;
  isPresenting: boolean;
}

export interface TaaMotionState {
  sampleLevel: number; // 0 (1 sample), 1 (2 samples), 2 (4 samples), 3 (8 samples)
  accumulate: boolean;
  mode: 'STATIONARY_ACCUMULATE' | 'GENTLE_MOTION' | 'HIGH_SPEED_JITTER';
}

/**
 * Computes optimal camera spherical coordinates (targetTheta, targetPhi, targetRadius, targetPanOffset)
 * to smoothly frame and orbit around a specific 3D photo memory point.
 */
export function computeFocusCameraTransform(
  itemPos: [number, number, number],
  focusDistance = 320
): {
  targetTheta: number;
  targetPhi: number;
  targetRadius: number;
  targetPanOffset: [number, number, number];
} {
  const [px, py, pz] = itemPos;
  const dist = Math.hypot(px, py, pz);

  let targetTheta = 0;
  let targetPhi = Math.PI / 2;

  if (dist > 1e-4) {
    const nx = px / dist;
    const ny = py / dist;
    const nz = pz / dist;

    // Polar angle from Y axis (clamped to prevent gimbal lock singularity)
    targetPhi = Math.acos(Math.max(-0.999, Math.min(0.999, ny)));
    targetPhi = Math.max(0.08, Math.min(3.06, targetPhi));

    // Azimuthal angle around Y axis
    targetTheta = Math.atan2(nx, nz);
  }

  return {
    targetTheta,
    targetPhi,
    targetRadius: focusDistance,
    targetPanOffset: [px, py, pz],
  };
}

/**
 * Computes optimal Temporal Anti-Aliasing (TAA) sample level and accumulation
 * based on angular rotation velocity, zooming, panning, and user gestures.
 */
export function computeTaaMotionState(
  dTheta: number,
  dPhi: number,
  dRadius: number,
  dPan: number,
  isUserInteracting: boolean
): TaaMotionState {
  const isHighSpeed = dTheta > 0.003 || dPhi > 0.003 || dRadius > 2.0 || dPan > 1.5;
  const isMoving = dTheta > 0.0002 || dPhi > 0.0002 || dRadius > 0.1 || dPan > 0.05 || isUserInteracting;

  if (isHighSpeed) {
    return {
      sampleLevel: 2, // 4 sub-pixel jitter samples per frame for sharp, blur-free high-speed rotation
      accumulate: false,
      mode: 'HIGH_SPEED_JITTER',
    };
  } else if (isMoving) {
    return {
      sampleLevel: 1, // 2 sub-pixel jitter samples per frame for smooth continuous orbit
      accumulate: false,
      mode: 'GENTLE_MOTION',
    };
  } else {
    return {
      sampleLevel: 0, // 1 sample per frame with temporal frame accumulation
      accumulate: true,
      mode: 'STATIONARY_ACCUMULATE',
    };
  }
}

interface Props {
  items: PhotoMemoryItem[];
  layoutMode: Layout3DMode;
  sortMode: SpatialSortMode;
  searchQuery: string;
  selectedIds: Set<string>;
  focusedItem: PhotoMemoryItem | null;
  showClusterLabels?: boolean;
  onSelectCard: (item: PhotoMemoryItem) => void;
  onFocusItem: (item: PhotoMemoryItem | null) => void;
  onLassoSelect: (selectedIds: string[]) => void;
  onToggleSelectId: (id: string) => void;
  onLayoutChange?: (mode: Layout3DMode) => void;
  onSearchChange?: (query: string) => void;
  onToggleClusterLabels?: () => void;
  onStatsUpdate: (stats: {
    photoCount: number;
    sphereRadius: number;
    cameraDistance: number;
    fps: number;
    drawCalls: number;
  }) => void;
  onXRReady?: (xr: XRControllerHandle) => void;
  onVRStateChange?: (isVR: boolean) => void;
  vrPerformanceMode?: boolean;
  vrGestureSensitivity?: number;
}

export const PhotoSphereCanvas: React.FC<Props> = ({
  items,
  layoutMode,
  sortMode,
  searchQuery,
  selectedIds,
  focusedItem,
  showClusterLabels = true,
  onSelectCard,
  onFocusItem,
  onLassoSelect,
  onToggleSelectId,
  onLayoutChange,
  onSearchChange,
  onToggleClusterLabels,
  onStatsUpdate,
  onXRReady,
  onVRStateChange,
  vrPerformanceMode = true,
  vrGestureSensitivity = 1.0,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Three.js References (persistent, zero allocation in render loop)
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const taaPassRef = useRef<TAARenderPass | null>(null);
  const starGeoRef = useRef<THREE.BufferGeometry | null>(null);
  const starMatRef = useRef<THREE.PointsMaterial | null>(null);
  const cardsGroupRef = useRef<THREE.Group | null>(null);
  const haloGroupRef = useRef<THREE.Group | null>(null);
  const labelsGroupRef = useRef<THREE.Group | null>(null);

  // Previous camera kinematics for delta motion detection (TAA adaptive jitter)
  const prevCamThetaRef = useRef(Math.PI / 4);
  const prevCamPhiRef = useRef(Math.PI / 2.2);
  const prevCamRadiusRef = useRef(1200);
  const prevPanOffsetRef = useRef(new THREE.Vector3(0, 0, 0));

  // NLP Engine instance for cluster theme synthesis
  const nlpEngineRef = useRef(new VectorNlpEngine());

  // Dynamic 3D Cluster Theme Labels Sprite State
  const labelSpritesRef = useRef<
    Array<{
      sprite: THREE.Sprite;
      targetPos: [number, number, number];
      currentPos: [number, number, number];
      targetOpacity: number;
      currentOpacity: number;
      theme: SpatialClusterTheme;
    }>
  >([]);

  // Mesh and material pool
  const meshPoolRef = useRef<THREE.Mesh[]>([]);
  const haloMeshPoolRef = useRef<THREE.Mesh[]>([]);
  const sharedGeometryRef = useRef<THREE.PlaneGeometry | null>(null);
  const sharedHaloGeometryRef = useRef<THREE.PlaneGeometry | null>(null);
  const haloMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);

  // Camera Orbit, Pan & Kinematics State
  const cameraState = useRef({
    theta: Math.PI / 4, // Azimuthal angle
    phi: Math.PI / 2.2, // Polar angle (clamped in [0.05, 3.09])
    radius: 1200,
    targetRadius: 1200,
    targetTheta: Math.PI / 4,
    targetPhi: Math.PI / 2.2,

    // 3D Focus point for camera pan
    panOffset: new THREE.Vector3(0, 0, 0),
    targetPanOffset: new THREE.Vector3(0, 0, 0),

    isDragging: false,
    isMultiTouching: false,
    prevPointer: { x: 0, y: 0 },
    touchPinchDist: 0,
    touchAngle: 0,
    touchMidpoint: { x: 0, y: 0 },
    momentum: { x: 0, y: 0 },
    panMomentum: new THREE.Vector3(0, 0, 0),
    zoomMomentum: 0,
  });

  // Dedicated Touch Tracking State
  const touchState = useRef({
    activeTouchCount: 0,
    touchStartTime: 0,
    hasMovedSignificantly: false,
    lastTapTime: 0,
    lastTapPos: { x: 0, y: 0 },
    singleTouchStart: { x: 0, y: 0 },
    prevSingleTouch: { x: 0, y: 0, time: 0 },
  });

  // Active gesture visual feedback state (Pinch Zoom, Two-Finger Rotate, Two-Finger Pan, Focus)
  const [activeGesture, setActiveGesture] = React.useState<{
    type: 'ZOOM' | 'ROTATE' | 'PAN' | 'RECENTER' | 'FOCUS';
    label: string;
  } | null>(null);
  const gestureTimerRef = useRef<number | null>(null);

  // Hover & Raycasting state
  const raycasterRef = useRef(new THREE.Raycaster());
  const mousePosRef = useRef(new THREE.Vector2(-999, -999));
  const hoveredIndexRef = useRef<number | null>(null);
  const lastRaycastTimeRef = useRef(0);

  // Animation & FPS measurement
  const animFrameIdRef = useRef<number>(0);
  const lastTimeRef = useRef(performance.now());
  const frameCountRef = useRef(0);
  const fpsRef = useRef(60);

  // Lasso Selection 2D Overlay
  const isLassoActiveRef = useRef(false);
  const lassoPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const lassoCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // User Activity Timestamp for Idle Auto-Orbit
  const lastUserActivityRef = useRef<number>(performance.now());
  const recordUserActivity = useCallback(() => {
    lastUserActivityRef.current = performance.now();
  }, []);

  /**
   * Update target transforms whenever items, layoutMode or sortMode changes
   */
  const updateTargetCoordinates = useCallback((instant = false) => {
    if (!items.length) return;
    const transforms = SpatialLayoutEngine.calculateTargetTransforms(items, layoutMode, sortMode);

    for (let i = 0; i < items.length; i++) {
      if (transforms[i]) {
        items[i].targetPos = transforms[i].position;
        items[i].targetRotation = transforms[i].rotation;
        if (instant || (items[i].currentPos[0] === 0 && items[i].currentPos[1] === 0 && items[i].currentPos[2] === 0)) {
          items[i].currentPos = [transforms[i].position[0], transforms[i].position[1], transforms[i].position[2]];
          items[i].rotation = [transforms[i].rotation[0], transforms[i].rotation[1], transforms[i].rotation[2]];
        }
      }
    }
  }, [items, layoutMode, sortMode]);

  useEffect(() => {
    updateTargetCoordinates(false);
  }, [updateTargetCoordinates]);

  /**
   * Adjust camera target distance based on viewport aspect ratio & radius
   */
  const updateAdaptiveCamera = useCallback(() => {
    if (!cameraRef.current || !containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    if (clientWidth === 0 || clientHeight === 0) return;
    const aspect = clientWidth / Math.max(1, clientHeight);
    cameraRef.current.aspect = aspect;
    cameraRef.current.updateProjectionMatrix();

    const targetDist = SpatialLayoutEngine.computeCameraDistance(items.length, 50, aspect);
    cameraState.current.targetRadius = targetDist;
  }, [items.length]);

  /**
   * Sync 3D Meshes with Items Array
   */
  const syncMeshes = useCallback(() => {
    const cardsGroup = cardsGroupRef.current;
    const haloGroup = haloGroupRef.current;
    const container = containerRef.current;
    if (!cardsGroup || !haloGroup || !container) return;

    const w = container.clientWidth || window.innerWidth || 1200;
    const h = container.clientHeight || window.innerHeight || 800;

    const dims = SpatialLayoutEngine.computeCardDimensions(w, h, items.length || 100);
    if (!sharedGeometryRef.current) {
      sharedGeometryRef.current = new THREE.PlaneGeometry(dims.width, dims.height);
    }
    if (!sharedHaloGeometryRef.current) {
      sharedHaloGeometryRef.current = new THREE.PlaneGeometry(dims.width * 1.25, dims.height * 1.25);
    }

    const currentMeshCount = meshPoolRef.current.length;
    const targetCount = items.length;

    // Allocate additional meshes if needed
    if (targetCount > currentMeshCount) {
      for (let i = currentMeshCount; i < targetCount; i++) {
        const item = items[i];
        const texture = TextureManager.getTextureForItem(item);
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: 1.0,
          side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(sharedGeometryRef.current, material);
        mesh.userData = { index: i, id: item.id };
        cardsGroup.add(mesh);
        meshPoolRef.current.push(mesh);

        // Halo selection Mesh
        const haloMat = new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
        });
        const haloMesh = new THREE.Mesh(sharedHaloGeometryRef.current, haloMat);
        haloMesh.position.z = -0.5; // behind card
        haloGroup.add(haloMesh);
        haloMeshPoolRef.current.push(haloMesh);
      }
    }

    // Update existing mesh maps and visibility
    for (let i = 0; i < meshPoolRef.current.length; i++) {
      const mesh = meshPoolRef.current[i];
      const haloMesh = haloMeshPoolRef.current[i];
      if (i < targetCount) {
        mesh.visible = true;
        haloMesh.visible = true;
        mesh.userData = { index: i, id: items[i].id };
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.map = TextureManager.getTextureForItem(items[i]);
      } else {
        mesh.visible = false;
        haloMesh.visible = false;
      }
    }
  }, [items]);

  /**
   * Generates a high-resolution canvas texture for a floating 3D cluster label
   */
  const createClusterLabelTexture = useCallback((theme: SpatialClusterTheme): THREE.CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      const texture = new THREE.CanvasTexture(canvas);
      return texture;
    }

    ctx.clearRect(0, 0, 640, 180);

    // Glassmorphic background container with ambient glow
    ctx.save();
    ctx.shadowColor = theme.color || '#38bdf8';
    ctx.shadowBlur = 24;
    ctx.fillStyle = 'rgba(6, 9, 20, 0.90)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(14, 14, 612, 152, 24);
    } else {
      ctx.rect(14, 14, 612, 152);
    }
    ctx.fill();

    // Border stroke matching theme color
    ctx.lineWidth = 3;
    ctx.strokeStyle = theme.color || '#38bdf8';
    ctx.stroke();
    ctx.restore();

    // Subtle top gradient sheen
    const grad = ctx.createLinearGradient(14, 14, 612, 14);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
    grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.02)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.08)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Category / Region Pill
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(32, 26, 320, 26, 13);
    } else {
      ctx.rect(32, 26, 320, 26);
    }
    ctx.fill();

    // Glowing Dot
    ctx.fillStyle = theme.color || '#38bdf8';
    ctx.shadowColor = theme.color || '#38bdf8';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(46, 39, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Region Header Text
    ctx.save();
    ctx.fillStyle = '#cbd5e1';
    ctx.font = "bold 13px 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
    ctx.fillText(`${(theme.category || 'THEME').toUpperCase()} REGION • ${theme.itemCount} MEMORIES`, 60, 44);

    // Title Text (NLP Theme Title)
    ctx.fillStyle = '#f8fafc';
    ctx.font = "bold 30px 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 6;
    ctx.fillText(theme.themeTitle, 34, 98);

    // Subtitle Text (NLP Contextual Summary)
    ctx.fillStyle = '#94a3b8';
    ctx.font = "18px 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif";
    ctx.fillText(theme.themeSubtitle, 34, 136);
    ctx.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  }, []);

  /**
   * Synchronize 3D Cluster Theme Labels with dynamic NLP synthesis
   */
  const syncClusterLabels = useCallback(() => {
    const labelsGroup = labelsGroupRef.current;
    if (!labelsGroup) return;

    if (!items.length) {
      labelSpritesRef.current.forEach(({ sprite }) => {
        labelsGroup.remove(sprite);
        if (sprite.material.map) sprite.material.map.dispose();
        sprite.material.dispose();
      });
      labelSpritesRef.current = [];
      return;
    }

    // Index items in NLP engine
    nlpEngineRef.current.indexItems(items);

    // Generate clusters
    const clusters = nlpEngineRef.current.generateSpatialClusters(items);

    // Clean up extra sprites if cluster count changed
    while (labelSpritesRef.current.length > clusters.length) {
      const removed = labelSpritesRef.current.pop();
      if (removed) {
        labelsGroup.remove(removed.sprite);
        if (removed.sprite.material.map) removed.sprite.material.map.dispose();
        removed.sprite.material.dispose();
      }
    }

    clusters.forEach((theme, idx) => {
      const existing = labelSpritesRef.current[idx];
      const targetOpacity = showClusterLabels ? 0.95 : 0.0;

      if (existing) {
        // Update texture & target
        if (existing.theme.themeTitle !== theme.themeTitle || existing.theme.itemCount !== theme.itemCount) {
          if (existing.sprite.material.map) existing.sprite.material.map.dispose();
          existing.sprite.material.map = createClusterLabelTexture(theme);
          existing.sprite.material.needsUpdate = true;
          existing.theme = theme;
        }
        existing.targetPos = theme.centroid;
        existing.targetOpacity = targetOpacity;
      } else {
        const texture = createClusterLabelTexture(theme);
        const spriteMat = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          opacity: 0,
          depthTest: false,
        });
        const sprite = new THREE.Sprite(spriteMat);
        // Sprite size in 3D scene units
        sprite.scale.set(190, 53, 1);
        sprite.position.set(theme.centroid[0], theme.centroid[1], theme.centroid[2]);

        labelsGroup.add(sprite);

        labelSpritesRef.current.push({
          sprite,
          targetPos: theme.centroid,
          currentPos: [theme.centroid[0], theme.centroid[1], theme.centroid[2]],
          targetOpacity,
          currentOpacity: 0,
          theme,
        });
      }
    });
  }, [items, showClusterLabels, createClusterLabelTexture]);

  /**
   * Initialize Three.js WebGL Scene
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth || 1200;
    const height = container.clientHeight || window.innerHeight || 800;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f); // Deep space neutral-950
    scene.fog = new THREE.FogExp2(0x0a0a0f, 0.0004);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 10, 8000);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: false, // TAA pipeline manages sub-pixel jitter and temporal anti-aliasing
      alpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.xr.enabled = true; // WebXR Device API immersion support
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Temporal Anti-Aliasing (TAA) Postprocessing Pipeline
    const composer = new EffectComposer(renderer);
    const taaRenderPass = new TAARenderPass(scene, camera, 0x0a0a0f, 1);
    taaRenderPass.unbiased = true;
    taaRenderPass.sampleLevel = 1; // 2 jittered samples by default
    taaRenderPass.accumulate = true;
    composer.addPass(taaRenderPass);

    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    composerRef.current = composer;
    taaPassRef.current = taaRenderPass;

    // Ambient Starfield Dust (Particle background)
    const starGeo = new THREE.BufferGeometry();
    const starCount = 1200;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      starPos[i] = (Math.random() - 0.5) * 5000;
      starPos[i + 1] = (Math.random() - 0.5) * 5000;
      starPos[i + 2] = (Math.random() - 0.5) * 5000;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0x94a3b8,
      size: 2.2,
      transparent: true,
      opacity: 0.35,
    });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);
    starGeoRef.current = starGeo;
    starMatRef.current = starMat;

    // Groups
    const cardsGroup = new THREE.Group();
    scene.add(cardsGroup);
    cardsGroupRef.current = cardsGroup;

    const haloGroup = new THREE.Group();
    scene.add(haloGroup);
    haloGroupRef.current = haloGroup;

    const labelsGroup = new THREE.Group();
    scene.add(labelsGroup);
    labelsGroupRef.current = labelsGroup;

    // Shared Geometries & Materials
    const { width: cardW, height: cardH } = SpatialLayoutEngine.computeCardDimensions(
      width,
      height,
      items.length || 100
    );
    sharedGeometryRef.current = new THREE.PlaneGeometry(cardW, cardH);
    sharedHaloGeometryRef.current = new THREE.PlaneGeometry(cardW * 1.25, cardH * 1.25);

    haloMaterialRef.current = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });

    // Populate initial meshes and positions
    updateTargetCoordinates(true);
    syncMeshes();
    updateAdaptiveCamera();

    // Resize Observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      cameraRef.current.aspect = w / Math.max(1, h);
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
      composerRef.current?.setSize(w, h);

      // Recompute card sizes dynamically
      if (sharedGeometryRef.current) {
        sharedGeometryRef.current.dispose();
        const dims = SpatialLayoutEngine.computeCardDimensions(w, h, items.length || 100);
        sharedGeometryRef.current = new THREE.PlaneGeometry(dims.width, dims.height);
        meshPoolRef.current.forEach((m) => {
          m.geometry = sharedGeometryRef.current!;
        });
      }
      updateAdaptiveCamera();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animFrameIdRef.current);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      sharedGeometryRef.current?.dispose();
      sharedHaloGeometryRef.current?.dispose();
      haloMaterialRef.current?.dispose();
      starGeo.dispose();
      starMat.dispose();
      meshPoolRef.current = [];
      haloMeshPoolRef.current = [];
      labelSpritesRef.current.forEach(({ sprite }) => {
        if (sprite.material.map) sprite.material.map.dispose();
        sprite.material.dispose();
      });
      labelSpritesRef.current = [];
      TextureManager.disposeAll();
      taaPassRef.current?.dispose();
      composerRef.current?.dispose();
      renderer.dispose();
    };
  }, []);

  /**
   * Sync 3D Meshes & Cluster Labels when items, layout, sort, or label toggles change
   */
  useEffect(() => {
    recordUserActivity();
    syncMeshes();
    syncClusterLabels();
    if (!focusedItem) {
      updateAdaptiveCamera();
    }
  }, [items, layoutMode, sortMode, searchQuery, selectedIds, showClusterLabels, focusedItem, syncMeshes, syncClusterLabels, updateAdaptiveCamera, recordUserActivity]);

  /**
   * Smoothly frame and lock camera into close-up orbit when focusedItem changes
   */
  useEffect(() => {
    recordUserActivity();
    if (focusedItem) {
      const transform = computeFocusCameraTransform(focusedItem.targetPos, 320);
      cameraState.current.targetPanOffset.set(
        transform.targetPanOffset[0],
        transform.targetPanOffset[1],
        transform.targetPanOffset[2]
      );
      cameraState.current.targetTheta = transform.targetTheta;
      cameraState.current.targetPhi = transform.targetPhi;
      cameraState.current.targetRadius = transform.targetRadius;
      cameraState.current.momentum = { x: 0, y: 0 };
      cameraState.current.panMomentum.set(0, 0, 0);
      cameraState.current.zoomMomentum = 0;
    } else {
      cameraState.current.targetPanOffset.set(0, 0, 0);
      const R = SpatialLayoutEngine.computeDynamicRadius(items.length);
      cameraState.current.targetRadius = Math.max(750, Math.min(3200, R * 2.2));
    }
  }, [focusedItem, items.length, recordUserActivity]);

  /**
   * Main 60 FPS Continuous Render & Kinematics Loop
   */
  useEffect(() => {
    let prevTimestamp = performance.now();

    const animate = (timestamp: number) => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      const delta = Math.min((timestamp - prevTimestamp) / 1000, 0.1);
      prevTimestamp = timestamp;

      // FPS Measurement
      frameCountRef.current++;
      if (timestamp - lastTimeRef.current >= 500) {
        fpsRef.current = Math.round((frameCountRef.current * 1000) / (timestamp - lastTimeRef.current));
        frameCountRef.current = 0;
        lastTimeRef.current = timestamp;

        if (rendererRef.current && items.length > 0) {
          const R = SpatialLayoutEngine.computeDynamicRadius(items.length);
          onStatsUpdate({
            photoCount: items.length,
            sphereRadius: Math.round(R),
            cameraDistance: Math.round(cameraState.current.radius),
            fps: fpsRef.current,
            drawCalls: rendererRef.current.info.render.calls,
          });
        }
      }

      // Smooth Camera Kinematics (Momentum, Easing & Idle Auto-Orbit)
      const cam = cameraState.current;
      const idleDuration = timestamp - lastUserActivityRef.current;
      const isIdle = idleDuration >= IDLE_AUTO_ORBIT_DELAY_MS;
      const canAutoOrbit = isIdle && !cam.isDragging && !cam.isMultiTouching && !isLassoActiveRef.current;

      if (canAutoOrbit) {
        // Smoothly ramp in auto-orbit speed over 1.2s to avoid abrupt jumps
        const ramp = Math.min(1, (idleDuration - IDLE_AUTO_ORBIT_DELAY_MS) / 1200);
        const orbitStep = AUTO_ORBIT_SPEED_RAD_PER_SEC * delta * ramp;

        cam.targetTheta += orbitStep;
        cam.theta += orbitStep;

        // Gently drift pan offset back toward central sphere origin only when not in Focus Mode
        if (!focusedItem && cam.targetPanOffset.lengthSq() > 0.001) {
          cam.targetPanOffset.multiplyScalar(Math.max(0, 1 - delta * 0.4 * ramp));
        }
      }

      // If in Focus Mode, dynamically track the focused item's current spatial position
      if (focusedItem) {
        const liveFocusedItem = items.find((i) => i.id === focusedItem.id);
        if (liveFocusedItem) {
          cam.targetPanOffset.set(
            liveFocusedItem.targetPos[0],
            liveFocusedItem.targetPos[1],
            liveFocusedItem.targetPos[2]
          );
        }
      }

      if (!cam.isDragging && !cam.isMultiTouching) {
        cam.theta += cam.momentum.x * delta * 50;
        cam.phi += cam.momentum.y * delta * 50;
        cam.momentum.x *= 0.92; // Dampening alpha
        cam.momentum.y *= 0.92;

        // Apply pan momentum
        cam.targetPanOffset.add(cam.panMomentum);
        cam.panMomentum.multiplyScalar(0.90);

        // Apply zoom momentum
        cam.targetRadius += cam.zoomMomentum;
        cam.zoomMomentum *= 0.88;
        cam.targetRadius = Math.max(350, Math.min(5000, cam.targetRadius));
      }

      // Smooth lerp to target spherical coordinates and pan focus
      cam.theta += (cam.targetTheta - cam.theta) * 0.12;
      cam.phi += (cam.targetPhi - cam.phi) * 0.12;
      cam.radius += (cam.targetRadius - cam.radius) * 0.1;
      cam.panOffset.lerp(cam.targetPanOffset, 0.12);

      // Gimbal Lock Prevention: Clamp polar angle phi in [0.05, 3.09]
      cam.phi = Math.max(0.05, Math.min(3.09, cam.phi));

      // Update camera 3D Cartesian coordinates relative to pan focal point
      if (cameraRef.current) {
        const cx = cam.panOffset.x + cam.radius * Math.sin(cam.phi) * Math.sin(cam.theta);
        const cy = cam.panOffset.y + cam.radius * Math.cos(cam.phi);
        const cz = cam.panOffset.z + cam.radius * Math.sin(cam.phi) * Math.cos(cam.theta);
        cameraRef.current.position.set(cx, cy, cz);
        cameraRef.current.lookAt(cam.panOffset.x, cam.panOffset.y, cam.panOffset.z);

        // Spatial Audio Processor: update 3D listener position, forward & up vectors
        const camForward = new THREE.Vector3();
        cameraRef.current.getWorldDirection(camForward);
        const camUp = cameraRef.current.up;

        SpatialAudioProcessor.updateListener(
          { x: cx, y: cy, z: cz },
          { x: camForward.x, y: camForward.y, z: camForward.z },
          { x: camUp.x, y: camUp.y, z: camUp.z }
        );

        // Real-time spatial tracking and distance attenuation to focused photo memory item
        if (focusedItem) {
          const liveFocusedItem = items.find((i) => i.id === focusedItem.id);
          const fPos = liveFocusedItem ? liveFocusedItem.currentPos : focusedItem.currentPos;
          SpatialAudioProcessor.updateFocusedItemSpatialAudio(
            [cx, cy, cz],
            fPos,
            focusedItem,
            { x: camForward.x, y: camForward.y, z: camForward.z },
            { x: camUp.x, y: camUp.y, z: camUp.z }
          );
        } else {
          SpatialAudioProcessor.updateFocusedItemSpatialAudio(
            [cx, cy, cz],
            null,
            null
          );
        }
      }

      // Throttled Raycasting on mouse pointer
      if (timestamp - lastRaycastTimeRef.current > 40 && cameraRef.current && !isLassoActiveRef.current) {
        lastRaycastTimeRef.current = timestamp;
        raycasterRef.current.setFromCamera(mousePosRef.current, cameraRef.current);
        const activeMeshes = meshPoolRef.current.filter((m) => m.visible);
        const intersects = raycasterRef.current.intersectObjects(activeMeshes);
        if (intersects.length > 0) {
          hoveredIndexRef.current = intersects[0].object.userData.index;
        } else {
          hoveredIndexRef.current = null;
        }
      }

      // Smooth Node Transform Interpolation (600ms-1200ms cubic ease)
      const lerpSpeed = 0.08; // Smooth 60fps convergence
      const isQuerying = searchQuery.trim().length > 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const mesh = meshPoolRef.current[i];
        const haloMesh = haloMeshPoolRef.current[i];
        if (!mesh || !haloMesh) continue;

        // Position Lerp
        item.currentPos[0] += (item.targetPos[0] - item.currentPos[0]) * lerpSpeed;
        item.currentPos[1] += (item.targetPos[1] - item.currentPos[1]) * lerpSpeed;
        item.currentPos[2] += (item.targetPos[2] - item.currentPos[2]) * lerpSpeed;
        mesh.position.set(item.currentPos[0], item.currentPos[1], item.currentPos[2]);
        haloMesh.position.set(item.currentPos[0], item.currentPos[1], item.currentPos[2]);

        // Card Orientation: Face outward or smoothly interpolate rotation
        mesh.rotation.set(item.targetRotation[0], item.targetRotation[1], item.targetRotation[2]);
        haloMesh.rotation.set(item.targetRotation[0], item.targetRotation[1], item.targetRotation[2]);

        // Visual State Attenuation based on Search NLP, Focus Mode & Selection
        const isHovered = hoveredIndexRef.current === i;
        const isSelected = selectedIds.has(item.id);
        const isMatching = !isQuerying || item.matchScore > 0.15;
        const isFocusedCard = focusedItem?.id === item.id;
        const isFocusModeActive = Boolean(focusedItem);

        let targetOpacity = 1.0;
        let targetScale = 1.0;
        let haloOpacity = 0.0;
        let haloColor = 0x38bdf8; // Cyan default

        if (isFocusedCard) {
          // Locked in Focus Mode: Full vividness and prominent glow
          targetOpacity = 1.0;
          targetScale = 1.42;
          haloOpacity = 0.95;
          haloColor = isSelected ? 0xfbbf24 : 0x38bdf8;
        } else if (isFocusModeActive) {
          // Background attenuation during Focus Mode for depth-of-field isolation
          targetOpacity = isMatching ? 0.20 : 0.04;
          targetScale = isMatching ? 0.85 : 0.4;
          haloOpacity = 0.0;
        } else if (!isMatching) {
          // Non-matching nodes attenuation (Section 6)
          targetOpacity = 0.06;
          targetScale = 0.5;
          haloOpacity = 0.0;
        } else if (isHovered || isSelected) {
          targetOpacity = 1.0;
          targetScale = 1.35;
          haloOpacity = 0.9;
          haloColor = isSelected ? 0xfbbf24 : 0x38bdf8; // Gold for selected, Cyan for hover
        } else if (isQuerying && item.matchScore > 0.5) {
          targetOpacity = 1.0;
          targetScale = 1.25;
          haloOpacity = 0.75;
          haloColor = 0x38bdf8;
        }

        item.opacity += (targetOpacity - item.opacity) * 0.15;
        item.scale += (targetScale - item.scale) * 0.15;

        mesh.scale.set(item.scale, item.scale, item.scale);
        haloMesh.scale.set(item.scale * 1.15, item.scale * 1.15, 1);

        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = item.opacity;

        const haloMat = haloMesh.material as THREE.MeshBasicMaterial;
        haloMat.opacity = haloOpacity;
        haloMat.color.setHex(haloColor);
      }

      // Dynamic 3D Cluster Theme Labels Interpolation & Floating Animation
      const clusterLabels = labelSpritesRef.current;
      for (let i = 0; i < clusterLabels.length; i++) {
        const cl = clusterLabels[i];
        cl.currentPos[0] += (cl.targetPos[0] - cl.currentPos[0]) * 0.08;
        cl.currentPos[1] += (cl.targetPos[1] - cl.currentPos[1]) * 0.08;
        cl.currentPos[2] += (cl.targetPos[2] - cl.currentPos[2]) * 0.08;

        cl.targetOpacity = showClusterLabels ? 0.95 : 0.0;
        cl.currentOpacity += (cl.targetOpacity - cl.currentOpacity) * 0.12;

        const floatOsc = Math.sin(timestamp * 0.002 + i * 1.5) * 4;

        cl.sprite.position.set(
          cl.currentPos[0],
          cl.currentPos[1] + floatOsc,
          cl.currentPos[2]
        );
        cl.sprite.material.opacity = cl.currentOpacity;
        cl.sprite.visible = cl.currentOpacity > 0.01;
      }

      // Temporal Anti-Aliasing (TAA) Dynamic Motion & Jitter Sampling Optimization
      const dTheta = Math.abs(cam.theta - prevCamThetaRef.current);
      const dPhi = Math.abs(cam.phi - prevCamPhiRef.current);
      const dRadius = Math.abs(cam.radius - prevCamRadiusRef.current);
      const dPan = cam.panOffset.distanceTo(prevPanOffsetRef.current);

      prevCamThetaRef.current = cam.theta;
      prevCamPhiRef.current = cam.phi;
      prevCamRadiusRef.current = cam.radius;
      prevPanOffsetRef.current.copy(cam.panOffset);

      const isUserInteracting = cam.isDragging || cam.isMultiTouching || isLassoActiveRef.current;
      const taaState = computeTaaMotionState(dTheta, dPhi, dRadius, dPan, isUserInteracting);

      if (taaPassRef.current) {
        taaPassRef.current.sampleLevel = taaState.sampleLevel;
        taaPassRef.current.accumulate = taaState.accumulate;
      }

      // WebXR 6DoF Controller Gestures & VR Menu Hover
      if (rendererRef.current?.xr?.isPresenting) {
        WebXREngine.updateVRMenuHover();
        WebXREngine.updateControllerGestures(
          delta,
          (dYaw, dPitch) => {
            if (cardsGroupRef.current && haloGroupRef.current && labelsGroupRef.current) {
              cardsGroupRef.current.rotation.y += dYaw;
              haloGroupRef.current.rotation.y += dYaw;
              labelsGroupRef.current.rotation.y += dYaw;

              cardsGroupRef.current.rotation.x = Math.max(
                -Math.PI / 3,
                Math.min(Math.PI / 3, cardsGroupRef.current.rotation.x + dPitch)
              );
              haloGroupRef.current.rotation.x = cardsGroupRef.current.rotation.x;
              labelsGroupRef.current.rotation.x = cardsGroupRef.current.rotation.x;
            }
          },
          (dScale) => {
            if (cardsGroupRef.current && haloGroupRef.current && labelsGroupRef.current) {
              const curScale = cardsGroupRef.current.scale.x;
              const nextScale = Math.max(0.35, Math.min(3.2, curScale * (1 + dScale)));
              cardsGroupRef.current.scale.set(nextScale, nextScale, nextScale);
              haloGroupRef.current.scale.set(nextScale, nextScale, nextScale);
              labelsGroupRef.current.scale.set(nextScale, nextScale, nextScale);
            }
          }
        );
      }

      // Render Three.js Scene via TAA EffectComposer Pipeline or direct stereo WebXR
      if (rendererRef.current?.xr?.isPresenting) {
        if (sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      } else if (composerRef.current) {
        composerRef.current.render();
      } else if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    if (rendererRef.current) {
      rendererRef.current.setAnimationLoop(animate);
    } else {
      animFrameIdRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (rendererRef.current) {
        rendererRef.current.setAnimationLoop(null);
      }
      cancelAnimationFrame(animFrameIdRef.current);
    };
  }, [items, searchQuery, selectedIds, onStatsUpdate]);

  /**
   * Sync VR gesture sensitivity multiplier with WebXREngine
   */
  useEffect(() => {
    WebXREngine.setGestureSensitivity(vrGestureSensitivity);
  }, [vrGestureSensitivity]);

  /**
   * Temporary visual feedback badge for active touch gestures
   */
  const triggerGestureFeedback = useCallback((type: 'ZOOM' | 'ROTATE' | 'PAN' | 'RECENTER' | 'FOCUS', label: string) => {
    setActiveGesture({ type, label });
    if (gestureTimerRef.current) clearTimeout(gestureTimerRef.current);
    gestureTimerRef.current = window.setTimeout(() => {
      setActiveGesture(null);
    }, 1100);
  }, []);

  /**
   * Adjust point cloud density and post-processing shaders dynamically based on VR performance mode
   */
  useEffect(() => {
    const isVR = rendererRef.current?.xr?.isPresenting || false;
    if (starGeoRef.current) {
      if (isVR && vrPerformanceMode) {
        // Reduce point cloud particle density to 250 points for 90FPS+ on standalone VR
        starGeoRef.current.setDrawRange(0, 250);
        if (starMatRef.current) {
          starMatRef.current.size = 1.8;
          starMatRef.current.opacity = 0.25;
        }
      } else {
        // Full ambient particle field
        starGeoRef.current.setDrawRange(0, 1200);
        if (starMatRef.current) {
          starMatRef.current.size = 2.2;
          starMatRef.current.opacity = 0.35;
        }
      }
    }

    if (rendererRef.current && isVR) {
      WebXREngine.applyPerformanceProfile(rendererRef.current, vrPerformanceMode);
    }
  }, [vrPerformanceMode]);

  /**
   * Expose WebXR session controller methods to parent component
   */
  useEffect(() => {
    if (!onXRReady) return;

    const startVR = async (customPerfMode?: boolean, customSensitivity?: number) => {
      if (!rendererRef.current || !sceneRef.current) {
        throw new Error('3D Scene Renderer is not ready.');
      }
      const perfMode = customPerfMode !== undefined ? customPerfMode : vrPerformanceMode;
      const sensitivity = customSensitivity !== undefined ? customSensitivity : vrGestureSensitivity;
      WebXREngine.setGestureSensitivity(sensitivity);

      await WebXREngine.startVRSession(
        rendererRef.current,
        () => {
          onVRStateChange?.(false);
          if (starGeoRef.current) {
            starGeoRef.current.setDrawRange(0, 1200);
          }
          if (cardsGroupRef.current && haloGroupRef.current && labelsGroupRef.current) {
            cardsGroupRef.current.rotation.set(0, 0, 0);
            haloGroupRef.current.rotation.set(0, 0, 0);
            labelsGroupRef.current.rotation.set(0, 0, 0);
            cardsGroupRef.current.scale.set(1, 1, 1);
            haloGroupRef.current.scale.set(1, 1, 1);
            labelsGroupRef.current.scale.set(1, 1, 1);
          }
          triggerGestureFeedback('RECENTER', 'Exited VR Immersion');
        },
        perfMode
      );

      // Reduce particle cloud density when VR Performance Mode is enabled
      if (starGeoRef.current && perfMode) {
        starGeoRef.current.setDrawRange(0, 250);
        if (starMatRef.current) {
          starMatRef.current.size = 1.8;
          starMatRef.current.opacity = 0.25;
        }
      }

      WebXREngine.setupControllers(rendererRef.current, sceneRef.current, (cardIndex) => {
        const item = items[cardIndex];
        if (item) {
          AudioSynthesizer.playCardSelect(item.hue);
          onSelectCard(item);
        }
      });

      // Attach 3D Wrist / Controller Overlay Menu
      WebXREngine.attachVRMenu(
        {
          onLayoutChange: (mode) => {
            onLayoutChange?.(mode);
            triggerGestureFeedback('FOCUS', `VR Layout: ${mode.replace('_', ' ')}`);
          },
          onSearchChange: (query) => {
            onSearchChange?.(query);
            triggerGestureFeedback('FOCUS', query ? `VR Filter: "${query}"` : 'VR Filter: All Memories');
          },
          onToggleLabels: () => {
            onToggleClusterLabels?.();
            triggerGestureFeedback('FOCUS', 'VR: Toggled Cluster Labels');
          },
          onResetView: () => {
            if (cardsGroupRef.current && haloGroupRef.current && labelsGroupRef.current) {
              cardsGroupRef.current.rotation.set(0, 0, 0);
              haloGroupRef.current.rotation.set(0, 0, 0);
              labelsGroupRef.current.rotation.set(0, 0, 0);
              cardsGroupRef.current.scale.set(1, 1, 1);
              haloGroupRef.current.scale.set(1, 1, 1);
              labelsGroupRef.current.scale.set(1, 1, 1);
            }
            triggerGestureFeedback('RECENTER', 'VR Viewport Recentered');
          },
          onExitVR: () => {
            endVR();
          },
        },
        {
          activeLayout: layoutMode,
          searchQuery: searchQuery,
          showLabels: showClusterLabels,
          photoCount: items.length,
        }
      );

      onVRStateChange?.(true);
      triggerGestureFeedback(
        'FOCUS',
        perfMode ? 'VR Active (90FPS+ Performance Mode)' : 'VR Immersion Active'
      );
    };

    const endVR = async () => {
      await WebXREngine.endVRSession();
      if (sceneRef.current) {
        WebXREngine.disposeControllers(sceneRef.current);
      }
      if (starGeoRef.current) {
        starGeoRef.current.setDrawRange(0, 1200);
      }
      if (cardsGroupRef.current && haloGroupRef.current && labelsGroupRef.current) {
        cardsGroupRef.current.rotation.set(0, 0, 0);
        haloGroupRef.current.rotation.set(0, 0, 0);
        labelsGroupRef.current.rotation.set(0, 0, 0);
        cardsGroupRef.current.scale.set(1, 1, 1);
        haloGroupRef.current.scale.set(1, 1, 1);
        labelsGroupRef.current.scale.set(1, 1, 1);
      }
      onVRStateChange?.(false);
    };

    onXRReady({
      startVR,
      endVR,
      get isPresenting() {
        return rendererRef.current?.xr?.isPresenting || WebXREngine.isPresenting();
      },
    });
  }, [
    onXRReady,
    onVRStateChange,
    onSelectCard,
    onLayoutChange,
    onSearchChange,
    onToggleClusterLabels,
    layoutMode,
    searchQuery,
    showClusterLabels,
    items,
    triggerGestureFeedback,
    vrPerformanceMode,
    vrGestureSensitivity,
  ]);

  /**
   * Sync active UI state changes (layout mode, search query, cluster labels) with the VR Controller Menu
   */
  useEffect(() => {
    WebXREngine.updateVRMenuState({
      activeLayout: layoutMode,
      searchQuery: searchQuery,
      showLabels: showClusterLabels,
      photoCount: items.length,
    });
  }, [layoutMode, searchQuery, showClusterLabels, items.length]);

  /**
   * Reset camera pan & orbit to default canonical viewpoint and exit focus
   */
  const resetCamera = useCallback(() => {
    recordUserActivity();
    onFocusItem(null);
    cameraState.current.targetPanOffset.set(0, 0, 0);
    cameraState.current.targetTheta = Math.PI / 4;
    cameraState.current.targetPhi = Math.PI / 2.2;
    updateAdaptiveCamera();
    AudioSynthesizer.playLayoutSwoosh(0);
    triggerGestureFeedback('RECENTER', 'Camera Centered');
  }, [updateAdaptiveCamera, triggerGestureFeedback, recordUserActivity, onFocusItem]);

  /**
   * Tri-Modal Interaction Listeners (Mouse, Touch, Keyboard)
   */
  const handlePointerDown = (e: React.PointerEvent) => {
    recordUserActivity();
    // Ignore touch pointers in pointer event handler because dedicated touch handlers handle multi-touch
    if (e.pointerType === 'touch') return;

    // Check if right-click or shift-click for 3D Lasso picking
    if (e.button === 2 || e.shiftKey) {
      isLassoActiveRef.current = true;
      lassoPointsRef.current = [{ x: e.clientX, y: e.clientY }];
      drawLasso();
      return;
    }

    cameraState.current.isDragging = true;
    cameraState.current.prevPointer = { x: e.clientX, y: e.clientY };
    cameraState.current.momentum = { x: 0, y: 0 };
    cameraState.current.panMomentum.set(0, 0, 0);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    recordUserActivity();
    if (e.pointerType === 'touch') return;

    // Update normalized mouse coordinates for raycasting
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      mousePosRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mousePosRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    // Lasso drawing
    if (isLassoActiveRef.current) {
      lassoPointsRef.current.push({ x: e.clientX, y: e.clientY });
      drawLasso();
      return;
    }

    // Camera orbit drag with momentum
    if (!cameraState.current.isDragging) return;

    const dx = e.clientX - cameraState.current.prevPointer.x;
    const dy = e.clientY - cameraState.current.prevPointer.y;
    cameraState.current.prevPointer = { x: e.clientX, y: e.clientY };

    const sensitivity = 0.0045;
    cameraState.current.targetTheta -= dx * sensitivity;
    cameraState.current.targetPhi -= dy * sensitivity;

    cameraState.current.momentum = {
      x: -dx * sensitivity * 0.15,
      y: -dy * sensitivity * 0.15,
    };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;

    if (isLassoActiveRef.current) {
      isLassoActiveRef.current = false;
      finishLassoSelection();
      clearLasso();
      return;
    }
    cameraState.current.isDragging = false;
  };

  /**
   * Touch Multi-Gesture Engine:
   * 1. 1-Finger Drag -> Camera Orbit (Spherical coordinates with momentum)
   * 2. 2-Finger Pinch -> Zoom (Dynamic scale-invariant camera distance scaling)
   * 3. 2-Finger Twist / Rotate -> Camera Azimuthal Orbit Rotation
   * 4. 2-Finger Drag / Pan -> 3D Camera View-Plane Translation
   * 5. Quick Tap (<300ms) -> Memory Card Selection
   * 6. Double Tap -> Recenter Camera Focus & Distance
   */
  const handleTouchStart = (e: React.TouchEvent) => {
    recordUserActivity();
    const touches = e.touches;
    touchState.current.touchStartTime = performance.now();
    touchState.current.hasMovedSignificantly = false;

    if (touches.length === 1) {
      touchState.current.activeTouchCount = 1;
      const t = touches[0];
      touchState.current.singleTouchStart = { x: t.clientX, y: t.clientY };
      touchState.current.prevSingleTouch = { x: t.clientX, y: t.clientY, time: performance.now() };

      cameraState.current.isDragging = true;
      cameraState.current.isMultiTouching = false;
      cameraState.current.prevPointer = { x: t.clientX, y: t.clientY };
      cameraState.current.momentum = { x: 0, y: 0 };
      cameraState.current.panMomentum.set(0, 0, 0);

      // Check for double-tap gesture to reset view
      const now = performance.now();
      const timeSinceLastTap = now - touchState.current.lastTapTime;
      const distFromLastTap = Math.hypot(
        t.clientX - touchState.current.lastTapPos.x,
        t.clientY - touchState.current.lastTapPos.y
      );

      if (timeSinceLastTap < 320 && distFromLastTap < 35) {
        resetCamera();
        touchState.current.lastTapTime = 0;
        return;
      }
      touchState.current.lastTapTime = now;
      touchState.current.lastTapPos = { x: t.clientX, y: t.clientY };

      // Update normalized mouse coordinates for raycasting tap selection
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        mousePosRef.current.x = ((t.clientX - rect.left) / rect.width) * 2 - 1;
        mousePosRef.current.y = -((t.clientY - rect.top) / rect.height) * 2 + 1;
      }
    } else if (touches.length === 2) {
      touchState.current.activeTouchCount = 2;
      cameraState.current.isDragging = false;
      cameraState.current.isMultiTouching = true;
      cameraState.current.momentum = { x: 0, y: 0 };
      cameraState.current.panMomentum.set(0, 0, 0);

      const t1 = touches[0];
      const t2 = touches[1];

      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const angle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;

      cameraState.current.touchPinchDist = dist;
      cameraState.current.touchAngle = angle;
      cameraState.current.touchMidpoint = { x: midX, y: midY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    recordUserActivity();
    const touches = e.touches;

    if (touches.length === 1 && touchState.current.activeTouchCount === 1) {
      const t = touches[0];
      const dx = t.clientX - touchState.current.prevSingleTouch.x;
      const dy = t.clientY - touchState.current.prevSingleTouch.y;

      if (Math.hypot(t.clientX - touchState.current.singleTouchStart.x, t.clientY - touchState.current.singleTouchStart.y) > 8) {
        touchState.current.hasMovedSignificantly = true;
      }

      touchState.current.prevSingleTouch = { x: t.clientX, y: t.clientY, time: performance.now() };

      const sensitivity = 0.0052;
      cameraState.current.targetTheta -= dx * sensitivity;
      cameraState.current.targetPhi -= dy * sensitivity;

      cameraState.current.momentum = {
        x: -dx * sensitivity * 0.16,
        y: -dy * sensitivity * 0.16,
      };

      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        mousePosRef.current.x = ((t.clientX - rect.left) / rect.width) * 2 - 1;
        mousePosRef.current.y = -((t.clientY - rect.top) / rect.height) * 2 + 1;
      }
    } else if (touches.length >= 2) {
      touchState.current.hasMovedSignificantly = true;
      const t1 = touches[0];
      const t2 = touches[1];

      if (touchState.current.activeTouchCount !== 2) {
        touchState.current.activeTouchCount = 2;
        cameraState.current.isDragging = false;
        cameraState.current.isMultiTouching = true;
        cameraState.current.touchPinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        cameraState.current.touchAngle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
        cameraState.current.touchMidpoint = {
          x: (t1.clientX + t2.clientX) / 2,
          y: (t1.clientY + t2.clientY) / 2,
        };
        return;
      }

      const cam = cameraState.current;

      // 1. PINCH-TO-ZOOM GESTURE
      const currentDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const distDelta = currentDist - cam.touchPinchDist;
      cam.touchPinchDist = currentDist;

      const zoomSensitivity = (cam.targetRadius / 650) * 2.2;
      if (Math.abs(distDelta) > 0.8) {
        cam.targetRadius = Math.max(350, Math.min(5000, cam.targetRadius - distDelta * zoomSensitivity));
        cam.zoomMomentum = -distDelta * zoomSensitivity * 0.12;
      }

      // 2. TWO-FINGER ROTATE (Azimuthal Orbit Twist)
      const currentAngle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX);
      let angleDelta = currentAngle - cam.touchAngle;
      while (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
      while (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
      cam.touchAngle = currentAngle;

      if (Math.abs(angleDelta) > 0.008) {
        const rotationFactor = 1.35;
        cam.targetTheta -= angleDelta * rotationFactor;
        cam.momentum.x -= angleDelta * 0.12;
      }

      // 3. TWO-FINGER PAN (Camera View-Plane Translation)
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const dMidX = midX - cam.touchMidpoint.x;
      const dMidY = midY - cam.touchMidpoint.y;
      cam.touchMidpoint = { x: midX, y: midY };

      if (Math.abs(dMidX) > 0.5 || Math.abs(dMidY) > 0.5) {
        const theta = cam.theta;
        const phi = cam.phi;
        const sinPhi = Math.sin(phi);

        // Right vector (perpendicular to Y-up & forward)
        const rx = sinPhi > 0.001 ? Math.cos(theta) : 1;
        const ry = 0;
        const rz = sinPhi > 0.001 ? -Math.sin(theta) : 0;

        // Up vector (perpendicular to right & forward)
        const ux = -Math.sin(theta) * Math.cos(phi);
        const uy = Math.sin(phi);
        const uz = -Math.cos(theta) * Math.cos(phi);

        const vHeight = containerRef.current?.clientHeight || 800;
        const panFactor = (cam.radius / Math.max(300, vHeight)) * 1.35;

        const panX = (-dMidX * rx + dMidY * ux) * panFactor;
        const panY = (-dMidX * ry + dMidY * uy) * panFactor;
        const panZ = (-dMidX * rz + dMidY * uz) * panFactor;

        cam.targetPanOffset.x += panX;
        cam.targetPanOffset.y += panY;
        cam.targetPanOffset.z += panZ;

        // Max bound so user never gets lost in deep space
        const maxPan = Math.max(1500, cam.radius * 2.5);
        cam.targetPanOffset.clampLength(0, maxPan);

        cam.panMomentum.set(panX * 0.18, panY * 0.18, panZ * 0.18);
      }

      // Contextual gesture feedback trigger
      if (Math.abs(distDelta) > 3.5) {
        triggerGestureFeedback('ZOOM', `Zoom: ${Math.round(cam.targetRadius)}px`);
      } else if (Math.abs(angleDelta) > 0.045) {
        triggerGestureFeedback('ROTATE', `Orbit: ${Math.round((cam.targetTheta * 180) / Math.PI)}°`);
      } else if (Math.hypot(dMidX, dMidY) > 4.5) {
        triggerGestureFeedback('PAN', 'Camera Pan');
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    recordUserActivity();
    const touches = e.touches;

    if (touches.length === 0) {
      const touchDuration = performance.now() - touchState.current.touchStartTime;
      // If quick tap without dragging -> Focus or Inspect card
      if (!touchState.current.hasMovedSignificantly && touchDuration < 350) {
        if (hoveredIndexRef.current !== null && items[hoveredIndexRef.current]) {
          const selectedItem = items[hoveredIndexRef.current];
          const camPos: [number, number, number] = cameraRef.current
            ? [cameraRef.current.position.x, cameraRef.current.position.y, cameraRef.current.position.z]
            : [0, 0, 1200];
          AudioSynthesizer.playCardSelect(selectedItem.hue, selectedItem.currentPos, camPos);
          if (focusedItem?.id === selectedItem.id) {
            onSelectCard(selectedItem);
          } else {
            SpatialAudioProcessor.playSpatialFocusSwoosh(selectedItem.targetPos, camPos);
            onFocusItem(selectedItem);
            triggerGestureFeedback('FOCUS', `Locked: ${selectedItem.title}`);
          }
        } else if (focusedItem) {
          onFocusItem(null);
          triggerGestureFeedback('RECENTER', 'Overview Restored');
        }
      }

      cameraState.current.isDragging = false;
      cameraState.current.isMultiTouching = false;
      touchState.current.activeTouchCount = 0;
    } else if (touches.length === 1) {
      // Transition from multi-touch back to single touch
      const t = touches[0];
      touchState.current.activeTouchCount = 1;
      touchState.current.prevSingleTouch = { x: t.clientX, y: t.clientY, time: performance.now() };
      cameraState.current.prevPointer = { x: t.clientX, y: t.clientY };
      cameraState.current.isDragging = true;
      cameraState.current.isMultiTouching = false;
    }
  };

  const handleTouchCancel = () => {
    recordUserActivity();
    cameraState.current.isDragging = false;
    cameraState.current.isMultiTouching = false;
    touchState.current.activeTouchCount = 0;
  };

  /**
   * Scroll Wheel Zooming
   */
  const handleWheel = (e: React.WheelEvent) => {
    recordUserActivity();
    e.preventDefault();
    const zoomDelta = e.deltaY * 0.85;
    const minZoom = focusedItem ? 160 : 350;
    const maxZoom = focusedItem ? 1500 : 5000;
    cameraState.current.targetRadius = Math.max(
      minZoom,
      Math.min(maxZoom, cameraState.current.targetRadius + zoomDelta)
    );
  };

  /**
   * Click / Tap Selection on 3D Card - Lock into Focus Mode orbit
   */
  const handleClick = (e: React.MouseEvent) => {
    recordUserActivity();
    if (isLassoActiveRef.current) return;
    if (hoveredIndexRef.current !== null && items[hoveredIndexRef.current]) {
      const selectedItem = items[hoveredIndexRef.current];
      const camPos: [number, number, number] = cameraRef.current
        ? [cameraRef.current.position.x, cameraRef.current.position.y, cameraRef.current.position.z]
        : [0, 0, 1200];
      AudioSynthesizer.playCardSelect(selectedItem.hue, selectedItem.currentPos, camPos);
      if (focusedItem?.id === selectedItem.id) {
        // Clicking an already locked photo opens deep inspector modal
        onSelectCard(selectedItem);
      } else {
        // Lock into close-up orbit around this photo memory with spatial focus swoosh
        SpatialAudioProcessor.playSpatialFocusSwoosh(selectedItem.targetPos, camPos);
        onFocusItem(selectedItem);
        triggerGestureFeedback('FOCUS', `Locked: ${selectedItem.title}`);
      }
    } else if (focusedItem) {
      // Clicking empty background space exits Focus Mode and returns to overview
      onFocusItem(null);
      triggerGestureFeedback('RECENTER', 'Overview Restored');
    }
  };

  /**
   * Screen-Space 3D Lasso Picking Algorithm
   */
  const drawLasso = () => {
    const canvas = lassoCanvasRef.current;
    if (!canvas || !containerRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pts = lassoPointsRef.current;
    if (pts.length < 2) return;

    const rect = containerRef.current.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(pts[0].x - rect.left, pts[0].y - rect.top);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x - rect.left, pts[i].y - rect.top);
    }
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.fill();
  };

  const clearLasso = () => {
    const canvas = lassoCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    lassoPointsRef.current = [];
  };

  const finishLassoSelection = () => {
    const pts = lassoPointsRef.current;
    if (pts.length < 3 || !cameraRef.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const poly = pts.map((p) => ({ x: p.x - rect.left, y: p.y - rect.top }));
    const camera = cameraRef.current;
    const selected: string[] = [];

    const tempVec = new THREE.Vector3();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      tempVec.set(item.currentPos[0], item.currentPos[1], item.currentPos[2]);
      tempVec.project(camera);

      // Check if inside frustum
      if (tempVec.z > 1) continue;

      // Project NDC to screen pixel coordinates
      const screenX = ((tempVec.x + 1) / 2) * rect.width;
      const screenY = ((-tempVec.y + 1) / 2) * rect.height;

      // Point-in-polygon ray-casting test
      if (pointInPolygon({ x: screenX, y: screenY }, poly)) {
        selected.push(item.id);
      }
    }

    if (selected.length > 0) {
      AudioSynthesizer.playSearchFilter();
      onLassoSelect(selected);
    }
  };

  // Point in polygon 2D mathematical test
  const pointInPolygon = (pt: { x: number; y: number }, poly: Array<{ x: number; y: number }>) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  // Keyboard navigation hotkeys (W/A/S/D / Arrows)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const step = 0.08;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        recordUserActivity();
        cameraState.current.targetTheta -= step;
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        recordUserActivity();
        cameraState.current.targetTheta += step;
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        recordUserActivity();
        cameraState.current.targetPhi -= step;
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        recordUserActivity();
        cameraState.current.targetPhi += step;
      } else if (e.key === 'r' || e.key === 'R') {
        recordUserActivity();
        resetCamera();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resetCamera, recordUserActivity]);

  return (
    <div
      ref={containerRef}
      id="photosphere-canvas-container"
      className="relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing select-none touch-none"
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onWheel={handleWheel}
      onClick={handleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Dynamic Mobile Gesture Feedback Pill */}
      {activeGesture && (
        <div
          id="photosphere-touch-gesture-badge"
          className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-full bg-black/80 border border-[#38bdf8]/40 backdrop-blur-lg shadow-[0_0_20px_rgba(56,189,248,0.3)] text-[11px] font-mono uppercase tracking-widest text-[#38bdf8] flex items-center gap-2 transition-all"
        >
          <span className="w-2 h-2 rounded-full bg-[#38bdf8] animate-pulse" />
          <span>{activeGesture.label}</span>
        </div>
      )}

      {/* 2D Overlay Canvas for Screen-Space Lasso Polygon Selection */}
      <canvas
        ref={lassoCanvasRef}
        id="photosphere-lasso-overlay"
        width={typeof window !== 'undefined' ? window.innerWidth : 1920}
        height={typeof window !== 'undefined' ? window.innerHeight : 1080}
        className="pointer-events-none absolute inset-0 z-10 w-full h-full"
      />
    </div>
  );
};
