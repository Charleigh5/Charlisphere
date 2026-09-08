/**
 * DepthOfFieldEngine.ts
 * Cinematic Depth-of-Field Post-Processing Engine for PhotoSphere Spatial Workbench.
 * Keeps the focused memory item in razor-sharp focus while gracefully blurring
 * background and foreground memory nodes using a high-fidelity 41-sample Poisson disc
 * optical bokeh shader with aspect-ratio correction and in-focus tolerance deadband.
 */

import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

export interface DepthOfFieldConfig {
  enabled: boolean;
  focus: number;       // Focal distance in camera view units (e.g. 320)
  focalRange: number;  // In-focus tolerance zone in world units (e.g. 28)
  aperture: number;    // Optical aperture factor controlling blur ramp slope (e.g. 0.00008)
  maxblur: number;     // Maximum circle-of-confusion blur radius in screen fraction (e.g. 0.018)
  blurRampSpeed: number; // Rack-focus interpolation factor (0.05 to 0.25)
}

export const DEFAULT_DOF_CONFIG: DepthOfFieldConfig = {
  enabled: true,
  focus: 320.0,
  focalRange: 28.0,
  aperture: 0.00008,
  maxblur: 0.018,
  blurRampSpeed: 0.14,
};

/**
 * Validates and normalizes depth-of-field configuration with safe physical boundaries.
 */
export function sanitizeDepthOfFieldConfig(
  config?: Partial<DepthOfFieldConfig>
): DepthOfFieldConfig {
  if (!config) return { ...DEFAULT_DOF_CONFIG };

  return {
    enabled: typeof config.enabled === 'boolean' ? config.enabled : DEFAULT_DOF_CONFIG.enabled,
    focus: typeof config.focus === 'number' && !isNaN(config.focus)
      ? Math.max(10, Math.min(8000, config.focus))
      : DEFAULT_DOF_CONFIG.focus,
    focalRange: typeof config.focalRange === 'number' && !isNaN(config.focalRange)
      ? Math.max(0, Math.min(200, config.focalRange))
      : DEFAULT_DOF_CONFIG.focalRange,
    aperture: typeof config.aperture === 'number' && !isNaN(config.aperture)
      ? Math.max(0.000005, Math.min(0.005, config.aperture))
      : DEFAULT_DOF_CONFIG.aperture,
    maxblur: typeof config.maxblur === 'number' && !isNaN(config.maxblur)
      ? Math.max(0.0, Math.min(0.05, config.maxblur))
      : DEFAULT_DOF_CONFIG.maxblur,
    blurRampSpeed: typeof config.blurRampSpeed === 'number' && !isNaN(config.blurRampSpeed)
      ? Math.max(0.02, Math.min(0.5, config.blurRampSpeed))
      : DEFAULT_DOF_CONFIG.blurRampSpeed,
  };
}

/**
 * Computes the exact perpendicular distance along the camera lens optical axis
 * from the camera lens plane to the 3D target position (viewZ).
 */
export function computeAutoFocusDistance(
  camera: THREE.Camera,
  targetPos: [number, number, number] | THREE.Vector3
): number {
  const v = Array.isArray(targetPos)
    ? new THREE.Vector3(targetPos[0], targetPos[1], targetPos[2])
    : targetPos.clone();

  v.applyMatrix4(camera.matrixWorldInverse);
  // In OpenGL camera space, objects in front of camera have negative Z.
  // The distance along the optical axis is -viewZ.
  const distance = Math.max(10, -v.z);
  return distance;
}

/**
 * Computes the optical Circle of Confusion (blur factor) for a given distance.
 * Returns 0 when within focalRange, and ramps smoothly up to maxblur for background nodes.
 */
export function computeCircleOfConfusion(
  nodeDistance: number,
  focalDistance: number,
  aperture: number = DEFAULT_DOF_CONFIG.aperture,
  focalRange: number = DEFAULT_DOF_CONFIG.focalRange,
  maxblur: number = DEFAULT_DOF_CONFIG.maxblur
): number {
  const diff = Math.abs(nodeDistance - focalDistance);
  if (diff <= focalRange) {
    return 0.0;
  }
  const effectiveDiff = diff - focalRange;
  const rawBlur = effectiveDiff * aperture;
  return Math.min(maxblur, Math.max(0.0, rawBlur));
}

/**
 * Adaptive Depth-of-Field state progression for rack-focus and smooth blur ramps.
 */
export function computeAdaptiveDepthOfField(params: {
  isFocusMode: boolean;
  targetDistance: number;
  currentFocus: number;
  currentMaxBlur: number;
  currentAperture: number;
  config?: Partial<DepthOfFieldConfig>;
}): {
  nextFocus: number;
  nextMaxBlur: number;
  nextAperture: number;
  isSharp: boolean;
} {
  const cfg = sanitizeDepthOfFieldConfig(params.config);

  if (!cfg.enabled) {
    return {
      nextFocus: params.currentFocus,
      nextMaxBlur: 0.0,
      nextAperture: 0.0,
      isSharp: true,
    };
  }

  if (params.isFocusMode) {
    const nextFocus = THREE.MathUtils.lerp(
      params.currentFocus,
      params.targetDistance,
      cfg.blurRampSpeed
    );
    const nextMaxBlur = THREE.MathUtils.lerp(
      params.currentMaxBlur,
      cfg.maxblur,
      cfg.blurRampSpeed
    );
    const nextAperture = THREE.MathUtils.lerp(
      params.currentAperture,
      cfg.aperture,
      cfg.blurRampSpeed
    );
    const isSharp = Math.abs(nextFocus - params.targetDistance) <= cfg.focalRange;

    return { nextFocus, nextMaxBlur, nextAperture, isSharp };
  } else {
    // Ambient Mode: smoothly ease blur down so entire matrix is legible
    const nextFocus = THREE.MathUtils.lerp(params.currentFocus, 1200, 0.05);
    const nextMaxBlur = THREE.MathUtils.lerp(params.currentMaxBlur, 0.0, 0.10);
    const nextAperture = THREE.MathUtils.lerp(params.currentAperture, 0.0, 0.10);

    return { nextFocus, nextMaxBlur, nextAperture, isSharp: true };
  }
}

/**
 * 41-sample Poisson disc optical bokeh shader with aspect-ratio correction
 * and in-focus deadband.
 */
export const OpticalBokehShader = {
  defines: {
    DEPTH_PACKING: 1,
    PERSPECTIVE_CAMERA: 1,
  },
  uniforms: {
    tColor: { value: null },
    tDepth: { value: null },
    focus: { value: 320.0 },
    focalRange: { value: 28.0 },
    aspect: { value: 1.0 },
    aperture: { value: 0.00008 },
    maxblur: { value: 0.018 },
    nearClip: { value: 10.0 },
    farClip: { value: 8000.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */ `
    #include <common>
    #include <packing>

    varying vec2 vUv;
    uniform sampler2D tColor;
    uniform sampler2D tDepth;
    uniform float maxblur;
    uniform float aperture;
    uniform float nearClip;
    uniform float farClip;
    uniform float focus;
    uniform float focalRange;
    uniform float aspect;

    float getDepth( const in vec2 screenPosition ) {
      return unpackRGBAToDepth( texture2D( tDepth, screenPosition ) );
    }

    float getViewZ( const in float depth ) {
      return perspectiveDepthToViewZ( depth, nearClip, farClip );
    }

    void main() {
      vec2 aspectcorrect = vec2( 1.0, aspect );
      float depthVal = getDepth( vUv );
      float viewZ = getViewZ( depthVal );

      // diff = focus + viewZ (in camera space viewZ is negative)
      float diff = focus + viewZ;
      float absDiff = abs( diff );

      // In-focus tolerance zone: within focalRange, blur factor is mathematically zero
      float effectiveDiff = absDiff <= focalRange ? 0.0 : ( absDiff - focalRange ) * sign( diff );
      vec2 dofblur = vec2( clamp( effectiveDiff * aperture, -maxblur, maxblur ) );

      // Early out if in sharp focus (zero blur calculation)
      if ( length( dofblur ) < 0.00005 ) {
        gl_FragColor = texture2D( tColor, vUv );
        return;
      }

      vec2 dofblur9 = dofblur * 0.90;
      vec2 dofblur7 = dofblur * 0.70;
      vec2 dofblur4 = dofblur * 0.40;

      // 41-sample Poisson disc kernel for creamy, cinematic bokeh
      vec4 col = texture2D( tColor, vUv );

      // Ring 1 (16 samples)
      col += texture2D( tColor, vUv + ( vec2(  0.0,   0.40 ) * aspectcorrect ) * dofblur );
      col += texture2D( tColor, vUv + ( vec2(  0.15,  0.37 ) * aspectcorrect ) * dofblur );
      col += texture2D( tColor, vUv + ( vec2(  0.29,  0.29 ) * aspectcorrect ) * dofblur );
      col += texture2D( tColor, vUv + ( vec2( -0.37,  0.15 ) * aspectcorrect ) * dofblur );
      col += texture2D( tColor, vUv + ( vec2(  0.40,  0.0  ) * aspectcorrect ) * dofblur );
      col += texture2D( tColor, vUv + ( vec2(  0.37, -0.15 ) * aspectcorrect ) * dofblur );
      col += texture2D( tColor, vUv + ( vec2(  0.29, -0.29 ) * aspectcorrect ) * dofblur );
      col += texture2D( tColor, vUv + ( vec2( -0.15, -0.37 ) * aspectcorrect ) * dofblur );
      col += texture2D( tColor, vUv + ( vec2(  0.0,  -0.40 ) * aspectcorrect ) * dofblur );
      col += texture2D( tColor, vUv + ( vec2( -0.15,  0.37 ) * aspectcorrect ) * dofblur );
      col += texture2D( tColor, vUv + ( vec2( -0.29,  0.29 ) * aspectcorrect ) * dofblur );
      col += texture2D( tColor, vUv + ( vec2(  0.37,  0.15 ) * aspectcorrect ) * dofblur );
      col += texture2D( tColor, vUv + ( vec2( -0.40,  0.0  ) * aspectcorrect ) * dofblur );
      col += texture2D( tColor, vUv + ( vec2( -0.37, -0.15 ) * aspectcorrect ) * dofblur );
      col += texture2D( tColor, vUv + ( vec2( -0.29, -0.29 ) * aspectcorrect ) * dofblur );
      col += texture2D( tColor, vUv + ( vec2(  0.15, -0.37 ) * aspectcorrect ) * dofblur );

      // Ring 2 (8 samples)
      col += texture2D( tColor, vUv + ( vec2(  0.15,  0.37 ) * aspectcorrect ) * dofblur9 );
      col += texture2D( tColor, vUv + ( vec2( -0.37,  0.15 ) * aspectcorrect ) * dofblur9 );
      col += texture2D( tColor, vUv + ( vec2(  0.37, -0.15 ) * aspectcorrect ) * dofblur9 );
      col += texture2D( tColor, vUv + ( vec2( -0.15, -0.37 ) * aspectcorrect ) * dofblur9 );
      col += texture2D( tColor, vUv + ( vec2( -0.15,  0.37 ) * aspectcorrect ) * dofblur9 );
      col += texture2D( tColor, vUv + ( vec2(  0.37,  0.15 ) * aspectcorrect ) * dofblur9 );
      col += texture2D( tColor, vUv + ( vec2( -0.37, -0.15 ) * aspectcorrect ) * dofblur9 );
      col += texture2D( tColor, vUv + ( vec2(  0.15, -0.37 ) * aspectcorrect ) * dofblur9 );

      // Ring 3 (8 samples)
      col += texture2D( tColor, vUv + ( vec2(  0.29,  0.29 ) * aspectcorrect ) * dofblur7 );
      col += texture2D( tColor, vUv + ( vec2(  0.40,  0.0  ) * aspectcorrect ) * dofblur7 );
      col += texture2D( tColor, vUv + ( vec2(  0.29, -0.29 ) * aspectcorrect ) * dofblur7 );
      col += texture2D( tColor, vUv + ( vec2(  0.0,  -0.40 ) * aspectcorrect ) * dofblur7 );
      col += texture2D( tColor, vUv + ( vec2( -0.29,  0.29 ) * aspectcorrect ) * dofblur7 );
      col += texture2D( tColor, vUv + ( vec2( -0.40,  0.0  ) * aspectcorrect ) * dofblur7 );
      col += texture2D( tColor, vUv + ( vec2( -0.29, -0.29 ) * aspectcorrect ) * dofblur7 );
      col += texture2D( tColor, vUv + ( vec2(  0.0,   0.40 ) * aspectcorrect ) * dofblur7 );

      // Ring 4 (8 samples)
      col += texture2D( tColor, vUv + ( vec2(  0.29,  0.29 ) * aspectcorrect ) * dofblur4 );
      col += texture2D( tColor, vUv + ( vec2(  0.40,  0.0  ) * aspectcorrect ) * dofblur4 );
      col += texture2D( tColor, vUv + ( vec2(  0.29, -0.29 ) * aspectcorrect ) * dofblur4 );
      col += texture2D( tColor, vUv + ( vec2(  0.0,  -0.40 ) * aspectcorrect ) * dofblur4 );
      col += texture2D( tColor, vUv + ( vec2( -0.29,  0.29 ) * aspectcorrect ) * dofblur4 );
      col += texture2D( tColor, vUv + ( vec2( -0.40,  0.0  ) * aspectcorrect ) * dofblur4 );
      col += texture2D( tColor, vUv + ( vec2( -0.29, -0.29 ) * aspectcorrect ) * dofblur4 );
      col += texture2D( tColor, vUv + ( vec2(  0.0,   0.40 ) * aspectcorrect ) * dofblur4 );

      gl_FragColor = col / 41.0;
    }
  `,
};

/**
 * Simple passthrough copy shader for bypassing blur when disabled
 */
const PassThroughCopyShader = {
  uniforms: {
    tDiffuse: { value: null },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    void main() {
      gl_FragColor = texture2D( tDiffuse, vUv );
    }
  `,
};

export interface DepthPassOverlayTargets {
  starField?: THREE.Object3D | null;
  labelsGroup?: THREE.Object3D | null;
  trailGroup?: THREE.Object3D | null;
  haloGroup?: THREE.Object3D | null;
}

/**
 * DepthOfFieldPass for Three.js EffectComposer.
 * Isolates scene memory node depth into a dedicated half-float depth buffer,
 * executes Poisson disc optical bokeh blur on background and foreground nodes,
 * and maintains razor sharpness on the focused memory node.
 */
export class DepthOfFieldPass extends Pass {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public materialBokeh: THREE.ShaderMaterial;
  public uniforms: { [uniform: string]: THREE.IUniform };

  private _renderTargetDepth: THREE.WebGLRenderTarget;
  private _materialDepth: THREE.MeshDepthMaterial;
  private _fsQuad: FullScreenQuad;
  private _copyMaterial: THREE.ShaderMaterial;
  private _copyQuad: FullScreenQuad;
  private _oldClearColor: THREE.Color;
  private _overlayTargets: DepthPassOverlayTargets = {};

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
    initialConfig?: Partial<DepthOfFieldConfig>
  ) {
    super();

    const cfg = sanitizeDepthOfFieldConfig(initialConfig);

    this.scene = scene;
    this.camera = camera;
    this.enabled = cfg.enabled;
    this.needsSwap = true;

    // Dedicated depth render target
    this._renderTargetDepth = new THREE.WebGLRenderTarget(
      Math.floor(width * 0.5),
      Math.floor(height * 0.5),
      {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        type: THREE.HalfFloatType,
      }
    );
    this._renderTargetDepth.texture.name = 'DepthOfFieldPass.depth';

    // Depth material packing
    this._materialDepth = new THREE.MeshDepthMaterial();
    this._materialDepth.depthPacking = THREE.RGBADepthPacking;
    this._materialDepth.blending = THREE.NoBlending;

    // Bokeh composite material
    this.materialBokeh = new THREE.ShaderMaterial({
      defines: Object.assign({}, OpticalBokehShader.defines),
      uniforms: THREE.UniformsUtils.clone(OpticalBokehShader.uniforms),
      vertexShader: OpticalBokehShader.vertexShader,
      fragmentShader: OpticalBokehShader.fragmentShader,
    });

    this.uniforms = this.materialBokeh.uniforms;
    this.uniforms['tDepth'].value = this._renderTargetDepth.texture;
    this.uniforms['focus'].value = cfg.focus;
    this.uniforms['focalRange'].value = cfg.focalRange;
    this.uniforms['aspect'].value = width / Math.max(1, height);
    this.uniforms['aperture'].value = cfg.aperture;
    this.uniforms['maxblur'].value = cfg.maxblur;
    this.uniforms['nearClip'].value = camera.near;
    this.uniforms['farClip'].value = camera.far;

    this._fsQuad = new FullScreenQuad(this.materialBokeh);

    // Fallback passthrough copy quad
    this._copyMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(PassThroughCopyShader.uniforms),
      vertexShader: PassThroughCopyShader.vertexShader,
      fragmentShader: PassThroughCopyShader.fragmentShader,
    });
    this._copyQuad = new FullScreenQuad(this._copyMaterial);

    this._oldClearColor = new THREE.Color();
  }

  /**
   * Registers overlay groups that should not write into the depth buffer during the depth pre-pass.
   */
  public setOverlayTargets(targets: DepthPassOverlayTargets) {
    this._overlayTargets = targets;
  }

  public setSize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.uniforms['aspect'].value = w / h;
    this._renderTargetDepth.setSize(w, h);
  }

  public render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget
  ): void {
    const maxblurVal = this.uniforms['maxblur'].value;

    // If DoF is disabled or blur radius is zero, simply pass through input buffer
    if (!this.enabled || maxblurVal <= 0.00005) {
      this._copyMaterial.uniforms['tDiffuse'].value = readBuffer.texture;
      if (this.renderToScreen) {
        renderer.setRenderTarget(null);
        this._copyQuad.render(renderer);
      } else {
        renderer.setRenderTarget(writeBuffer);
        this._copyQuad.render(renderer);
      }
      return;
    }

    // Step 1: Temporarily hide non-card overlay elements so depth buffer isolates 3D memory nodes
    const starsVis = this._overlayTargets.starField?.visible;
    const labelsVis = this._overlayTargets.labelsGroup?.visible;
    const trailsVis = this._overlayTargets.trailGroup?.visible;
    const halosVis = this._overlayTargets.haloGroup?.visible;

    if (this._overlayTargets.starField) this._overlayTargets.starField.visible = false;
    if (this._overlayTargets.labelsGroup) this._overlayTargets.labelsGroup.visible = false;
    if (this._overlayTargets.trailGroup) this._overlayTargets.trailGroup.visible = false;
    if (this._overlayTargets.haloGroup) this._overlayTargets.haloGroup.visible = false;

    // Step 2: Render depth into dedicated depth render target
    this.scene.overrideMaterial = this._materialDepth;
    renderer.getClearColor(this._oldClearColor);
    const oldClearAlpha = renderer.getClearAlpha();
    const oldAutoClear = renderer.autoClear;

    renderer.autoClear = false;
    renderer.setClearColor(0xffffff, 1.0); // 0xffffff unpacks to far plane depth
    renderer.setClearAlpha(1.0);
    renderer.setRenderTarget(this._renderTargetDepth);
    renderer.clear();
    renderer.render(this.scene, this.camera);

    // Step 3: Restore overlay elements and scene state
    this.scene.overrideMaterial = null;
    renderer.setClearColor(this._oldClearColor);
    renderer.setClearAlpha(oldClearAlpha);
    renderer.autoClear = oldAutoClear;

    if (this._overlayTargets.starField && starsVis !== undefined) {
      this._overlayTargets.starField.visible = starsVis;
    }
    if (this._overlayTargets.labelsGroup && labelsVis !== undefined) {
      this._overlayTargets.labelsGroup.visible = labelsVis;
    }
    if (this._overlayTargets.trailGroup && trailsVis !== undefined) {
      this._overlayTargets.trailGroup.visible = trailsVis;
    }
    if (this._overlayTargets.haloGroup && halosVis !== undefined) {
      this._overlayTargets.haloGroup.visible = halosVis;
    }

    // Step 4: Render optical bokeh composite using rendered color and depth
    this.uniforms['tColor'].value = readBuffer.texture;
    this.uniforms['nearClip'].value = this.camera.near;
    this.uniforms['farClip'].value = this.camera.far;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this._fsQuad.render(renderer);
    } else {
      renderer.setRenderTarget(writeBuffer);
      renderer.clear();
      this._fsQuad.render(renderer);
    }
  }

  public dispose(): void {
    this._renderTargetDepth.dispose();
    this._materialDepth.dispose();
    this.materialBokeh.dispose();
    this._copyMaterial.dispose();
    this._fsQuad.dispose();
    this._copyQuad.dispose();
  }
}

/**
 * Creates and initializes a DepthOfFieldPass for inclusion in the EffectComposer chain.
 */
export function createDepthOfFieldPass(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  config?: Partial<DepthOfFieldConfig>
): DepthOfFieldPass {
  return new DepthOfFieldPass(scene, camera, width, height, config);
}
