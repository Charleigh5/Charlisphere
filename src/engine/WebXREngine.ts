/**
 * WebXREngine.ts
 * Manages WebXR Device API integration, VR session lifecycle,
 * immersive 3D spatial viewing, and XR controller interaction.
 */

import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { PhotoMemoryItem } from '../types';
import { VRControllerMenu, VRMenuCallbacks, VRMenuState } from './VRControllerMenu';

export interface WebXRSupportStatus {
  isSupported: boolean;
  hasHardware: boolean;
  message: string;
}

export interface VRGestureDeltas {
  dYaw: number;
  dPitch: number;
  dScale: number;
}

export class WebXREngine {
  private static activeSession: XRSession | null = null;
  private static controller1: THREE.XRTargetRaySpace | null = null;
  private static controller2: THREE.XRTargetRaySpace | null = null;
  private static controllerGrip1: THREE.XRGripSpace | null = null;
  private static controllerGrip2: THREE.XRGripSpace | null = null;
  private static controllerFactory = new XRControllerModelFactory();
  private static laserLine1: THREE.Line | null = null;
  private static laserLine2: THREE.Line | null = null;
  private static raycaster = new THREE.Raycaster();
  private static tempMatrix = new THREE.Matrix4();
  private static vrMenu: VRControllerMenu | null = null;

  // Gesture Sensitivity & Motion State
  private static gestureSensitivity: number = 1.0;
  private static isSqueezing1: boolean = false;
  private static isSqueezing2: boolean = false;
  private static lastGripPos1: THREE.Vector3 | null = null;
  private static lastGripPos2: THREE.Vector3 | null = null;
  private static lastTwoHandDistance: number | null = null;

  /**
   * Set the controller gesture sensitivity multiplier (e.g. 0.2x to 2.5x)
   */
  public static setGestureSensitivity(sensitivity: number): void {
    this.gestureSensitivity = Math.max(0.2, Math.min(3.0, sensitivity));
  }

  /**
   * Get the active controller gesture sensitivity multiplier
   */
  public static getGestureSensitivity(): number {
    return this.gestureSensitivity;
  }

  /**
   * Check whether WebXR and 'immersive-vr' session mode is supported on current client
   */
  public static async checkVRSupport(): Promise<WebXRSupportStatus> {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return {
        isSupported: false,
        hasHardware: false,
        message: 'WebXR is not available in non-browser environment.',
      };
    }

    if (!('xr' in navigator) || !navigator.xr) {
      return {
        isSupported: false,
        hasHardware: false,
        message: 'WebXR Device API is not supported by your current browser. Try Chrome, Edge, or a VR browser (Oculus Browser, Wolvic).',
      };
    }

    try {
      const isSupported = await navigator.xr.isSessionSupported('immersive-vr');
      if (isSupported) {
        return {
          isSupported: true,
          hasHardware: true,
          message: 'Immersive VR headset / WebXR runtime detected and ready.',
        };
      } else {
        return {
          isSupported: false,
          hasHardware: false,
          message: 'WebXR API is available, but no active VR display or headset was detected.',
        };
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        isSupported: false,
        hasHardware: false,
        message: `WebXR check error: ${errorMsg}`,
      };
    }
  }

  /**
   * Request an immersive-vr session and attach it to Three.js WebGLRenderer
   */
  public static async startVRSession(
    renderer: THREE.WebGLRenderer,
    onSessionEnd?: () => void,
    performanceMode: boolean = true
  ): Promise<XRSession> {
    if (!navigator.xr) {
      throw new Error('WebXR Device API (navigator.xr) is not available.');
    }

    const sessionInit: XRSessionInit = {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'],
    };

    const session = await navigator.xr.requestSession('immersive-vr', sessionInit);
    this.activeSession = session;

    renderer.xr.enabled = true;
    
    // Apply Performance Mode settings to WebXR WebGL state
    this.applyPerformanceProfile(renderer, performanceMode);

    await renderer.xr.setSession(session);

    session.addEventListener('end', () => {
      this.activeSession = null;
      if (onSessionEnd) {
        onSessionEnd();
      }
    });

    return session;
  }

  /**
   * Apply VR hardware performance tuning (foveation, scale factor)
   */
  public static applyPerformanceProfile(
    renderer: THREE.WebGLRenderer,
    performanceMode: boolean
  ): void {
    try {
      if ('setFoveation' in renderer.xr && typeof (renderer.xr as any).setFoveation === 'function') {
        // 1.0 = Max foveation for 90FPS+ on mobile chipsets like Snapdragon XR2
        (renderer.xr as any).setFoveation(performanceMode ? 1.0 : 0.0);
      }
      if (
        'setFramebufferScaleFactor' in renderer.xr &&
        typeof (renderer.xr as any).setFramebufferScaleFactor === 'function'
      ) {
        (renderer.xr as any).setFramebufferScaleFactor(performanceMode ? 0.9 : 1.0);
      }
    } catch {
      // Graceful fallback if device doesn't expose proprietary WebXR foveation extension
    }
  }

  /**
   * End currently active WebXR session
   */
  public static async endVRSession(): Promise<void> {
    if (this.activeSession) {
      await this.activeSession.end();
      this.activeSession = null;
    }
  }

  /**
   * Returns whether a WebXR VR session is actively presenting
   */
  public static isPresenting(): boolean {
    return this.activeSession !== null;
  }

  /**
   * Build laser pointer line geometry for VR controller raycasting
   */
  public static createLaserPointer(): THREE.Line {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -5),
    ]);
    const material = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.75,
      linewidth: 2,
    });
    return new THREE.Line(geometry, material);
  }

  /**
   * Setup VR Controllers and attach to Three.js Scene
   */
  public static setupControllers(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    onSelectCard?: (index: number) => void
  ): {
    controller1: THREE.XRTargetRaySpace;
    controller2: THREE.XRTargetRaySpace;
  } {
    // Controller 1 (Right hand default)
    const controller1 = renderer.xr.getController(0);
    this.laserLine1 = this.createLaserPointer();
    controller1.add(this.laserLine1);
    scene.add(controller1);
    this.controller1 = controller1;

    const controllerGrip1 = renderer.xr.getControllerGrip(0);
    controllerGrip1.add(this.controllerFactory.createControllerModel(controllerGrip1));
    scene.add(controllerGrip1);
    this.controllerGrip1 = controllerGrip1;

    // Controller 2 (Left hand default)
    const controller2 = renderer.xr.getController(1);
    this.laserLine2 = this.createLaserPointer();
    controller2.add(this.laserLine2);
    scene.add(controller2);
    this.controller2 = controller2;

    const controllerGrip2 = renderer.xr.getControllerGrip(1);
    controllerGrip2.add(this.controllerFactory.createControllerModel(controllerGrip2));
    scene.add(controllerGrip2);
    this.controllerGrip2 = controllerGrip2;

    // Trigger select listener for controller 1
    controller1.addEventListener('select', () => {
      if (this.controller1) {
        const ray = this.getControllerRaycaster(this.controller1);
        if (this.vrMenu && this.vrMenu.handleSelect(ray)) {
          return;
        }
        if (onSelectCard) {
          const hitIndex = this.getControllerIntersectIndex(this.controller1, scene);
          if (hitIndex !== null) {
            onSelectCard(hitIndex);
          }
        }
      }
    });

    // Trigger select listener for controller 2
    controller2.addEventListener('select', () => {
      if (this.controller2) {
        const ray = this.getControllerRaycaster(this.controller2);
        if (this.vrMenu && this.vrMenu.handleSelect(ray)) {
          return;
        }
        if (onSelectCard) {
          const hitIndex = this.getControllerIntersectIndex(this.controller2, scene);
          if (hitIndex !== null) {
            onSelectCard(hitIndex);
          }
        }
      }
    });

    // Squeeze / Grip listeners for controller 1
    controller1.addEventListener('squeezestart', () => {
      this.isSqueezing1 = true;
      this.lastGripPos1 = this.controller1 ? this.controller1.position.clone() : null;
    });
    controller1.addEventListener('squeezeend', () => {
      this.isSqueezing1 = false;
      this.lastGripPos1 = null;
      this.lastTwoHandDistance = null;
    });

    // Squeeze / Grip listeners for controller 2
    controller2.addEventListener('squeezestart', () => {
      this.isSqueezing2 = true;
      this.lastGripPos2 = this.controller2 ? this.controller2.position.clone() : null;
    });
    controller2.addEventListener('squeezeend', () => {
      this.isSqueezing2 = false;
      this.lastGripPos2 = null;
      this.lastTwoHandDistance = null;
    });

    return { controller1, controller2 };
  }

  /**
   * Pure calculation of thumbstick orbit and scale deltas based on axes and sensitivity
   */
  public static computeVRThumbstickMotion(
    axes: readonly number[],
    handedness: string,
    sensitivity: number,
    deltaSec: number
  ): VRGestureDeltas {
    const deadzone = 0.12;
    let dYaw = 0;
    let dPitch = 0;
    let dScale = 0;

    const stickX = axes.length >= 4 ? axes[2] : axes[0] || 0;
    const stickY = axes.length >= 4 ? axes[3] : axes[1] || 0;

    if (Math.abs(stickX) > deadzone) {
      dYaw = stickX * sensitivity * deltaSec * 1.8;
    }

    if (Math.abs(stickY) > deadzone) {
      if (handedness === 'left') {
        dScale = -stickY * sensitivity * deltaSec * 0.9;
      } else {
        dPitch = stickY * sensitivity * deltaSec * 1.4;
      }
    }

    return { dYaw, dPitch, dScale };
  }

  /**
   * Update controller gestures (thumbstick orbit & grip drag/pinch scale) during active VR frame
   */
  public static updateControllerGestures(
    deltaSec: number,
    onRotateDelta: (dYaw: number, dPitch: number) => void,
    onScaleDelta: (dScale: number) => void
  ): void {
    if (!this.activeSession) return;

    // 1. Process Gamepad Thumbsticks for Yaw/Pitch Orbit & Scale
    const inputSources = this.activeSession.inputSources;
    if (inputSources) {
      for (const source of inputSources) {
        const gp = source.gamepad;
        if (gp && gp.axes && gp.axes.length >= 2) {
          const { dYaw, dPitch, dScale } = this.computeVRThumbstickMotion(
            gp.axes,
            source.handedness,
            this.gestureSensitivity,
            deltaSec
          );
          if (dYaw !== 0 || dPitch !== 0) {
            onRotateDelta(dYaw, dPitch);
          }
          if (dScale !== 0) {
            onScaleDelta(dScale);
          }
        }
      }
    }

    // 2. Process 6DoF Hand Grip Dragging & Dual-Hand Pinch Scaling
    if (this.controller1 && this.controller2 && this.isSqueezing1 && this.isSqueezing2) {
      // Dual-hand squeeze: 3D spatial pinch to scale
      const curDist = this.controller1.position.distanceTo(this.controller2.position);
      if (this.lastTwoHandDistance !== null && this.lastTwoHandDistance > 0.05) {
        const distDelta = curDist - this.lastTwoHandDistance;
        const scaleDelta = distDelta * 1.6 * this.gestureSensitivity;
        onScaleDelta(scaleDelta);
      }
      this.lastTwoHandDistance = curDist;
    } else {
      this.lastTwoHandDistance = null;

      // Single-hand squeeze rotation & scaling drag (Controller 1)
      if (this.controller1 && this.isSqueezing1) {
        const curPos = this.controller1.position;
        if (this.lastGripPos1) {
          const dx = curPos.x - this.lastGripPos1.x;
          const dy = curPos.y - this.lastGripPos1.y;
          const dz = curPos.z - this.lastGripPos1.z;
          const dYaw = dx * 2.5 * this.gestureSensitivity;
          const dPitch = dy * 2.2 * this.gestureSensitivity;
          const dScale = -dz * 1.4 * this.gestureSensitivity;
          onRotateDelta(dYaw, dPitch);
          if (Math.abs(dScale) > 0.001) {
            onScaleDelta(dScale);
          }
        }
        this.lastGripPos1 = curPos.clone();
      }

      // Single-hand squeeze rotation & scaling drag (Controller 2)
      if (this.controller2 && this.isSqueezing2) {
        const curPos = this.controller2.position;
        if (this.lastGripPos2) {
          const dx = curPos.x - this.lastGripPos2.x;
          const dy = curPos.y - this.lastGripPos2.y;
          const dz = curPos.z - this.lastGripPos2.z;
          const dYaw = dx * 2.5 * this.gestureSensitivity;
          const dPitch = dy * 2.2 * this.gestureSensitivity;
          const dScale = -dz * 1.4 * this.gestureSensitivity;
          onRotateDelta(dYaw, dPitch);
          if (Math.abs(dScale) > 0.001) {
            onScaleDelta(dScale);
          }
        }
        this.lastGripPos2 = curPos.clone();
      }
    }
  }

  /**
   * Update controller raycaster matrix from a controller's world transformation
   */
  public static getControllerRaycaster(controller: THREE.XRTargetRaySpace): THREE.Raycaster {
    this.tempMatrix.identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);
    return this.raycaster;
  }

  /**
   * Attach or initialize the VR Controller Wrist / Spatial Overlay Menu
   */
  public static attachVRMenu(
    callbacks: VRMenuCallbacks,
    initialState?: Partial<VRMenuState>
  ): VRControllerMenu {
    if (this.vrMenu) {
      this.vrMenu.dispose();
      this.vrMenu = null;
    }

    const menu = new VRControllerMenu(callbacks, initialState);
    this.vrMenu = menu;

    // Attach to controller 2 (left hand grip / ray) if available, otherwise controller 1
    if (this.controllerGrip2) {
      menu.attachToController(this.controllerGrip2);
    } else if (this.controller2) {
      menu.attachToController(this.controller2);
    } else if (this.controllerGrip1) {
      menu.attachToController(this.controllerGrip1);
    } else if (this.controller1) {
      menu.attachToController(this.controller1);
    }

    return menu;
  }

  /**
   * Get active VR Controller Menu instance
   */
  public static getVRMenu(): VRControllerMenu | null {
    return this.vrMenu;
  }

  /**
   * Update active VR Controller Menu state (layout, search query, cluster labels, counts)
   */
  public static updateVRMenuState(state: Partial<VRMenuState>): void {
    if (this.vrMenu) {
      this.vrMenu.updateState(state);
    }
  }

  /**
   * Per-frame hover state update for VR Controller Menu
   */
  public static updateVRMenuHover(): void {
    if (this.vrMenu && this.controller1) {
      const ray = this.getControllerRaycaster(this.controller1);
      this.vrMenu.checkIntersection(ray);
    }
  }

  /**
   * Raycast from a VR controller into active photo card meshes
   */
  public static getControllerIntersectIndex(
    controller: THREE.XRTargetRaySpace,
    scene: THREE.Scene
  ): number | null {
    this.getControllerRaycaster(controller);

    const interactiveMeshes: THREE.Mesh[] = [];
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.userData && typeof obj.userData.index === 'number') {
        interactiveMeshes.push(obj);
      }
    });

    const intersects = this.raycaster.intersectObjects(interactiveMeshes, false);
    if (intersects.length > 0) {
      return intersects[0].object.userData.index;
    }
    return null;
  }

  /**
   * Clean up controller resources
   */
  public static disposeControllers(scene: THREE.Scene): void {
    if (this.vrMenu) {
      this.vrMenu.dispose();
      this.vrMenu = null;
    }
    if (this.controller1) {
      scene.remove(this.controller1);
      this.controller1 = null;
    }
    if (this.controller2) {
      scene.remove(this.controller2);
      this.controller2 = null;
    }
    if (this.controllerGrip1) {
      scene.remove(this.controllerGrip1);
      this.controllerGrip1 = null;
    }
    if (this.controllerGrip2) {
      scene.remove(this.controllerGrip2);
      this.controllerGrip2 = null;
    }
    if (this.laserLine1) {
      this.laserLine1.geometry.dispose();
      (this.laserLine1.material as THREE.Material).dispose();
      this.laserLine1 = null;
    }
    if (this.laserLine2) {
      this.laserLine2.geometry.dispose();
      (this.laserLine2.material as THREE.Material).dispose();
      this.laserLine2 = null;
    }
  }
}
