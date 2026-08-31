/**
 * VRControllerMenu.ts
 * 3D Interactive Controller Wrist / Spatial Overlay Menu for WebXR VR Immersion.
 * Enables switching layout modes, instant vector searches, toggling cluster labels,
 * recentering viewpoint, and session controls directly in VR.
 */

import * as THREE from 'three';
import { Layout3DMode } from '../types';
import { AudioSynthesizer } from './AudioSynthesizer';

export interface VRMenuCallbacks {
  onLayoutChange: (mode: Layout3DMode) => void;
  onSearchChange: (query: string) => void;
  onToggleLabels: () => void;
  onResetView: () => void;
  onExitVR: () => void;
}

export interface VRMenuState {
  activeLayout: Layout3DMode;
  searchQuery: string;
  showLabels: boolean;
  photoCount: number;
  isMinimized: boolean;
}

interface MenuButtonDef {
  id: string;
  label: string;
  icon?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'layout' | 'search' | 'action' | 'toggle';
  value?: string;
}

export class VRControllerMenu {
  private group: THREE.Group;
  private panelMesh: THREE.Mesh | null = null;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: THREE.CanvasTexture;
  private callbacks: VRMenuCallbacks;
  private state: VRMenuState;
  private hoveredButtonId: string | null = null;
  private buttons: MenuButtonDef[] = [];
  private attachedController: THREE.Object3D | null = null;

  private static CANVAS_WIDTH = 1024;
  private static CANVAS_HEIGHT = 640;

  constructor(callbacks: VRMenuCallbacks, initialState?: Partial<VRMenuState>) {
    this.callbacks = callbacks;
    this.state = {
      activeLayout: initialState?.activeLayout || 'FIBONACCI_SPHERE',
      searchQuery: initialState?.searchQuery || '',
      showLabels: initialState?.showLabels !== undefined ? initialState.showLabels : true,
      photoCount: initialState?.photoCount || 120,
      isMinimized: initialState?.isMinimized || false,
    };

    this.group = new THREE.Group();
    this.group.name = 'VR_CONTROLLER_MENU_GROUP';

    // Initialize Offscreen High-DPI Canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = VRControllerMenu.CANVAS_WIDTH;
    this.canvas.height = VRControllerMenu.CANVAS_HEIGHT;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create 2D canvas context for VRControllerMenu.');
    }
    this.ctx = ctx;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    this.initButtons();
    this.createPanelMesh();
    this.renderCanvas();
  }

  /**
   * Defines interactive bounding boxes on the 1024x640 canvas
   */
  private initButtons(): void {
    if (this.state.isMinimized) {
      this.buttons = [
        {
          id: 'btn_expand',
          label: '⚡ OPEN MATRIX MENU',
          x: 40,
          y: 40,
          width: 944,
          height: 560,
          type: 'toggle',
        },
      ];
      return;
    }

    this.buttons = [
      // Top Right: Minimize Toggle
      {
        id: 'btn_minimize',
        label: '— MIN',
        x: 880,
        y: 28,
        width: 104,
        height: 48,
        type: 'toggle',
      },

      // Section 1: Layout Modes (Row 1: Y = 145)
      {
        id: 'layout_sphere',
        label: 'Sphere',
        x: 40,
        y: 145,
        width: 220,
        height: 64,
        type: 'layout',
        value: 'FIBONACCI_SPHERE',
      },
      {
        id: 'layout_helix',
        label: 'Helix',
        x: 280,
        y: 145,
        width: 220,
        height: 64,
        type: 'layout',
        value: 'DNA_HELIX',
      },
      {
        id: 'layout_galaxy',
        label: 'Galaxy',
        x: 520,
        y: 145,
        width: 220,
        height: 64,
        type: 'layout',
        value: 'GALAXY_CONSTELLATION',
      },
      {
        id: 'layout_cubic',
        label: 'Matrix',
        x: 760,
        y: 145,
        width: 224,
        height: 64,
        type: 'layout',
        value: 'CUBIC_MATRIX',
      },

      // Section 2: Search Presets & Categorical Filters (Row 1: Y = 280, Row 2: Y = 360)
      {
        id: 'search_all',
        label: 'All Memories',
        x: 40,
        y: 280,
        width: 172,
        height: 58,
        type: 'search',
        value: '',
      },
      {
        id: 'search_favorites',
        label: 'Favorites',
        x: 230,
        y: 280,
        width: 172,
        height: 58,
        type: 'search',
        value: 'favorite joyful smiles',
      },
      {
        id: 'search_outdoor',
        label: 'Outdoors',
        x: 420,
        y: 280,
        width: 172,
        height: 58,
        type: 'search',
        value: 'beach sunset outdoor nature park',
      },
      {
        id: 'search_family',
        label: 'Family',
        x: 610,
        y: 280,
        width: 172,
        height: 58,
        type: 'search',
        value: 'birthday milestone family kids',
      },
      {
        id: 'search_travel',
        label: 'Travel',
        x: 800,
        y: 280,
        width: 184,
        height: 58,
        type: 'search',
        value: 'travel vacation scenic roadtrip',
      },

      // Search Presets Row 2
      {
        id: 'search_celebration',
        label: 'Celebration',
        x: 40,
        y: 355,
        width: 220,
        height: 56,
        type: 'search',
        value: 'celebration party holiday cake',
      },
      {
        id: 'search_bedtime',
        label: 'Bedtime',
        x: 280,
        y: 355,
        width: 220,
        height: 56,
        type: 'search',
        value: 'bedtime stories cozy warm night',
      },
      {
        id: 'search_milestones',
        label: 'Milestones',
        x: 520,
        y: 355,
        width: 220,
        height: 56,
        type: 'search',
        value: 'milestones first steps growth newborn',
      },
      {
        id: 'search_joy',
        label: 'Everyday Joy',
        x: 760,
        y: 355,
        width: 224,
        height: 56,
        type: 'search',
        value: 'everyday joy smiles laughter fun',
      },

      // Section 3: Utility Controls (Y = 485)
      {
        id: 'action_recenter',
        label: 'Recenter View',
        x: 40,
        y: 485,
        width: 290,
        height: 68,
        type: 'action',
      },
      {
        id: 'action_labels',
        label: 'Cluster Labels',
        x: 350,
        y: 485,
        width: 290,
        height: 68,
        type: 'action',
      },
      {
        id: 'action_exit',
        label: 'Exit VR',
        x: 660,
        y: 485,
        width: 324,
        height: 68,
        type: 'action',
      },
    ];
  }

  /**
   * Constructs the 3D Panel Geometry and Bezel Mesh
   */
  private createPanelMesh(): void {
    // Main UI Plane
    const width = this.state.isMinimized ? 0.14 : 0.26;
    const height = this.state.isMinimized ? 0.08 : 0.165;

    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.panelMesh = new THREE.Mesh(geometry, material);
    this.panelMesh.name = 'VR_CONTROLLER_MENU_PANEL';
    this.panelMesh.userData = { isVRMenu: true };

    // Ambient backplate chassis
    const chassisGeo = new THREE.PlaneGeometry(width + 0.012, height + 0.012);
    const chassisMat = new THREE.MeshBasicMaterial({
      color: 0x05070f,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const chassisMesh = new THREE.Mesh(chassisGeo, chassisMat);
    chassisMesh.position.z = -0.002;
    this.panelMesh.add(chassisMesh);

    // Glowing border frame
    const frameGeo = new THREE.EdgesGeometry(chassisGeo);
    const frameMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.6,
      linewidth: 2,
    });
    const frameMesh = new THREE.LineSegments(frameGeo, frameMat);
    frameMesh.position.z = -0.001;
    this.panelMesh.add(frameMesh);

    this.group.add(this.panelMesh);
  }

  /**
   * Renders the UI design onto the 1024x640 2D canvas texture
   */
  private renderCanvas(): void {
    const ctx = this.ctx;
    const w = VRControllerMenu.CANVAS_WIDTH;
    const h = VRControllerMenu.CANVAS_HEIGHT;

    ctx.clearRect(0, 0, w, h);

    if (this.state.isMinimized) {
      // Minimized Wrist Capsule
      this.drawRoundedRect(ctx, 10, 10, w - 20, h - 20, 32);
      const bgGrad = ctx.createLinearGradient(0, 0, w, h);
      bgGrad.addColorStop(0, '#090b14');
      bgGrad.addColorStop(1, '#0e1726');
      ctx.fillStyle = bgGrad;
      ctx.fill();

      ctx.strokeStyle = this.hoveredButtonId === 'btn_expand' ? '#38bdf8' : '#38bdf866';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 44px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡ CHIEF VR MENU', w / 2, h / 2 - 20);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '28px monospace';
      ctx.fillText('Tap with laser pointer to open', w / 2, h / 2 + 35);

      this.texture.needsUpdate = true;
      return;
    }

    // 1. Dark Glassmorphism Foundation
    this.drawRoundedRect(ctx, 10, 10, w - 20, h - 20, 28);
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, '#070912');
    bgGrad.addColorStop(0.5, '#0b0f1d');
    bgGrad.addColorStop(1, '#070912');
    ctx.fillStyle = bgGrad;
    ctx.fill();

    ctx.strokeStyle = '#38bdf844';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Top Header Banner
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('CHIEF PHOTOSPHERE VR', 40, 52);

    // Stats Badge
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(`${this.state.photoCount} MEMORIES  •  6DoF LIVE`, 430, 52);

    // Section 1 Heading: Layout Mode
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 18px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('SPATIAL LAYOUT MATRIX', 40, 115);

    // Section 2 Heading: Search & Presets
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 18px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(
      this.state.searchQuery ? `ACTIVE FILTER: "${this.state.searchQuery}"` : 'INSTANT SEARCH & THEMATIC FILTERS',
      40,
      250
    );

    // Section 3 Heading: Utilities
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 18px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText('IMMERSION CONTROLS', 40, 455);

    // Render All Buttons
    for (const btn of this.buttons) {
      this.renderButton(btn);
    }

    this.texture.needsUpdate = true;
  }

  /**
   * Render individual button state (Default, Hover, Active Selection)
   */
  private renderButton(btn: MenuButtonDef): void {
    const ctx = this.ctx;
    const isHovered = this.hoveredButtonId === btn.id;

    let isActive = false;
    if (btn.type === 'layout') {
      isActive = this.state.activeLayout === btn.value;
    } else if (btn.type === 'search') {
      if (btn.value === '') {
        isActive = this.state.searchQuery === '';
      } else {
        isActive = this.state.searchQuery === btn.value;
      }
    } else if (btn.id === 'action_labels') {
      isActive = this.state.showLabels;
    }

    this.drawRoundedRect(ctx, btn.x, btn.y, btn.width, btn.height, 14);

    if (isActive) {
      const activeGrad = ctx.createLinearGradient(btn.x, btn.y, btn.x, btn.y + btn.height);
      activeGrad.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
      activeGrad.addColorStop(1, 'rgba(14, 165, 233, 0.25)');
      ctx.fillStyle = activeGrad;
      ctx.fill();

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = isHovered ? 4 : 2.5;
      ctx.stroke();
    } else if (isHovered) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.fill();

      ctx.strokeStyle = '#bae6fd';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Button Text Styling
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (btn.id === 'action_exit') {
      ctx.fillStyle = isHovered ? '#fca5a5' : '#ef4444';
      ctx.font = 'bold 22px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(`⏻ ${btn.label}`, btn.x + btn.width / 2, btn.y + btn.height / 2);
    } else if (btn.id === 'action_labels') {
      ctx.fillStyle = isActive ? '#38bdf8' : '#e2e8f0';
      ctx.font = 'bold 21px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(
        `Labels: ${this.state.showLabels ? 'ON' : 'OFF'}`,
        btn.x + btn.width / 2,
        btn.y + btn.height / 2
      );
    } else if (btn.type === 'layout') {
      ctx.fillStyle = isActive ? '#ffffff' : isHovered ? '#f8fafc' : '#cbd5e1';
      ctx.font = isActive ? 'bold 22px "Plus Jakarta Sans", system-ui, sans-serif' : '20px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(btn.label, btn.x + btn.width / 2, btn.y + btn.height / 2);
    } else if (btn.type === 'search') {
      ctx.fillStyle = isActive ? '#fef08a' : isHovered ? '#ffffff' : '#cbd5e1';
      ctx.font = isActive ? 'bold 18px "Plus Jakarta Sans", system-ui, sans-serif' : '17px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(btn.label, btn.x + btn.width / 2, btn.y + btn.height / 2);
    } else {
      ctx.fillStyle = isHovered ? '#ffffff' : '#cbd5e1';
      ctx.font = 'bold 20px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(btn.label, btn.x + btn.width / 2, btn.y + btn.height / 2);
    }
  }

  /**
   * Helper to draw rounded rectangle path
   */
  private drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /**
   * Attaches the VR Menu to a target controller grip or ray space (typically left wrist)
   */
  public attachToController(controller: THREE.Object3D): void {
    if (this.attachedController) {
      this.attachedController.remove(this.group);
    }
    this.attachedController = controller;

    // Position gracefully on the wrist / palm area of the controller
    this.group.position.set(0, 0.09, -0.06);
    this.group.rotation.set(-Math.PI / 4, 0, 0);
    this.group.scale.set(1, 1, 1);

    controller.add(this.group);
  }

  /**
   * Detaches the VR Menu
   */
  public detach(): void {
    if (this.attachedController) {
      this.attachedController.remove(this.group);
      this.attachedController = null;
    }
  }

  /**
   * Update internal state from App/HUD updates
   */
  public updateState(newState: Partial<VRMenuState>): void {
    let changed = false;
    if (newState.activeLayout !== undefined && newState.activeLayout !== this.state.activeLayout) {
      this.state.activeLayout = newState.activeLayout;
      changed = true;
    }
    if (newState.searchQuery !== undefined && newState.searchQuery !== this.state.searchQuery) {
      this.state.searchQuery = newState.searchQuery;
      changed = true;
    }
    if (newState.showLabels !== undefined && newState.showLabels !== this.state.showLabels) {
      this.state.showLabels = newState.showLabels;
      changed = true;
    }
    if (newState.photoCount !== undefined && newState.photoCount !== this.state.photoCount) {
      this.state.photoCount = newState.photoCount;
      changed = true;
    }
    if (newState.isMinimized !== undefined && newState.isMinimized !== this.state.isMinimized) {
      this.state.isMinimized = newState.isMinimized;
      this.initButtons();
      this.rebuildMesh();
      changed = true;
    }

    if (changed) {
      this.renderCanvas();
    }
  }

  /**
   * Rebuild panel mesh when toggling minimize / expand
   */
  private rebuildMesh(): void {
    if (this.panelMesh) {
      this.group.remove(this.panelMesh);
      this.panelMesh.geometry.dispose();
      this.panelMesh = null;
    }
    this.createPanelMesh();
  }

  /**
   * Checks if laser raycaster intersects the VR Menu and computes hover state
   */
  public checkIntersection(raycaster: THREE.Raycaster): MenuButtonDef | null {
    if (!this.panelMesh) return null;

    const intersects = raycaster.intersectObject(this.panelMesh, false);
    if (intersects.length === 0 || !intersects[0].uv) {
      if (this.hoveredButtonId !== null) {
        this.hoveredButtonId = null;
        this.renderCanvas();
      }
      return null;
    }

    const uv = intersects[0].uv;
    const canvasX = uv.x * VRControllerMenu.CANVAS_WIDTH;
    const canvasY = (1 - uv.y) * VRControllerMenu.CANVAS_HEIGHT;

    let hitBtn: MenuButtonDef | null = null;
    for (const btn of this.buttons) {
      if (
        canvasX >= btn.x &&
        canvasX <= btn.x + btn.width &&
        canvasY >= btn.y &&
        canvasY <= btn.y + btn.height
      ) {
        hitBtn = btn;
        break;
      }
    }

    const nextHoverId = hitBtn ? hitBtn.id : null;
    if (nextHoverId !== this.hoveredButtonId) {
      this.hoveredButtonId = nextHoverId;
      this.renderCanvas();
    }

    return hitBtn;
  }

  /**
   * Handles trigger select click on the VR Menu
   * Returns true if a menu button was clicked (consuming the event)
   */
  public handleSelect(raycaster: THREE.Raycaster): boolean {
    const hitBtn = this.checkIntersection(raycaster);
    if (!hitBtn) return false;

    if (hitBtn.id === 'btn_minimize' || hitBtn.id === 'btn_expand') {
      this.updateState({ isMinimized: !this.state.isMinimized });
      AudioSynthesizer.playCardSelect(180);
      return true;
    }

    if (hitBtn.type === 'layout' && hitBtn.value) {
      const mode = hitBtn.value as Layout3DMode;
      this.updateState({ activeLayout: mode });
      this.callbacks.onLayoutChange(mode);
      const modeIdx = ['FIBONACCI_SPHERE', 'DNA_HELIX', 'GALAXY_CONSTELLATION', 'CUBIC_MATRIX'].indexOf(mode);
      AudioSynthesizer.playLayoutSwoosh(modeIdx >= 0 ? modeIdx : 0);
      return true;
    }

    if (hitBtn.type === 'search' && hitBtn.value !== undefined) {
      this.updateState({ searchQuery: hitBtn.value });
      this.callbacks.onSearchChange(hitBtn.value);
      AudioSynthesizer.playSearchFilter();
      return true;
    }

    if (hitBtn.id === 'action_recenter') {
      this.callbacks.onResetView();
      AudioSynthesizer.playLayoutSwoosh(0);
      return true;
    }

    if (hitBtn.id === 'action_labels') {
      const nextLabels = !this.state.showLabels;
      this.updateState({ showLabels: nextLabels });
      this.callbacks.onToggleLabels();
      AudioSynthesizer.playSearchFilter();
      return true;
    }

    if (hitBtn.id === 'action_exit') {
      this.callbacks.onExitVR();
      return true;
    }

    return true;
  }

  /**
   * Get main Group for Three.js scene graph inspection
   */
  public getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Dispose all textures, geometries, and materials
   */
  public dispose(): void {
    this.detach();
    if (this.panelMesh) {
      this.panelMesh.geometry.dispose();
      (this.panelMesh.material as THREE.Material).dispose();
      this.panelMesh = null;
    }
    this.texture.dispose();
  }
}
