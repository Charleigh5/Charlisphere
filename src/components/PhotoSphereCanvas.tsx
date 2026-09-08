/**
 * PhotoSphereCanvas.tsx
 * High-performance WebGL 3D Spatial Canvas powered by Three.js.
 * Handles continuous 60fps rendering, cubic layout interpolation, touch ergonomics,
 * camera kinematics, and screen-space lasso picking.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Focus, Sparkles } from 'lucide-react';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {
  createBloomPipeline,
  BloomPipeline,
  DEFAULT_BLOOM_CONFIG,
  computeAdaptiveBloom,
} from '../engine/BloomPostProcessingEngine';
import {
  DepthOfFieldPass,
  DEFAULT_DOF_CONFIG,
  computeAutoFocusDistance,
} from '../engine/DepthOfFieldEngine';
import { HolographicOverlayManager } from '../engine/HolographicOverlayEngine';
import { ShimmerPulseEngine } from '../engine/ShimmerPulseEngine';
import { PhotoMemoryItem, Layout3DMode, SpatialSortMode, SpatialClusterTheme } from '../types';
import { SpatialLayoutEngine } from '../math/SpatialLayoutEngine';
import { SpatialTransitionEngine, TransitionHandle } from '../engine/SpatialTransitionEngine';
import { TextureManager } from '../engine/TextureManager';
import { AudioSynthesizer } from '../engine/AudioSynthesizer';
import { SpatialAudioProcessor } from '../engine/SpatialAudioProcessor';
import { VectorNlpEngine } from '../engine/VectorNlpEngine';
import { WebXREngine } from '../engine/WebXREngine';
import { FocusTrailEngine } from '../engine/FocusTrailEngine';
import {
  FocusCameraTransitionEngine,
  FocusFlightHandle,
  FocusNavDirection,
} from '../engine/FocusCameraTransitionEngine';
import {
  evaluateAutoRotation,
  DEFAULT_AUTO_ROTATION_CONFIG,
} from '../engine/AutoRotationEngine';
import { AutoRotationStatus } from '../types';

export const IDLE_AUTO_ORBIT_DELAY_MS = DEFAULT_AUTO_ROTATION_CONFIG.idleDelayMs;
export const AUTO_ORBIT_SPEED_RAD_PER_SEC = DEFAULT_AUTO_ROTATION_CONFIG.baseSpeedRadPerSec;

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
    autoRotationStatus?: AutoRotationStatus;
    bloomEnabled?: boolean;
    depthOfFieldEnabled?: boolean;
    focusDistance?: number;
  }) => void;
  onXRReady?: (xr: XRControllerHandle) => void;
  onVRStateChange?: (isVR: boolean) => void;
  vrPerformanceMode?: boolean;
  vrGestureSensitivity?: number;
  showFocusTrail?: boolean;
  onToggleFocusTrail?: () => void;
  onTrailCountChange?: (count: number) => void;
  autoRotateEnabled?: boolean;
  onToggleAutoRotate?: () => void;
  bloomEnabled?: boolean;
  onToggleBloom?: () => void;
  depthOfFieldEnabled?: boolean;
  onToggleDepthOfField?: () => void;
  showHoloOverlays?: boolean;
  onToggleHoloOverlays?: () => void;
  onReorderItems?: (newItems: PhotoMemoryItem[]) => void;
  focusNavDirection?: FocusNavDirection;
  onFocusTransitionChange?: (isTransitioning: boolean, progress: number) => void;
  resetCameraSignal?: number;
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
  showFocusTrail = true,
  onToggleFocusTrail,
  onTrailCountChange,
  autoRotateEnabled = true,
  onToggleAutoRotate,
  bloomEnabled = true,
  onToggleBloom,
  depthOfFieldEnabled = true,
  onToggleDepthOfField,
  showHoloOverlays = true,
  onToggleHoloOverlays,
  onReorderItems,
  focusNavDirection = 'next',
  onFocusTransitionChange,
  resetCameraSignal,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const isDraggingRef = useRef<boolean>(false);
  const focusedNodeRef = useRef<PhotoMemoryItem | null>(focusedItem);
  focusedNodeRef.current = focusedItem;

  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const pointerMovedRef = useRef<boolean>(false);
  const lastClickTimeRef = useRef<number>(0);
  const lastClickedMeshRef = useRef<THREE.Object3D | null>(null);
  const DOUBLE_CLICK_MS = 350;
  const DRAG_THRESHOLD_PX = 6;
  const hoveredClusterLabelRef = useRef<THREE.Sprite | null>(null);

  // Three.js References (persistent, zero allocation in render loop)
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const bloomPipelineRef = useRef<BloomPipeline | null>(null);
  const bloomPassRef = useRef<UnrealBloomPass | null>(null);
  const bloomEnabledRef = useRef(bloomEnabled);
  const onToggleBloomRef = useRef(onToggleBloom);

  // Cinematic Optical Depth-of-Field Post-Processing Engine Refs
  const dofPassRef = useRef<DepthOfFieldPass | null>(null);
  const depthOfFieldEnabledRef = useRef(depthOfFieldEnabled);
  const onToggleDepthOfFieldRef = useRef(onToggleDepthOfField);
  const currentFocusDistanceRef = useRef<number>(320.0);
  const currentMaxBlurRef = useRef<number>(0.0);
  const currentApertureRef = useRef<number>(0.0);

  const holoManagerRef = useRef<HolographicOverlayManager | null>(null);
  const showHoloOverlaysRef = useRef(showHoloOverlays);
  const onToggleHoloOverlaysRef = useRef(onToggleHoloOverlays);

  // Shimmer & Pulse Animation Engine Ref for Node Drag & Re-order
  const shimmerEngineRef = useRef<ShimmerPulseEngine | null>(null);
  const onReorderItemsRef = useRef(onReorderItems);

  useEffect(() => {
    onReorderItemsRef.current = onReorderItems;
  }, [onReorderItems]);

  // Direct 3D Node Dragging Interaction State
  const cardDragState = useRef({
    pendingIndex: null as number | null,
    isCardDragging: false,
    startPointer: { x: 0, y: 0 },
    hasMoved: false,
  });

  useEffect(() => {
    bloomEnabledRef.current = bloomEnabled;
  }, [bloomEnabled]);

  useEffect(() => {
    onToggleBloomRef.current = onToggleBloom;
  }, [onToggleBloom]);

  useEffect(() => {
    depthOfFieldEnabledRef.current = depthOfFieldEnabled;
    if (dofPassRef.current) {
      dofPassRef.current.enabled = depthOfFieldEnabled;
    }
  }, [depthOfFieldEnabled]);

  useEffect(() => {
    onToggleDepthOfFieldRef.current = onToggleDepthOfField;
  }, [onToggleDepthOfField]);

  useEffect(() => {
    showHoloOverlaysRef.current = showHoloOverlays;
    if (holoManagerRef.current) {
      holoManagerRef.current.setEnabled(showHoloOverlays);
    }
  }, [showHoloOverlays]);

  useEffect(() => {
    onToggleHoloOverlaysRef.current = onToggleHoloOverlays;
  }, [onToggleHoloOverlays]);
  const starGeoRef = useRef<THREE.BufferGeometry | null>(null);
  const starMatRef = useRef<THREE.PointsMaterial | null>(null);
  const cardsGroupRef = useRef<THREE.Group | null>(null);
  const haloGroupRef = useRef<THREE.Group | null>(null);
  const labelsGroupRef = useRef<THREE.Group | null>(null);
  const trailGroupRef = useRef<THREE.Group | null>(null);

  // Focus Trail Engine & Visual Resources
  const trailEngineRef = useRef<FocusTrailEngine>(FocusTrailEngine.getInstance());
  const trailLineGeoRef = useRef<THREE.BufferGeometry | null>(null);
  const trailLineMatRef = useRef<THREE.LineBasicMaterial | null>(null);
  const trailHaloLineGeoRef = useRef<THREE.BufferGeometry | null>(null);
  const trailHaloLineMatRef = useRef<THREE.LineBasicMaterial | null>(null);
  const pulseMeshRef = useRef<THREE.Mesh | null>(null);
  const beaconMeshesRef = useRef<THREE.Mesh[]>([]);
  const beaconGeoRef = useRef<THREE.RingGeometry | null>(null);

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
    phi: Math.PI * 0.5, // True equator level for equal vertical black margins
    radius: 2350,
    targetRadius: 2350,
    targetTheta: Math.PI / 4,
    targetPhi: Math.PI * 0.5,

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

  // Active gesture visual feedback state (Pinch Zoom, Two-Finger Rotate, Two-Finger Pan, Focus, Drag, Re-order)
  const [activeGesture, setActiveGesture] = React.useState<{
    type: 'ZOOM' | 'ROTATE' | 'PAN' | 'RECENTER' | 'FOCUS' | 'DRAG' | 'REORDER';
    label: string;
  } | null>(null);
  const gestureTimerRef = useRef<number | null>(null);

  // Hover & Raycasting state
  const raycasterRef = useRef(new THREE.Raycaster());
  const mousePosRef = useRef(new THREE.Vector2(-999, -999));
  const hoveredIndexRef = useRef<number | null>(null);
  const lastRaycastTimeRef = useRef(0);
  const labelIntersectsRef = useRef<THREE.Intersection[]>([]);

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

  // Stable Refs for Props to keep continuous 60-120fps render loop uninterrupted
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const searchQueryRef = useRef(searchQuery);
  searchQueryRef.current = searchQuery;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const focusedItemRef = useRef(focusedItem);
  focusedItemRef.current = focusedItem;
  const showClusterLabelsRef = useRef(showClusterLabels);
  showClusterLabelsRef.current = showClusterLabels;
  const showFocusTrailRef = useRef(showFocusTrail);
  showFocusTrailRef.current = showFocusTrail;
  const onStatsUpdateRef = useRef(onStatsUpdate);
  onStatsUpdateRef.current = onStatsUpdate;
  const autoRotateEnabledRef = useRef(autoRotateEnabled);
  autoRotateEnabledRef.current = autoRotateEnabled;
  const onToggleAutoRotateRef = useRef(onToggleAutoRotate);
  onToggleAutoRotateRef.current = onToggleAutoRotate;

  // Persistent vectors & throttle clocks to avoid GC allocations in hot loop
  const camForwardVecRef = useRef(new THREE.Vector3());
  const labelTargetScaleVecRef = useRef(new THREE.Vector3());
  const lastAudioTimeRef = useRef(0);
  const itemsMapRef = useRef(new Map<string, PhotoMemoryItem>());

  // Layout transition tracking with GSAP
  const prevLayoutModeRef = useRef<Layout3DMode>(layoutMode);
  const transitionHandleRef = useRef<TransitionHandle | null>(null);
  const syncClusterLabelsRef = useRef<(() => void) | null>(null);
  const [transitionInfo, setTransitionInfo] = useState<{
    fromMode: Layout3DMode;
    toMode: Layout3DMode;
    progress: number;
  } | null>(null);

  // Automated Focus Mode Camera Flight Sequence with GSAP
  const focusNavDirectionRef = useRef<FocusNavDirection>(focusNavDirection);
  focusNavDirectionRef.current = focusNavDirection;
  const prevFocusedItemRef = useRef<PhotoMemoryItem | null>(null);
  const activeFocusFlightRef = useRef<FocusFlightHandle | null>(null);
  const [focusFlightInfo, setFocusFlightInfo] = useState<{
    isFlying: boolean;
    progress: number;
    fromTitle: string;
    toTitle: string;
    direction: FocusNavDirection;
  } | null>(null);

  const stopActiveFocusFlight = useCallback(() => {
    if (activeFocusFlightRef.current) {
      activeFocusFlightRef.current.kill();
      activeFocusFlightRef.current = null;
      setFocusFlightInfo(null);
      onFocusTransitionChange?.(false, 0);
    }
  }, [onFocusTransitionChange]);

  // Clean up any running GSAP transitions on unmount
  useEffect(() => {
    return () => {
      if (transitionHandleRef.current) {
        transitionHandleRef.current.kill();
        transitionHandleRef.current = null;
      }
      if (activeFocusFlightRef.current) {
        activeFocusFlightRef.current.kill();
        activeFocusFlightRef.current = null;
      }
    };
  }, []);

  /**
   * Update target transforms whenever items, layoutMode or sortMode changes
   */
  const updateTargetCoordinates = useCallback((instant = false) => {
    if (!items.length) return;
    const transforms = SpatialLayoutEngine.calculateTargetTransforms(items, layoutMode, sortMode);

    // Initial placement or instant synchronization
    const isUninitialized = items[0] && items[0].currentPos[0] === 0 && items[0].currentPos[1] === 0 && items[0].currentPos[2] === 0;
    if (instant || isUninitialized) {
      for (let i = 0; i < items.length; i++) {
        if (transforms[i]) {
          items[i].targetPos = [...transforms[i].position];
          items[i].targetRotation = [...transforms[i].rotation];
          items[i].currentPos = [...transforms[i].position];
          items[i].rotation = [...transforms[i].rotation];
        }
      }
      prevLayoutModeRef.current = layoutMode;
      return;
    }

    // Check if mode has switched between FIBONACCI_SPHERE, DNA_HELIX, GALAXY_CONSTELLATION, CUBIC_MATRIX
    if (prevLayoutModeRef.current !== layoutMode) {
      const fromMode = prevLayoutModeRef.current;
      prevLayoutModeRef.current = layoutMode;

      // Abort any ongoing transition
      if (transitionHandleRef.current) {
        transitionHandleRef.current.kill();
        transitionHandleRef.current = null;
      }

      // Compute base camera distance for framing
      const aspect = (containerRef.current?.clientWidth || 1200) / Math.max(1, containerRef.current?.clientHeight || 800);
      const baseDist = SpatialLayoutEngine.computeCameraDistance(items.length, 50, aspect);

      setTransitionInfo({
        fromMode,
        toMode: layoutMode,
        progress: 0,
      });

      // Launch GSAP Spatial Morphing Transition
      transitionHandleRef.current = SpatialTransitionEngine.startTransition({
        items,
        targetTransforms: transforms,
        fromMode,
        toMode: layoutMode,
        cameraState: cameraState.current,
        baseCameraDistance: baseDist,
        onComplete: () => {
          transitionHandleRef.current = null;
          setTransitionInfo(null);
          syncClusterLabelsRef.current?.();
        },
      });
      return;
    }

    // Standard non-mode coordinate update (e.g. sorting mode change)
    for (let i = 0; i < items.length; i++) {
      if (transforms[i]) {
        items[i].targetPos = transforms[i].position;
        items[i].targetRotation = transforms[i].rotation;
      }
    }

    // Trigger subtle re-order shimmer & pulse wave across matrix!
    shimmerEngineRef.current?.triggerReorderWave(0, items.length, 850);
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
        if (!existing.sprite.userData.baseScale) {
          existing.sprite.userData.kind = 'cluster-label';
          existing.sprite.userData.baseScale = existing.sprite.scale.clone();
          existing.sprite.userData.hoverScaleMultiplier = 1.06;
          existing.sprite.userData.baseOpacity = typeof existing.sprite.material.opacity === 'number'
            ? existing.sprite.material.opacity
            : 1;
        }
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

        sprite.userData.kind = 'cluster-label';
        sprite.userData.baseScale = sprite.scale.clone();
        sprite.userData.hoverScaleMultiplier = 1.06;
        sprite.userData.baseOpacity = typeof sprite.material.opacity === 'number'
          ? sprite.material.opacity
          : 1;

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
  syncClusterLabelsRef.current = syncClusterLabels;

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

    // Renderer with native hardware MSAA & high-performance GPU context
    const renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: true,
      alpha: false,
      stencil: false,
      depth: true,
      preserveDrawingBuffer: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.xr.enabled = true; // WebXR Device API immersion support
    renderer.domElement.id = 'photosphere-threejs-canvas';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.inset = '0';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Atmospheric Bloom & Depth-of-Field Postprocessing Pipeline
    const bloomPipeline = createBloomPipeline(
      renderer,
      scene,
      camera,
      width,
      height,
      DEFAULT_BLOOM_CONFIG,
      {
        enabled: depthOfFieldEnabledRef.current,
        ...DEFAULT_DOF_CONFIG,
      }
    );
    composerRef.current = bloomPipeline.composer;
    bloomPassRef.current = bloomPipeline.bloomPass;
    dofPassRef.current = bloomPipeline.dofPass;
    bloomPipelineRef.current = bloomPipeline;

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

    // Spatial Navigation Focus Trail Group & Resources
    const trailGroup = new THREE.Group();
    scene.add(trailGroup);
    trailGroupRef.current = trailGroup;

    // Register overlay groups so depth buffer isolates 3D memory cards cleanly
    bloomPipeline.dofPass.setOverlayTargets({
      starField,
      labelsGroup,
      trailGroup,
      haloGroup,
    });

    const MAX_TRAIL_PTS = 320;
    const trailPosArr = new Float32Array(MAX_TRAIL_PTS * 3);
    const trailColArr = new Float32Array(MAX_TRAIL_PTS * 3);

    const trailLineGeo = new THREE.BufferGeometry();
    trailLineGeo.setAttribute('position', new THREE.BufferAttribute(trailPosArr, 3));
    trailLineGeo.setAttribute('color', new THREE.BufferAttribute(trailColArr, 3));
    trailLineGeo.setDrawRange(0, 0);

    const trailLineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const trailLine = new THREE.Line(trailLineGeo, trailLineMat);
    trailLine.frustumCulled = false;
    trailGroup.add(trailLine);
    trailLineGeoRef.current = trailLineGeo;
    trailLineMatRef.current = trailLineMat;

    // Ambient Halo Line (Soft Outer Glow)
    const trailHaloPosArr = new Float32Array(MAX_TRAIL_PTS * 3);
    const trailHaloColArr = new Float32Array(MAX_TRAIL_PTS * 3);

    const trailHaloLineGeo = new THREE.BufferGeometry();
    trailHaloLineGeo.setAttribute('position', new THREE.BufferAttribute(trailHaloPosArr, 3));
    trailHaloLineGeo.setAttribute('color', new THREE.BufferAttribute(trailHaloColArr, 3));
    trailHaloLineGeo.setDrawRange(0, 0);

    const trailHaloLineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const trailHaloLine = new THREE.Line(trailHaloLineGeo, trailHaloLineMat);
    trailHaloLine.frustumCulled = false;
    trailGroup.add(trailHaloLine);
    trailHaloLineGeoRef.current = trailHaloLineGeo;
    trailHaloLineMatRef.current = trailHaloLineMat;

    // Animated Energy Pulse Bead
    const pulseGeo = new THREE.SphereGeometry(3.5, 12, 12);
    const pulseMat = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
    pulseMesh.visible = false;
    trailGroup.add(pulseMesh);
    pulseMeshRef.current = pulseMesh;

    // Waypoint Beacon Rings
    const sharedBeaconGeo = new THREE.RingGeometry(8, 12, 32);
    beaconGeoRef.current = sharedBeaconGeo;
    const beaconMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < 14; i++) {
      const bMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const bMesh = new THREE.Mesh(sharedBeaconGeo, bMat);
      bMesh.visible = false;
      trailGroup.add(bMesh);
      beaconMeshes.push(bMesh);
    }
    beaconMeshesRef.current = beaconMeshes;

    // Spatial Holographic Metadata Overlays Manager
    const holoManager = new HolographicOverlayManager(scene, {
      enabled: showHoloOverlaysRef.current,
    });
    holoManagerRef.current = holoManager;

    // Shimmer & Pulse Animation Engine for Direct Drag & Re-order Feedback
    const shimmerEngine = new ShimmerPulseEngine(scene);
    shimmerEngineRef.current = shimmerEngine;

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
    cameraState.current.radius = cameraState.current.targetRadius;

    // Resize Observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      cameraRef.current.aspect = w / Math.max(1, h);
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
      bloomPipelineRef.current?.setSize(w, h);
      if (lassoCanvasRef.current) {
        lassoCanvasRef.current.width = w;
        lassoCanvasRef.current.height = h;
      }

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
      hoveredClusterLabelRef.current = null;
      TextureManager.disposeAll();
      trailLineGeo.dispose();
      trailLineMat.dispose();
      trailHaloLineGeo.dispose();
      trailHaloLineMat.dispose();
      pulseGeo.dispose();
      pulseMat.dispose();
      sharedBeaconGeo.dispose();
      beaconMeshes.forEach((b) => (b.material as THREE.Material).dispose());
      beaconMeshesRef.current = [];
      holoManagerRef.current?.dispose();
      holoManagerRef.current = null;
      shimmerEngineRef.current?.dispose();
      shimmerEngineRef.current = null;
      bloomPipelineRef.current?.dispose();
      renderer.dispose();
    };
  }, []);

  /**
   * Sync 3D Meshes when items array changes
   */
  useEffect(() => {
    recordUserActivity();
    syncMeshes();
  }, [items, syncMeshes, recordUserActivity]);

  /**
   * Sync 3D Cluster Labels only when album items or label toggle changes
   */
  useEffect(() => {
    syncClusterLabels();
  }, [items, showClusterLabels, syncClusterLabels]);

  /**
   * Update adaptive camera distance when album size changes
   */
  useEffect(() => {
    if (!focusedItem) {
      updateAdaptiveCamera();
    }
  }, [items.length, focusedItem, updateAdaptiveCamera]);

  /**
   * Smoothly frame and lock camera into close-up orbit when focusedItem changes,
   * transitioning via curved parabolic trajectory flight if cycling between items.
   */
  useEffect(() => {
    recordUserActivity();
    if (focusedItem) {
      const prev = prevFocusedItemRef.current;
      const isItemToItemTransition = prev !== null && prev.id !== focusedItem.id;

      if (isItemToItemTransition) {
        // Cancel any active in-flight sequence before starting new trajectory
        if (activeFocusFlightRef.current) {
          activeFocusFlightRef.current.kill();
          activeFocusFlightRef.current = null;
        }

        const dir = focusNavDirectionRef.current || 'next';
        AudioSynthesizer.playFocusTransitionFlight(dir, focusedItem.hue);

        setFocusFlightInfo({
          isFlying: true,
          progress: 0,
          fromTitle: prev.title,
          toTitle: focusedItem.title,
          direction: dir,
        });
        onFocusTransitionChange?.(true, 0);

        activeFocusFlightRef.current = FocusCameraTransitionEngine.startFlightSequence({
          cameraState: cameraState.current,
          toItem: focusedItem,
          fromItem: prev,
          direction: dir,
          focusDistance: 320,
          onProgress: (progress, state) => {
            setFocusFlightInfo((prevInfo) => (prevInfo ? { ...prevInfo, progress } : null));
            onFocusTransitionChange?.(true, progress);
            currentFocusDistanceRef.current = state.effectiveFocusDistance;
          },
          onComplete: () => {
            setFocusFlightInfo(null);
            activeFocusFlightRef.current = null;
            onFocusTransitionChange?.(false, 1);
          },
        });
      } else {
        // Initial entry into Focus Mode from overview
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
      }
      prevFocusedItemRef.current = focusedItem;
    } else {
      if (activeFocusFlightRef.current) {
        activeFocusFlightRef.current.kill();
        activeFocusFlightRef.current = null;
      }
      setFocusFlightInfo(null);
      onFocusTransitionChange?.(false, 0);
      prevFocusedItemRef.current = null;

      cameraState.current.targetPanOffset.set(0, 0, 0);
      const aspect = cameraRef.current?.aspect || 1.0;
      cameraState.current.targetRadius = SpatialLayoutEngine.computeCameraDistance(items.length, 50, aspect);
    }
  }, [focusedItem, items.length, recordUserActivity, onFocusTransitionChange]);

  /**
   * Track spatial navigation trail waypoints when focusedItem changes
   */
  useEffect(() => {
    if (focusedItem) {
      trailEngineRef.current.addWaypoint(focusedItem);
      onTrailCountChange?.(trailEngineRef.current.waypointCount);
    }
  }, [focusedItem, onTrailCountChange]);

  /**
   * Prune trail waypoints if items are removed or deleted
   */
  useEffect(() => {
    const itemMap = new Map(items.map((i) => [i.id, i]));
    const waypoints = trailEngineRef.current.getWaypoints();
    let changed = false;
    for (const wp of waypoints) {
      if (!itemMap.has(wp.id)) {
        trailEngineRef.current.remove(wp.id);
        changed = true;
      }
    }
    if (changed) {
      onTrailCountChange?.(trailEngineRef.current.waypointCount);
    }
  }, [items, onTrailCountChange]);

  /**
   * Main 60-120 FPS Continuous Render & Kinematics Loop
   * Uses stable refs and direct hardware MSAA rendering for silky-smooth fluid interactions
   */
  useEffect(() => {
    let prevTimestamp = performance.now();

    const animate = (timestamp: number) => {
      const delta = Math.min((timestamp - prevTimestamp) / 1000, 0.1);
      prevTimestamp = timestamp;

      const currentItems = itemsRef.current;
      const currentQuery = searchQueryRef.current;
      const currentSelected = selectedIdsRef.current;
      const currentFocused = focusedItemRef.current;
      const currentShowLabels = showClusterLabelsRef.current;
      const currentShowTrail = showFocusTrailRef.current;

      // Smooth Camera Kinematics (Momentum, Easing & Ambient Auto-Rotation)
      const cam = cameraState.current;
      const isUserInteracting =
        cam.isDragging ||
        cam.isMultiTouching ||
        isLassoActiveRef.current ||
        Math.abs(cam.momentum.x) > 0.0001 ||
        Math.abs(cam.momentum.y) > 0.0001 ||
        Math.abs(cam.zoomMomentum) > 0.001 ||
        cam.panMomentum.lengthSq() > 0.0001;

      const idleDuration = timestamp - lastUserActivityRef.current;
      const autoRotationEval = evaluateAutoRotation({
        enabled: autoRotateEnabledRef.current,
        idleDurationMs: idleDuration,
        deltaSeconds: delta,
        timestamp,
        isUserInteracting,
        isFocusModeActive: Boolean(currentFocused),
      });

      // FPS Measurement & Telemetry throttled to 500ms
      frameCountRef.current++;
      if (timestamp - lastTimeRef.current >= 500) {
        fpsRef.current = Math.round((frameCountRef.current * 1000) / (timestamp - lastTimeRef.current));
        frameCountRef.current = 0;
        lastTimeRef.current = timestamp;

        if (rendererRef.current && currentItems.length > 0) {
          const R = SpatialLayoutEngine.computeDynamicRadius(currentItems.length);
          onStatsUpdateRef.current({
            photoCount: currentItems.length,
            sphereRadius: Math.round(R),
            cameraDistance: Math.round(cameraState.current.radius),
            fps: fpsRef.current,
            drawCalls: rendererRef.current.info.render.calls,
            autoRotationStatus: autoRotationEval.status,
            bloomEnabled: bloomEnabledRef.current,
            depthOfFieldEnabled: depthOfFieldEnabledRef.current,
            focusDistance: Math.round(currentFocusDistanceRef.current),
          });
        }
      }

      if (autoRotationEval.isActive) {
        cam.targetTheta += autoRotationEval.angularStep;
        cam.theta += autoRotationEval.angularStep;

        if (autoRotationEval.tiltOscillationStep !== 0) {
          cam.targetPhi = Math.max(0.1, Math.min(3.04, cam.targetPhi + autoRotationEval.tiltOscillationStep));
        }

        // Gently drift pan offset back toward central sphere origin only when not in Focus Mode
        if (!currentFocused && cam.targetPanOffset.lengthSq() > 0.001) {
          cam.targetPanOffset.multiplyScalar(Math.max(0, 1 - delta * 0.45 * autoRotationEval.rampFactor));
        }
      }

      const isFlightActive = activeFocusFlightRef.current?.isRunning() || false;

      // If in Focus Mode, dynamically track the focused item's current spatial position (when not executing camera flight)
      if (currentFocused && !isFlightActive) {
        const liveFocusedItem = currentItems.find((i) => i.id === currentFocused.id);
        if (liveFocusedItem) {
          cam.targetPanOffset.set(
            liveFocusedItem.targetPos[0],
            liveFocusedItem.targetPos[1],
            liveFocusedItem.targetPos[2]
          );
        }
      }

      if (!cam.isDragging && !cam.isMultiTouching && !isFlightActive) {
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

      // Smooth lerp to target spherical coordinates and pan focus (bypassed during automated flight)
      if (!isFlightActive) {
        const dTheta = FocusCameraTransitionEngine.calculateShortestAngle(cam.theta, cam.targetTheta);
        cam.theta += dTheta * 0.12;
        cam.phi += (cam.targetPhi - cam.phi) * 0.12;
        cam.radius += (cam.targetRadius - cam.radius) * 0.1;
        cam.panOffset.lerp(cam.targetPanOffset, 0.12);
      }

      // Gimbal Lock Prevention: Clamp polar angle phi in [0.05, 3.09]
      cam.phi = Math.max(0.05, Math.min(3.09, cam.phi));

      // Update camera 3D Cartesian coordinates relative to pan focal point
      if (cameraRef.current) {
        const cx = cam.panOffset.x + cam.radius * Math.sin(cam.phi) * Math.sin(cam.theta);
        const cy = cam.panOffset.y + cam.radius * Math.cos(cam.phi);
        const cz = cam.panOffset.z + cam.radius * Math.sin(cam.phi) * Math.cos(cam.theta);
        cameraRef.current.position.set(cx, cy, cz);
        cameraRef.current.lookAt(cam.panOffset.x, cam.panOffset.y, cam.panOffset.z);

        // Throttled Spatial Audio updates (25Hz) to prevent Web Audio thread saturation
        if (timestamp - lastAudioTimeRef.current > 40) {
          lastAudioTimeRef.current = timestamp;
          cameraRef.current.getWorldDirection(camForwardVecRef.current);
          const camUp = cameraRef.current.up;

          SpatialAudioProcessor.updateListener(
            { x: cx, y: cy, z: cz },
            { x: camForwardVecRef.current.x, y: camForwardVecRef.current.y, z: camForwardVecRef.current.z },
            { x: camUp.x, y: camUp.y, z: camUp.z }
          );

          // Real-time spatial tracking and distance attenuation to focused photo memory item
          if (currentFocused) {
            const liveFocusedItem = currentItems.find((i) => i.id === currentFocused.id);
            const fPos = liveFocusedItem ? liveFocusedItem.currentPos : currentFocused.currentPos;
            SpatialAudioProcessor.updateFocusedItemSpatialAudio(
              [cx, cy, cz],
              fPos,
              currentFocused,
              { x: camForwardVecRef.current.x, y: camForwardVecRef.current.y, z: camForwardVecRef.current.z },
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

      // Smooth Node Transform Interpolation
      const lerpSpeed = 0.08; // Smooth 60fps convergence
      const isQuerying = currentQuery.trim().length > 0;
      const hoveredIdx = hoveredIndexRef.current;
      const isFocusModeActive = Boolean(currentFocused);
      const meshes = meshPoolRef.current;
      const haloMeshes = haloMeshPoolRef.current;
      const itemCount = currentItems.length;
      const isTransitionActive = transitionHandleRef.current?.isRunning() ?? false;

      for (let i = 0; i < itemCount; i++) {
        const item = currentItems[i];
        const mesh = meshes[i];
        const haloMesh = haloMeshes[i];
        if (!mesh || !haloMesh) continue;

        // Position & Rotation interpolation: if GSAP transition is running, GSAP directly drives coordinates along parabolic arc
        if (!isTransitionActive) {
          item.currentPos[0] += (item.targetPos[0] - item.currentPos[0]) * lerpSpeed;
          item.currentPos[1] += (item.targetPos[1] - item.currentPos[1]) * lerpSpeed;
          item.currentPos[2] += (item.targetPos[2] - item.currentPos[2]) * lerpSpeed;
          item.rotation[0] += (item.targetRotation[0] - item.rotation[0]) * lerpSpeed;
          item.rotation[1] += (item.targetRotation[1] - item.rotation[1]) * lerpSpeed;
          item.rotation[2] += (item.targetRotation[2] - item.rotation[2]) * lerpSpeed;
        }

        mesh.position.set(item.currentPos[0], item.currentPos[1], item.currentPos[2]);
        haloMesh.position.set(item.currentPos[0], item.currentPos[1], item.currentPos[2]);

        // Card Orientation: Face outward or smoothly interpolate rotation
        mesh.rotation.set(item.rotation[0], item.rotation[1], item.rotation[2]);
        haloMesh.rotation.set(item.rotation[0], item.rotation[1], item.rotation[2]);

        // Visual State Attenuation based on Search NLP, Focus Mode & Selection
        const isHovered = hoveredIdx === i;
        const isSelected = currentSelected.has(item.id);
        const isMatching = !isQuerying || item.matchScore > 0.15;
        const isFocusedCard = currentFocused?.id === item.id;

        let targetOpacity = 1.0;
        let targetScale = 1.0;
        let haloOpacity = 0.0;
        let haloColor = 0x38bdf8; // Cyan default

        if (isFocusedCard) {
          targetOpacity = 1.0;
          targetScale = 1.42;
          haloOpacity = 0.98;
          haloColor = isSelected ? 0xfbbf24 : 0x38bdf8;
        } else if (isFocusModeActive) {
          targetOpacity = isMatching ? 0.20 : 0.04;
          targetScale = isMatching ? 0.85 : 0.4;
          haloOpacity = 0.0;
        } else if (!isMatching) {
          targetOpacity = 0.06;
          targetScale = 0.5;
          haloOpacity = 0.0;
        } else if (isHovered || isSelected) {
          targetOpacity = 1.0;
          targetScale = 1.35;
          haloOpacity = 0.92;
          haloColor = isSelected ? 0xfbbf24 : 0x38bdf8; // Gold for selected, Cyan for hover
        } else if (isQuerying && item.matchScore > 0.5) {
          targetOpacity = 1.0;
          targetScale = 1.25;
          haloOpacity = 0.80;
          haloColor = 0x38bdf8;
        } else {
          // Atmospheric ethereal rim glow for all visible memory nodes when bloom is active
          haloOpacity = bloomEnabledRef.current ? DEFAULT_BLOOM_CONFIG.ambientHaloOpacity : 0.0;
          haloColor = 0x0284c7; // Deep luminous sky cyan
        }

        // Evaluate subtle Shimmer & Pulse feedback for node dragging and spatial re-ordering
        const shimmerEngine = shimmerEngineRef.current;
        const feedback = shimmerEngine && cameraRef.current
          ? shimmerEngine.evaluateNode(i, item, timestamp, cameraRef.current)
          : null;

        if (feedback) {
          targetScale *= feedback.scaleMultiplier;
          if (feedback.haloOpacity > 0.01) {
            haloOpacity = Math.max(haloOpacity, feedback.haloOpacity);
            haloColor = feedback.haloColor;
          }
        }

        item.opacity += (targetOpacity - item.opacity) * 0.15;
        item.scale += (targetScale - item.scale) * 0.15;

        // Apply elevation towards camera for dragged and pulsing nodes
        if (feedback && (feedback.elevationOffset.x !== 0 || feedback.elevationOffset.y !== 0 || feedback.elevationOffset.z !== 0)) {
          mesh.position.add(feedback.elevationOffset);
          haloMesh.position.add(feedback.elevationOffset);
        }

        mesh.scale.set(item.scale, item.scale, item.scale);
        haloMesh.scale.set(item.scale * 1.15, item.scale * 1.15, 1);

        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = feedback && feedback.shimmerIntensity > 0
          ? Math.min(1.0, item.opacity * (1.0 + feedback.shimmerIntensity * 0.18))
          : item.opacity;

        // Skip GPU draw of completely invisible halos for performance boost
        haloMesh.visible = haloOpacity > 0.01;
        if (haloMesh.visible) {
          const haloMat = haloMesh.material as THREE.MeshBasicMaterial;
          haloMat.opacity = haloOpacity;
          haloMat.color.setHex(haloColor);
        }
      }

      // Update Spatial Holographic Metadata Overlays
      if (holoManagerRef.current && cameraRef.current) {
        holoManagerRef.current.update(
          currentSelected,
          currentFocused,
          currentItems,
          showHoloOverlaysRef.current,
          timestamp,
          cameraRef.current
        );
      }

      // Dynamic 3D Cluster Theme Labels Interpolation & Floating Animation
      const clusterLabels = labelSpritesRef.current;
      for (let i = 0; i < clusterLabels.length; i++) {
        const cl = clusterLabels[i];
        cl.currentPos[0] += (cl.targetPos[0] - cl.currentPos[0]) * 0.08;
        cl.currentPos[1] += (cl.targetPos[1] - cl.currentPos[1]) * 0.08;
        cl.currentPos[2] += (cl.targetPos[2] - cl.currentPos[2]) * 0.08;

        const isHovered = currentShowLabels && cl.sprite === hoveredClusterLabelRef.current;
        const normalOpacity = currentShowLabels ? ((cl.sprite.userData.baseOpacity as number) ?? 0.95) : 0.0;
        cl.targetOpacity = isHovered ? Math.min(1.0, normalOpacity + 0.12) : normalOpacity;
        // Smooth exponential blending for opacity
        cl.currentOpacity += (cl.targetOpacity - cl.currentOpacity) * 0.12;

        const baseScale = (cl.sprite.userData.baseScale as THREE.Vector3) || null;
        if (baseScale) {
          const hoverMultiplier = isHovered ? (cl.sprite.userData.hoverScaleMultiplier || 1.06) : 1.0;
          // Re-use pre-allocated labelTargetScaleVecRef to guarantee zero allocations per frame
          labelTargetScaleVecRef.current.copy(baseScale).multiplyScalar(hoverMultiplier);
          cl.sprite.scale.lerp(labelTargetScaleVecRef.current, 0.12);
        }

        const floatOsc = Math.sin(timestamp * 0.002 + i * 1.5) * 4;

        cl.sprite.position.set(
          cl.currentPos[0],
          cl.currentPos[1] + floatOsc,
          cl.currentPos[2]
        );
        cl.sprite.material.opacity = cl.currentOpacity;
        cl.sprite.visible = cl.currentOpacity > 0.01;
      }

      // Spatial Navigation Focus Trail Animation & Spline Geometry Update
      if (trailGroupRef.current) {
        if (!currentShowTrail) {
          trailGroupRef.current.visible = false;
        } else {
          trailGroupRef.current.visible = true;
          const trailEngine = trailEngineRef.current;

          // Sync live coordinates of waypoints using persistent map to avoid GC churn
          const itemsMap = itemsMapRef.current;
          itemsMap.clear();
          for (let i = 0; i < currentItems.length; i++) {
            itemsMap.set(currentItems[i].id, currentItems[i]);
          }
          trailEngine.syncPositions(itemsMap);

          const waypoints = trailEngine.getWaypoints();
          const wpCount = waypoints.length;

          if (wpCount >= 2 && trailLineGeoRef.current) {
            const splinePoints = trailEngine.generateSplinePoints(24);
            const ptCount = Math.min(splinePoints.length, 320);

            const posAttr = trailLineGeoRef.current.getAttribute('position') as THREE.BufferAttribute;
            const colAttr = trailLineGeoRef.current.getAttribute('color') as THREE.BufferAttribute;

            const haloPosAttr = trailHaloLineGeoRef.current?.getAttribute('position') as THREE.BufferAttribute | undefined;
            const haloColAttr = trailHaloLineGeoRef.current?.getAttribute('color') as THREE.BufferAttribute | undefined;

            const posArr = posAttr.array as Float32Array;
            const colArr = colAttr.array as Float32Array;
            const haloPosArr = haloPosAttr ? (haloPosAttr.array as Float32Array) : null;
            const haloColArr = haloColAttr ? (haloColAttr.array as Float32Array) : null;

            for (let p = 0; p < ptCount; p++) {
              const pt = splinePoints[p];
              const i3 = p * 3;
              posArr[i3] = pt.position[0];
              posArr[i3 + 1] = pt.position[1];
              posArr[i3 + 2] = pt.position[2];

              // Alpha-weighted RGB for subtle glowing neon path
              colArr[i3] = pt.color[0] * pt.alpha;
              colArr[i3 + 1] = pt.color[1] * pt.alpha;
              colArr[i3 + 2] = pt.color[2] * pt.alpha;

              if (haloPosArr && haloColArr) {
                haloPosArr[i3] = pt.position[0];
                haloPosArr[i3 + 1] = pt.position[1];
                haloPosArr[i3 + 2] = pt.position[2];

                haloColArr[i3] = pt.color[0] * pt.alpha * 0.45;
                haloColArr[i3 + 1] = pt.color[1] * pt.alpha * 0.45;
                haloColArr[i3 + 2] = pt.color[2] * pt.alpha * 0.45;
              }
            }

            posAttr.needsUpdate = true;
            colAttr.needsUpdate = true;
            trailLineGeoRef.current.setDrawRange(0, ptCount);

            if (haloPosAttr && haloColAttr && trailHaloLineGeoRef.current) {
              haloPosAttr.needsUpdate = true;
              haloColAttr.needsUpdate = true;
              trailHaloLineGeoRef.current.setDrawRange(0, ptCount);
            }

            // Animated Energy Pulse Bead traveling along the path
            if (pulseMeshRef.current) {
              const pulseProgress = (timestamp * 0.00045) % 1.0;
              const pulsePos = FocusTrailEngine.evaluatePulsePosition(splinePoints, pulseProgress);
              if (pulsePos) {
                pulseMeshRef.current.position.set(pulsePos[0], pulsePos[1], pulsePos[2]);
                pulseMeshRef.current.visible = true;
                const pulseScale = 1.0 + Math.sin(timestamp * 0.008) * 0.35;
                pulseMeshRef.current.scale.set(pulseScale, pulseScale, pulseScale);
              }
            }
          } else {
            if (trailLineGeoRef.current) trailLineGeoRef.current.setDrawRange(0, 0);
            if (trailHaloLineGeoRef.current) trailHaloLineGeoRef.current.setDrawRange(0, 0);
            if (pulseMeshRef.current) pulseMeshRef.current.visible = false;
          }

          // Update Waypoint Orientation Beacon Rings
          const beacons = beaconMeshesRef.current;
          for (let b = 0; b < beacons.length; b++) {
            const beacon = beacons[b];
            if (b < wpCount) {
              const wp = waypoints[b];
              const beaconProps = FocusTrailEngine.calculateBeaconProps(b, wpCount);

              beacon.position.set(wp.position[0], wp.position[1], wp.position[2]);
              if (cameraRef.current) {
                beacon.quaternion.copy(cameraRef.current.quaternion);
              }

              let scale = beaconProps.scale;
              if (beaconProps.isLatest) {
                scale *= (1.0 + Math.sin(timestamp * 0.006) * 0.15);
              }
              beacon.scale.set(scale, scale, scale);

              const bMat = beacon.material as THREE.MeshBasicMaterial;
              bMat.opacity = beaconProps.opacity;
              const rgb = FocusTrailEngine.hslToRgb(wp.hue || 200, 0.85, 0.6);
              bMat.color.setRGB(rgb[0], rgb[1], rgb[2]);
              beacon.visible = true;
            } else {
              beacon.visible = false;
            }
          }
        }
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

      const taaState = computeTaaMotionState(dTheta, dPhi, dRadius, dPan, isUserInteracting);

      // Adaptive Bloom Intensity & Radius calibration based on camera motion and focus state
      if (bloomPassRef.current) {
        const isHighSpeed = taaState.mode === 'HIGH_SPEED_JITTER';
        const adaptive = computeAdaptiveBloom({
          isFocusMode: isFocusModeActive,
          isHighSpeedMotion: isHighSpeed,
        });
        bloomPassRef.current.strength = adaptive.effectiveStrength;
        bloomPassRef.current.radius = adaptive.effectiveRadius;
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

      // Dynamic Optical Depth-of-Field Post-Processing Engine
      if (dofPassRef.current) {
        if (depthOfFieldEnabledRef.current) {
          dofPassRef.current.enabled = true;

          if (currentFocused && cameraRef.current) {
            // Live position of focused item (gracefully accounts for ongoing layout morphing transitions)
            const liveFocused = currentItems.find((i) => i.id === currentFocused.id);
            const fPos = liveFocused ? liveFocused.currentPos : currentFocused.currentPos;

            // Optical lens autofocus: compute viewZ along camera optical axis
            const targetFocusDist = computeAutoFocusDistance(cameraRef.current, fPos);

            // Smooth cinematic rack-focus lerp towards target
            currentFocusDistanceRef.current = THREE.MathUtils.lerp(
              currentFocusDistanceRef.current,
              targetFocusDist,
              0.14
            );

            // Smoothly ramp up creamy optical bokeh blur for background memory nodes
            currentMaxBlurRef.current = THREE.MathUtils.lerp(
              currentMaxBlurRef.current,
              0.018, // Max circle of confusion radius
              0.12
            );

            currentApertureRef.current = THREE.MathUtils.lerp(
              currentApertureRef.current,
              0.00008, // Optical aperture multiplier
              0.12
            );
          } else {
            // Ambient Overview Mode: smoothly ease blur down so entire sphere remains crisp
            currentMaxBlurRef.current = THREE.MathUtils.lerp(
              currentMaxBlurRef.current,
              0.0,
              0.10
            );
            currentFocusDistanceRef.current = THREE.MathUtils.lerp(
              currentFocusDistanceRef.current,
              1200.0,
              0.05
            );
            currentApertureRef.current = THREE.MathUtils.lerp(
              currentApertureRef.current,
              0.0,
              0.10
            );
          }

          // Apply uniforms to the DepthOfFieldPass
          dofPassRef.current.uniforms['focus'].value = currentFocusDistanceRef.current;
          dofPassRef.current.uniforms['maxblur'].value = currentMaxBlurRef.current;
          dofPassRef.current.uniforms['aperture'].value = currentApertureRef.current;
          dofPassRef.current.uniforms['focalRange'].value = 28.0; // In-focus tolerance zone (keeps focused card sharp)
          if (cameraRef.current) {
            dofPassRef.current.uniforms['aspect'].value = cameraRef.current.aspect;
            dofPassRef.current.uniforms['nearClip'].value = cameraRef.current.near;
            dofPassRef.current.uniforms['farClip'].value = cameraRef.current.far;
          }
        } else {
          dofPassRef.current.enabled = false;
        }
      }

      const bloomPass = bloomPassRef.current;
      const dofPass = dofPassRef.current;
      const composer = composerRef.current;
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const bloomStrength = bloomPass ? bloomPass.strength : 0;

      const isPostProcessingActive =
        focusedNodeRef.current !== null || bloomStrength > 0.01;

      if (bloomPass && dofPass) {
        if (isDraggingRef.current) {
          bloomPass.enabled = false;
          dofPass.enabled   = false;
        } else {
          bloomPass.enabled = true;
          dofPass.enabled   = isPostProcessingActive;
        }
      }

      if (renderer?.xr?.isPresenting) {
        if (scene && camera) {
          renderer.render(scene, camera);
        }
      } else if (isPostProcessingActive && !isDraggingRef.current && composer) {
        composer.render();
      } else if (renderer && scene && camera) {
        renderer.render(scene, camera);
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
  }, []);

  /**
   * Sync VR gesture sensitivity multiplier with WebXREngine
   */
  useEffect(() => {
    WebXREngine.setGestureSensitivity(vrGestureSensitivity);
  }, [vrGestureSensitivity]);

  /**
   * Temporary visual feedback badge for active touch gestures
   */
  const triggerGestureFeedback = useCallback((type: 'ZOOM' | 'ROTATE' | 'PAN' | 'RECENTER' | 'FOCUS' | 'DRAG' | 'REORDER', label: string) => {
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
   * Centered with equal black space around all four edges
   */
  const resetCamera = useCallback(() => {
    recordUserActivity();
    onFocusItem(null);
    cameraState.current.targetPanOffset.set(0, 0, 0);
    cameraState.current.targetTheta = Math.PI / 4;
    cameraState.current.targetPhi = Math.PI * 0.5;
    updateAdaptiveCamera();
    AudioSynthesizer.playLayoutSwoosh(0);
    triggerGestureFeedback('RECENTER', 'Sphere Centered (Equal Margins)');
  }, [updateAdaptiveCamera, triggerGestureFeedback, recordUserActivity, onFocusItem]);

  // Trigger camera reset whenever resetCameraSignal increments
  useEffect(() => {
    if (resetCameraSignal && resetCameraSignal > 0) {
      resetCamera();
    }
  }, [resetCameraSignal, resetCamera]);

  /**
   * Tri-Modal Interaction Listeners (Mouse, Touch, Keyboard)
   */
  const handlePointerDown = (event: React.PointerEvent) => {
    pointerDownPosRef.current = { x: event.clientX, y: event.clientY };
    pointerMovedRef.current = false;
    isDraggingRef.current = true;
    recordUserActivity();
    stopActiveFocusFlight();
    // Ignore touch pointers in pointer event handler because dedicated touch handlers handle multi-touch
    if (event.pointerType === 'touch') return;

    // Check if right-click or shift-click for 3D Lasso picking
    if (event.button === 2 || event.shiftKey) {
      isLassoActiveRef.current = true;
      lassoPointsRef.current = [{ x: event.clientX, y: event.clientY }];
      drawLasso();
      return;
    }

    // Check if pointer is pressing directly on an active memory node
    if (hoveredIndexRef.current !== null && items[hoveredIndexRef.current]) {
      cardDragState.current.pendingIndex = hoveredIndexRef.current;
      cardDragState.current.isCardDragging = false;
      cardDragState.current.startPointer = { x: event.clientX, y: event.clientY };
      cardDragState.current.hasMoved = false;
    } else {
      cardDragState.current.pendingIndex = null;
      cardDragState.current.isCardDragging = false;
    }

    cameraState.current.isDragging = true;
    cameraState.current.prevPointer = { x: event.clientX, y: event.clientY };
    cameraState.current.momentum = { x: 0, y: 0 };
    cameraState.current.panMomentum.set(0, 0, 0);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (pointerDownPosRef.current) {
      const dx = event.clientX - pointerDownPosRef.current.x;
      const dy = event.clientY - pointerDownPosRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD_PX) {
        pointerMovedRef.current = true;
      }
    }
    recordUserActivity();
    if (event.pointerType === 'touch') return;
    const e = event;

    // Update normalized mouse coordinates for raycasting
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      mousePosRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mousePosRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    // Cluster label raycasting & hover detection (WebGL-native, zero per-frame allocation)
    const prevHoveredLabel = hoveredClusterLabelRef.current;
    const isActiveDrag = (pointerDownPosRef.current !== null && pointerMovedRef.current) ||
      cameraState.current.isDragging ||
      cardDragState.current.isCardDragging ||
      isDraggingRef.current;

    if (isActiveDrag || !showClusterLabelsRef.current) {
      hoveredClusterLabelRef.current = null;
    } else if (cameraRef.current && labelsGroupRef.current && labelsGroupRef.current.children.length > 0 && !isLassoActiveRef.current) {
      raycasterRef.current.setFromCamera(mousePosRef.current, cameraRef.current);
      const labelIntersects = labelIntersectsRef.current;
      labelIntersects.length = 0;
      raycasterRef.current.intersectObjects(labelsGroupRef.current.children, false, labelIntersects);
      if (labelIntersects.length > 0 && labelIntersects[0].object.userData?.kind === 'cluster-label') {
        hoveredClusterLabelRef.current = labelIntersects[0].object as THREE.Sprite;
      } else {
        hoveredClusterLabelRef.current = null;
      }
    } else {
      hoveredClusterLabelRef.current = null;
    }

    if (hoveredClusterLabelRef.current !== prevHoveredLabel) {
      const canvas = rendererRef.current?.domElement;
      if (canvas) {
        canvas.style.cursor = (hoveredClusterLabelRef.current && !isActiveDrag) ? 'pointer' : 'grab';
      }
      if (containerRef.current) {
        containerRef.current.style.cursor = (hoveredClusterLabelRef.current && !isActiveDrag) ? 'pointer' : '';
      }
    }

    // Lasso drawing
    if (isLassoActiveRef.current) {
      lassoPointsRef.current.push({ x: e.clientX, y: e.clientY });
      drawLasso();
      return;
    }

    // Direct 3D Node Dragging with Dynamic Shimmer and Pulse animations
    if (cardDragState.current.pendingIndex !== null && cameraRef.current) {
      const dist = Math.hypot(
        e.clientX - cardDragState.current.startPointer.x,
        e.clientY - cardDragState.current.startPointer.y
      );

      // Transition to active node dragging when moved beyond subtle 5px threshold
      if (!cardDragState.current.isCardDragging && dist > 5) {
        cardDragState.current.isCardDragging = true;
        cardDragState.current.hasMoved = true;
        cameraState.current.isDragging = false; // Suppress camera orbit while dragging card

        const idx = cardDragState.current.pendingIndex;
        raycasterRef.current.setFromCamera(mousePosRef.current, cameraRef.current);
        shimmerEngineRef.current?.startDrag(
          idx,
          items[idx],
          raycasterRef.current.ray,
          cameraRef.current,
          performance.now()
        );
        AudioSynthesizer.playCardSelect(items[idx].hue, items[idx].currentPos);
        triggerGestureFeedback('DRAG', `Repositioning: ${items[idx].title}`);
      }

      if (cardDragState.current.isCardDragging && shimmerEngineRef.current?.isDragging()) {
        cardDragState.current.hasMoved = true;
        cameraState.current.isDragging = false;
        raycasterRef.current.setFromCamera(mousePosRef.current, cameraRef.current);
        const { targetSlotIndex } = shimmerEngineRef.current.updateDrag(
          raycasterRef.current.ray,
          items,
          cameraRef.current,
          performance.now()
        );
        if (targetSlotIndex >= 0 && items[targetSlotIndex]) {
          triggerGestureFeedback('REORDER', `Snap Target: ${items[targetSlotIndex].title}`);
        }
        return; // Prevent camera orbit rotation
      }
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
    isDraggingRef.current = false;
    recordUserActivity();
    if (e.pointerType === 'touch') return;

    if (isLassoActiveRef.current) {
      isLassoActiveRef.current = false;
      finishLassoSelection();
      clearLasso();
      return;
    }

    // End 3D node dragging and check for slot swap / matrix re-ordering
    if (cardDragState.current.isCardDragging && shimmerEngineRef.current?.isDragging()) {
      const { didReorder, swappedPair } = shimmerEngineRef.current.endDrag(items, (fromIdx, toIdx) => {
        // Swap slots in items array to persist re-order
        const newItems = [...items];
        const temp = newItems[fromIdx];
        newItems[fromIdx] = newItems[toIdx];
        newItems[toIdx] = temp;
        onReorderItemsRef.current?.(newItems);
      });

      if (didReorder && swappedPair) {
        const toIdx = swappedPair[1];
        AudioSynthesizer.playCardSelect(items[toIdx]?.hue || 200);
        triggerGestureFeedback('REORDER', `Re-ordered: ${items[toIdx]?.title || 'Memory Node'}`);
      } else {
        triggerGestureFeedback('DRAG', 'Node Settled');
      }

      cardDragState.current.isCardDragging = false;
      cardDragState.current.pendingIndex = null;
      cameraState.current.isDragging = false;
      return;
    }

    cardDragState.current.isCardDragging = false;
    cardDragState.current.pendingIndex = null;
    cameraState.current.isDragging = false;
  };

  const handlePointerLeave = () => {
    if (hoveredClusterLabelRef.current !== null) {
      hoveredClusterLabelRef.current = null;
      const canvas = rendererRef.current?.domElement;
      if (canvas) canvas.style.cursor = 'grab';
      if (containerRef.current) containerRef.current.style.cursor = '';
    }
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
    stopActiveFocusFlight();
    const touches = e.touches;
    touchState.current.touchStartTime = performance.now();
    touchState.current.hasMovedSignificantly = false;

    if (touches.length === 1) {
      touchState.current.activeTouchCount = 1;
      const t = touches[0];
      touchState.current.singleTouchStart = { x: t.clientX, y: t.clientY };
      touchState.current.prevSingleTouch = { x: t.clientX, y: t.clientY, time: performance.now() };

      // Check if touching on a memory node for potential 3D direct drag
      if (hoveredIndexRef.current !== null && items[hoveredIndexRef.current]) {
        cardDragState.current.pendingIndex = hoveredIndexRef.current;
        cardDragState.current.isCardDragging = false;
        cardDragState.current.startPointer = { x: t.clientX, y: t.clientY };
        cardDragState.current.hasMoved = false;
      } else {
        cardDragState.current.pendingIndex = null;
        cardDragState.current.isCardDragging = false;
      }

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

      // Touch-based 3D node dragging with shimmer/pulse feedback
      if (cardDragState.current.pendingIndex !== null && cameraRef.current) {
        const dist = Math.hypot(
          t.clientX - cardDragState.current.startPointer.x,
          t.clientY - cardDragState.current.startPointer.y
        );

        if (!cardDragState.current.isCardDragging && dist > 7) {
          cardDragState.current.isCardDragging = true;
          cardDragState.current.hasMoved = true;
          touchState.current.hasMovedSignificantly = true;
          cameraState.current.isDragging = false;

          const idx = cardDragState.current.pendingIndex;
          raycasterRef.current.setFromCamera(mousePosRef.current, cameraRef.current);
          shimmerEngineRef.current?.startDrag(
            idx,
            items[idx],
            raycasterRef.current.ray,
            cameraRef.current,
            performance.now()
          );
          AudioSynthesizer.playCardSelect(items[idx].hue, items[idx].currentPos);
          triggerGestureFeedback('DRAG', `Dragging: ${items[idx].title}`);
        }

        if (cardDragState.current.isCardDragging && shimmerEngineRef.current?.isDragging()) {
          cardDragState.current.hasMoved = true;
          touchState.current.hasMovedSignificantly = true;
          cameraState.current.isDragging = false;
          raycasterRef.current.setFromCamera(mousePosRef.current, cameraRef.current);
          const { targetSlotIndex } = shimmerEngineRef.current.updateDrag(
            raycasterRef.current.ray,
            items,
            cameraRef.current,
            performance.now()
          );
          if (targetSlotIndex >= 0 && items[targetSlotIndex]) {
            triggerGestureFeedback('REORDER', `Snap Target: ${items[targetSlotIndex].title}`);
          }
          return;
        }
      }

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

    // End 3D node touch dragging and check for slot swap / re-ordering
    if (cardDragState.current.isCardDragging && shimmerEngineRef.current?.isDragging()) {
      const { didReorder, swappedPair } = shimmerEngineRef.current.endDrag(items, (fromIdx, toIdx) => {
        const newItems = [...items];
        const temp = newItems[fromIdx];
        newItems[fromIdx] = newItems[toIdx];
        newItems[toIdx] = temp;
        onReorderItemsRef.current?.(newItems);
      });

      if (didReorder && swappedPair) {
        const toIdx = swappedPair[1];
        AudioSynthesizer.playCardSelect(items[toIdx]?.hue || 200);
        triggerGestureFeedback('REORDER', `Re-ordered: ${items[toIdx]?.title || 'Memory Node'}`);
      } else {
        triggerGestureFeedback('DRAG', 'Node Settled');
      }

      cardDragState.current.isCardDragging = false;
      cardDragState.current.pendingIndex = null;
      cameraState.current.isDragging = false;
      cameraState.current.isMultiTouching = false;
      touchState.current.activeTouchCount = 0;
      return;
    }

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
    if (cardDragState.current.isCardDragging && shimmerEngineRef.current?.isDragging()) {
      shimmerEngineRef.current.endDrag(items);
    }
    cardDragState.current.isCardDragging = false;
    cardDragState.current.pendingIndex = null;
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

  const performRaycast = (event: React.MouseEvent): THREE.Object3D | null => {
    if (!containerRef.current || !cameraRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycasterRef.current.setFromCamera(mouse, cameraRef.current);
    const activeMeshes = meshPoolRef.current.filter((m) => m.visible);
    const intersects = raycasterRef.current.intersectObjects(activeMeshes);
    return intersects.length > 0 ? intersects[0].object : null;
  };

  const focusNode = (raycastHit: THREE.Object3D) => {
    const idx = raycastHit.userData?.index ?? meshPoolRef.current.indexOf(raycastHit as THREE.Mesh);
    if (idx !== -1 && idx !== undefined && items[idx]) {
      const selectedItem = items[idx];
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
    }
  };

  /**
   * Click / Tap Selection on 3D Card - Lock into Focus Mode orbit via double-click
   */
  const handleClick = (event: React.MouseEvent) => {
    if (pointerMovedRef.current) {
      // This was a drag, not a click — do nothing, let OrbitControls handle it
      pointerDownPosRef.current = null;
      return;
    }

    const raycastHit = performRaycast(event); // use existing raycast logic/variable name
    if (!raycastHit) {
      pointerDownPosRef.current = null;
      return;
    }

    const now = performance.now();
    const isSameMesh = lastClickedMeshRef.current === raycastHit;
    const isWithinDoubleClickWindow = (now - lastClickTimeRef.current) < DOUBLE_CLICK_MS;

    if (isSameMesh && isWithinDoubleClickWindow) {
      focusNode(raycastHit); // KEEP existing function name/call used for fly-out
      lastClickTimeRef.current = 0;
      lastClickedMeshRef.current = null;
    } else {
      lastClickTimeRef.current = now;
      lastClickedMeshRef.current = raycastHit;
    }

    pointerDownPosRef.current = null;
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
      } else if (e.key === 'o' || e.key === 'O') {
        recordUserActivity();
        onToggleAutoRotateRef.current?.();
        triggerGestureFeedback(
          'ROTATE',
          autoRotateEnabledRef.current ? 'Auto-Orbit Paused' : 'Auto-Orbit Active'
        );
      } else if (e.key === 'n' || e.key === 'N') {
        recordUserActivity();
        onToggleFocusTrail?.();
        triggerGestureFeedback('FOCUS', showFocusTrail ? 'Trail Disabled' : 'Trail Enabled');
      } else if (e.key === 'b' || e.key === 'B') {
        recordUserActivity();
        onToggleBloomRef.current?.();
        triggerGestureFeedback(
          'FOCUS',
          bloomEnabledRef.current ? 'Bloom Glow Disabled' : 'Atmospheric Glow Active'
        );
      } else if (e.key === 'h' || e.key === 'H') {
        recordUserActivity();
        onToggleHoloOverlaysRef.current?.();
        triggerGestureFeedback(
          'FOCUS',
          showHoloOverlaysRef.current ? 'Holo Overlays Hidden' : 'Holo Overlays Active'
        );
      } else if (e.key === 'f' || e.key === 'F') {
        recordUserActivity();
        onToggleDepthOfFieldRef.current?.();
        triggerGestureFeedback(
          'FOCUS',
          depthOfFieldEnabledRef.current ? 'Depth-of-Field Disabled' : 'Depth-of-Field Active'
        );
      }
    };

    const handleWindowPointerUp = () => {
      recordUserActivity();
      if (cameraState.current.isDragging) {
        cameraState.current.isDragging = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerup', handleWindowPointerUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerup', handleWindowPointerUp);
    };
  }, [resetCamera, recordUserActivity, onToggleFocusTrail, showFocusTrail, triggerGestureFeedback]);

  return (
    <div
      ref={containerRef}
      id="photosphere-canvas-container"
      data-dof-enabled={depthOfFieldEnabled}
      data-dof-focused={Boolean(focusedItem)}
      className="relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing select-none touch-none"
      style={{
        touchAction: 'none',
        contain: 'layout size paint',
        transform: 'translateZ(0)',
        willChange: 'transform',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onWheel={handleWheel}
      onClick={handleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Optical Lens Vignette when Depth-of-Field and Focus Mode is Active */}
      <div
        id="photosphere-dof-vignette"
        className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-700 ease-out ${
          depthOfFieldEnabled && focusedItem ? 'opacity-70' : 'opacity-0'
        }`}
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 42%, rgba(5,7,15,0.45) 82%, rgba(2,3,8,0.78) 100%)',
        }}
      />

      {/* Dynamic Depth-of-Field Autofocus Lock Indicator */}
      <AnimatePresence>
        {depthOfFieldEnabled && focusedItem && (
          <motion.div
            key="dof-autofocus-badge"
            id="photosphere-dof-status-badge"
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="pointer-events-none absolute bottom-8 left-8 z-20 px-3.5 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-emerald-500/35 text-emerald-400 text-xs font-mono flex items-center gap-2.5 shadow-[0_0_24px_rgba(16,185,129,0.22)] select-none"
          >
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <Camera className="w-3.5 h-3.5 text-emerald-300" />
            <span className="font-semibold tracking-wider">DOF OPTICAL LOCK</span>
            <span className="text-white/30">|</span>
            <span className="text-emerald-200/90 font-mono text-[11px]">
              {Math.round(currentFocusDistanceRef.current)}u SHARP
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic 3D Spatial Layout Morphing Notification Badge via Framer Motion */}
      <AnimatePresence>
        {transitionInfo && (
          <motion.div
            key="spatial-morph-badge"
            id="photosphere-spatial-morph-badge"
            initial={{ opacity: 0, y: -24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.94 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="pointer-events-none absolute top-6 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full bg-[#060914]/85 border border-[#38bdf8]/40 backdrop-blur-xl shadow-[0_0_30px_rgba(56,189,248,0.25)] text-xs font-mono tracking-wide text-sky-200 flex items-center gap-3 select-none"
          >
            <span className="text-base animate-pulse">
              {SpatialTransitionEngine.LAYOUT_GLYPHS[transitionInfo.toMode]}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-white/50 text-[11px]">
                {SpatialTransitionEngine.LAYOUT_TITLES[transitionInfo.fromMode]}
              </span>
              <span className="text-sky-400 font-bold">➔</span>
              <span className="text-sky-300 font-semibold">
                {SpatialTransitionEngine.LAYOUT_TITLES[transitionInfo.toMode]}
              </span>
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic 3D Focus Camera Flight Trajectory Notification Badge */}
      <AnimatePresence>
        {focusFlightInfo && (
          <motion.div
            key="focus-camera-flight-badge"
            id="photosphere-camera-flight-badge"
            initial={{ opacity: 0, y: -22, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.94 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="pointer-events-none absolute top-6 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full bg-[#060914]/90 border border-sky-400/40 backdrop-blur-xl shadow-[0_0_30px_rgba(56,189,248,0.3)] text-xs font-mono tracking-wide text-sky-200 flex items-center gap-3 select-none"
          >
            <span className="text-sky-400 font-bold text-sm">
              {focusFlightInfo.direction === 'prev' ? '⟵' : '⟶'}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-white/50 text-[11px] truncate max-w-[120px]">
                {focusFlightInfo.fromTitle}
              </span>
              <span className="text-cyan-400 font-bold">✈</span>
              <span className="text-sky-300 font-semibold truncate max-w-[140px]">
                {focusFlightInfo.toTitle}
              </span>
            </div>
            <div className="w-12 h-1.5 rounded-full bg-white/10 overflow-hidden ml-1 flex-shrink-0">
              <div
                className="h-full bg-gradient-to-r from-sky-400 to-emerald-400"
                style={{ width: `${Math.round(focusFlightInfo.progress * 100)}%` }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
        className="pointer-events-none absolute inset-0 z-10 w-full h-full block"
        style={{
          transform: 'translateZ(0)',
          willChange: 'transform',
          contain: 'strict',
          backfaceVisibility: 'hidden',
          pointerEvents: 'none',
          imageRendering: 'auto',
        }}
      />
    </div>
  );
};
