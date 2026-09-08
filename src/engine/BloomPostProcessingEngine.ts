/**
 * BloomPostProcessingEngine.ts
 * PhotoSphere 3D Spatial Memory Matrix
 *
 * Implements cinematic, atmospheric bloom post-processing for WebGL.
 * Adds a soft, luminous halo and ethereal energy dispersion to memory nodes,
 * highlighted cluster themes, laser beacons, and spatial navigation trails.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  DepthOfFieldPass,
  DepthOfFieldConfig,
  DEFAULT_DOF_CONFIG,
  sanitizeDepthOfFieldConfig,
} from './DepthOfFieldEngine';

export interface BloomConfig {
  enabled: boolean;
  strength: number; // Bloom glow intensity (default: 0.62)
  radius: number; // Gaussian dispersion blur radius (default: 0.44)
  threshold: number; // Luminance cutoff threshold (default: 0.68)
  exposure: number; // Tonemapping exposure (default: 1.10)
  ambientHaloOpacity: number; // Base ambient node rim glow (default: 0.24)
}

export const DEFAULT_BLOOM_CONFIG: BloomConfig = {
  enabled: true,
  strength: 0.62,
  radius: 0.44,
  threshold: 0.68,
  exposure: 1.10,
  ambientHaloOpacity: 0.24,
};

/**
 * Validates and clamps bloom parameters to safe rendering ranges.
 */
export function sanitizeBloomConfig(config?: Partial<BloomConfig>): BloomConfig {
  return {
    enabled: config?.enabled ?? DEFAULT_BLOOM_CONFIG.enabled,
    strength: Math.max(0, Math.min(3.0, config?.strength ?? DEFAULT_BLOOM_CONFIG.strength)),
    radius: Math.max(0, Math.min(2.0, config?.radius ?? DEFAULT_BLOOM_CONFIG.radius)),
    threshold: Math.max(0, Math.min(1.0, config?.threshold ?? DEFAULT_BLOOM_CONFIG.threshold)),
    exposure: Math.max(0.1, Math.min(3.0, config?.exposure ?? DEFAULT_BLOOM_CONFIG.exposure)),
    ambientHaloOpacity: Math.max(0, Math.min(1.0, config?.ambientHaloOpacity ?? DEFAULT_BLOOM_CONFIG.ambientHaloOpacity)),
  };
}

/**
 * Computes dynamic, motion-adapted bloom intensity and dispersion to preserve visual acuity
 * during rapid orbital panning and close-up focus inspection.
 */
export function computeAdaptiveBloom(params: {
  isFocusMode: boolean;
  isHighSpeedMotion: boolean;
  baseConfig?: Partial<BloomConfig>;
}): { effectiveStrength: number; effectiveRadius: number; threshold: number } {
  const cfg = sanitizeBloomConfig(params.baseConfig);

  let effectiveStrength = cfg.strength;
  let effectiveRadius = cfg.radius;

  // Reduce dispersion radius during fast orbits to prevent motion blurring/smearing
  if (params.isHighSpeedMotion) {
    effectiveRadius = Math.max(0.2, effectiveRadius * 0.85);
  }

  // Enhance focused card brilliance during close-up inspection
  if (params.isFocusMode) {
    effectiveStrength = Math.min(1.5, effectiveStrength * 1.18);
  }

  return {
    effectiveStrength,
    effectiveRadius,
    threshold: cfg.threshold,
  };
}

export interface BloomPipeline {
  composer: EffectComposer;
  renderPass: RenderPass;
  dofPass: DepthOfFieldPass;
  bloomPass: UnrealBloomPass;
  outputPass: OutputPass;
  setSize: (width: number, height: number) => void;
  updateConfig: (cfg: Partial<BloomConfig>) => void;
  updateDofConfig: (cfg: Partial<DepthOfFieldConfig>) => void;
  dispose: () => void;
}

/**
 * Constructs an optimized EffectComposer post-processing pipeline with DepthOfFieldPass, UnrealBloomPass, and OutputPass.
 */
export function createBloomPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
  initialConfig?: Partial<BloomConfig>,
  initialDofConfig?: Partial<DepthOfFieldConfig>
): BloomPipeline {
  const cfg = sanitizeBloomConfig(initialConfig);
  const dofCfg = sanitizeDepthOfFieldConfig(initialDofConfig);

  const composer = new EffectComposer(renderer);

  // 1. Base scene render pass
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // 2. Optical Bokeh Depth of Field pass (blurs background memory nodes while keeping focusedItem sharp)
  const dofPass = new DepthOfFieldPass(
    scene,
    camera as THREE.PerspectiveCamera,
    width,
    height,
    dofCfg
  );
  composer.addPass(dofPass);

  // 3. High-performance Unreal Bloom pass
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(Math.max(1, width), Math.max(1, height)),
    cfg.strength,
    cfg.radius,
    cfg.threshold
  );
  composer.addPass(bloomPass);

  // 4. Final color-managed Output pass (ACESFilmic tonemapping + sRGB encoding)
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  const setSize = (w: number, h: number) => {
    const validW = Math.max(1, w);
    const validH = Math.max(1, h);
    composer.setSize(validW, validH);
    dofPass.setSize(validW, validH);
    bloomPass.resolution.set(validW, validH);
  };

  const updateConfig = (update: Partial<BloomConfig>) => {
    const sanitized = sanitizeBloomConfig({
      strength: bloomPass.strength,
      radius: bloomPass.radius,
      threshold: bloomPass.threshold,
      ...update,
    });
    bloomPass.strength = sanitized.strength;
    bloomPass.radius = sanitized.radius;
    bloomPass.threshold = sanitized.threshold;
  };

  const updateDofConfig = (update: Partial<DepthOfFieldConfig>) => {
    const sanitized = sanitizeDepthOfFieldConfig(update);
    dofPass.enabled = sanitized.enabled;
    dofPass.uniforms['focus'].value = sanitized.focus;
    dofPass.uniforms['focalRange'].value = sanitized.focalRange;
    dofPass.uniforms['aperture'].value = sanitized.aperture;
    dofPass.uniforms['maxblur'].value = sanitized.maxblur;
  };

  const dispose = () => {
    try {
      renderPass.dispose();
    } catch {
      // Ignored for non-disposable stub passes
    }
    try {
      dofPass.dispose();
    } catch {
      // Ignored
    }
    try {
      bloomPass.dispose();
    } catch {
      // Ignored
    }
    try {
      outputPass.dispose();
    } catch {
      // Ignored
    }
    try {
      composer.dispose();
    } catch {
      // Ignored
    }
  };

  return {
    composer,
    renderPass,
    dofPass,
    bloomPass,
    outputPass,
    setSize,
    updateConfig,
    updateDofConfig,
    dispose,
  };
}
