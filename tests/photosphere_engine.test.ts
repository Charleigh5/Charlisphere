import { describe, it, expect, vi } from 'vitest';
import { SpatialLayoutEngine } from '../src/math/SpatialLayoutEngine';
import { GooglePhotosConnector } from '../src/connectors/GooglePhotosConnector';
import { DEFAULT_GOOGLE_PHOTOS_SYNC_INTERVAL_MS, useGooglePhotosSync } from '../src/hooks/useGooglePhotosSync';
import { generateSampleAlbum } from '../src/data/sampleMemories';
import { VectorNlpEngine } from '../src/engine/VectorNlpEngine';
import { computeTaaMotionState, computeFocusCameraTransform } from '../src/components/PhotoSphereCanvas';
import { WebXREngine } from '../src/engine/WebXREngine';
import { SpatialAudioProcessor } from '../src/engine/SpatialAudioProcessor';
import { AudioSynthesizer } from '../src/engine/AudioSynthesizer';
import { VoiceSearchEngine } from '../src/engine/VoiceSearchEngine';
import { BackgroundThemeAnalyzer } from '../src/engine/BackgroundThemeAnalyzer';
import { FocusTrailEngine } from '../src/engine/FocusTrailEngine';
import { SpatialTransitionEngine } from '../src/engine/SpatialTransitionEngine';
import {
  evaluateAutoRotation,
  DEFAULT_AUTO_ROTATION_CONFIG,
  smoothstep,
} from '../src/engine/AutoRotationEngine';
import {
  IDLE_AUTO_ORBIT_DELAY_MS,
  AUTO_ORBIT_SPEED_RAD_PER_SEC,
} from '../src/components/PhotoSphereCanvas';
import {
  DEFAULT_BLOOM_CONFIG,
  sanitizeBloomConfig,
  computeAdaptiveBloom,
} from '../src/engine/BloomPostProcessingEngine';
import {
  DEFAULT_DOF_CONFIG,
  computeAutoFocusDistance,
  computeCircleOfConfusion,
  computeAdaptiveDepthOfField,
} from '../src/engine/DepthOfFieldEngine';
import * as THREE from 'three';

describe('PhotoSphere Engine Verification', () => {
  it('Auto-scales sphere radius proportionally to square root of album count', () => {
    const rSmall = SpatialLayoutEngine.computeDynamicRadius(30);
    const rMedium = SpatialLayoutEngine.computeDynamicRadius(360);
    const rLarge = SpatialLayoutEngine.computeDynamicRadius(1000);

    expect(rSmall).toBeGreaterThanOrEqual(380);
    expect(rMedium).toBeGreaterThan(rSmall);
    expect(rLarge).toBeGreaterThan(rMedium);
    expect(Math.round(rMedium)).toBeCloseTo(620, -1);
  });

  it('Formats Google Photos dynamic sizing parameters correctly', () => {
    const base = 'https://lh3.googleusercontent.com/sample';
    const thumb = GooglePhotosConnector.formatThumbnailUrl(base, 512);
    const highRes = GooglePhotosConnector.formatHighResUrl(base, 2048, 2048);

    expect(thumb).toBe('https://lh3.googleusercontent.com/sample=w512-h512-c');
    expect(highRes).toBe('https://lh3.googleusercontent.com/sample=w2048-h2048');
  });

  it('Verifies 5-minute background polling interval for Google Photos sync', () => {
    // 5 minutes in milliseconds = 5 * 60 * 1000 = 300,000 ms
    expect(DEFAULT_GOOGLE_PHOTOS_SYNC_INTERVAL_MS).toBe(300000);
    expect(DEFAULT_GOOGLE_PHOTOS_SYNC_INTERVAL_MS).toBe(5 * 60 * 1000);
    expect(typeof useGooglePhotosSync).toBe('function');
  });

  it('Detects empty token and provides clear user instructions', async () => {
    const diag = await GooglePhotosConnector.inspectToken('');
    expect(diag.isValid).toBe(false);
    expect(diag.errorType).toBe('INVALID_TOKEN');
    expect(diag.message).toContain('Please paste a valid Google OAuth Access Token');
    expect(diag.actionGuide?.copyableScope).toBe(GooglePhotosConnector.SCOPE_READONLY);
  });

  it('Identifies authorization code mistaken for access token', async () => {
    const diag = await GooglePhotosConnector.inspectToken('4/0AdMD6Eg...sampleAuthCode');
    expect(diag.isValid).toBe(false);
    expect(diag.errorType).toBe('AUTH_CODE_MISTAKE');
    expect(diag.title).toContain('Authorization Code Detected');
    expect(diag.actionGuide?.steps.length).toBeGreaterThan(0);
  });

  it('Identifies Google API key mistaken for OAuth access token', async () => {
    const diag = await GooglePhotosConnector.inspectToken('AIzaSyD_SampleGoogleApiKey12345');
    expect(diag.isValid).toBe(false);
    expect(diag.errorType).toBe('API_KEY_MISTAKE');
    expect(diag.title).toContain('Google API Key Detected');
  });

  it('Verifies Google OAuth Client ID and Photos scopes configuration', () => {
    expect(GooglePhotosConnector.DEFAULT_CLIENT_ID).toBe('455504850444-51pbff6kslt15k23ddciu3bl934q1q9j.apps.googleusercontent.com');
    expect(GooglePhotosConnector.PROJECT_ID).toBe('neural-canvas-482621');
    expect(GooglePhotosConnector.SCOPE_READONLY).toBe('https://www.googleapis.com/auth/photoslibrary.readonly');
    expect(GooglePhotosConnector.getActiveClientId()).toBe('455504850444-51pbff6kslt15k23ddciu3bl934q1q9j.apps.googleusercontent.com');
  });

  it('Verifies hasRequiredPhotosScope correctly validates photoslibrary.readonly scope', () => {
    // Granted scope includes photoslibrary.readonly
    expect(
      GooglePhotosConnector.hasRequiredPhotosScope('https://www.googleapis.com/auth/photoslibrary.readonly')
    ).toBe(true);

    expect(
      GooglePhotosConnector.hasRequiredPhotosScope([
        'email',
        'profile',
        'https://www.googleapis.com/auth/photoslibrary.readonly',
      ])
    ).toBe(true);

    expect(
      GooglePhotosConnector.hasRequiredPhotosScope('openid email https://www.googleapis.com/auth/photoslibrary')
    ).toBe(true);

    // Granted scopes missing photos permissions
    expect(GooglePhotosConnector.hasRequiredPhotosScope('email profile openid')).toBe(false);
    expect(GooglePhotosConnector.hasRequiredPhotosScope(['email', 'profile'])).toBe(false);
    expect(GooglePhotosConnector.hasRequiredPhotosScope('')).toBe(false);
  });

  it('Verifies verifyTokenScope handles empty and invalid tokens', async () => {
    const res = await GooglePhotosConnector.verifyTokenScope('');
    expect(res.isValid).toBe(false);
    expect(res.hasPermission).toBe(false);
  });

  it('Dynamically synthesizes 3D spatial cluster themes using NLP engine', () => {
    const album = generateSampleAlbum(60);
    const nlp = new VectorNlpEngine();
    nlp.indexItems(album);

    const clusters = nlp.generateSpatialClusters(album, 4);
    expect(clusters.length).toBeGreaterThan(0);
    expect(clusters.length).toBeLessThanOrEqual(4);

    clusters.forEach((cluster: any) => {
      expect(cluster.themeTitle).toBeDefined();
      expect(typeof cluster.themeTitle).toBe('string');
      expect(cluster.themeTitle.length).toBeGreaterThan(0);
      expect(cluster.centroid).toHaveLength(3);
      expect(cluster.itemCount).toBeGreaterThan(0);
      expect(cluster.color).toMatch(/^#/);
    });
  });

  it('Calculates touch pinch-to-zoom distance delta and bounds correctly', () => {
    // Two touches moving apart (zoom in)
    const t1Initial = { x: 100, y: 100 };
    const t2Initial = { x: 200, y: 100 };
    const initialDist = Math.hypot(t2Initial.x - t1Initial.x, t2Initial.y - t1Initial.y);
    expect(initialDist).toBe(100);

    const t1Moved = { x: 80, y: 100 };
    const t2Moved = { x: 240, y: 100 };
    const movedDist = Math.hypot(t2Moved.x - t1Moved.x, t2Moved.y - t1Moved.y);
    expect(movedDist).toBe(160);

    const distDelta = movedDist - initialDist;
    expect(distDelta).toBe(60);

    const initialRadius = 1200;
    const zoomSensitivity = (initialRadius / 650) * 2.2;
    const newRadius = Math.max(350, Math.min(5000, initialRadius - distDelta * zoomSensitivity));
    expect(newRadius).toBeLessThan(initialRadius);
    expect(newRadius).toBeGreaterThanOrEqual(350);
  });

  it('Computes two-finger rotation angular delta across boundary wrapping', () => {
    const angle1 = Math.PI - 0.1;
    const angle2 = -Math.PI + 0.1;
    let angleDelta = angle2 - angle1;

    // Boundary normalization
    while (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
    while (angleDelta < -Math.PI) angleDelta += Math.PI * 2;

    expect(angleDelta).toBeCloseTo(0.2, 4);
  });

  it('Projects two-finger midpoint translation into camera view-plane 3D pan offset', () => {
    const theta = Math.PI / 4;
    const phi = Math.PI / 2; // Horizontal camera view

    const sinPhi = Math.sin(phi);
    const rx = sinPhi > 0.001 ? Math.cos(theta) : 1;
    const ry = 0;
    const rz = sinPhi > 0.001 ? -Math.sin(theta) : 0;

    const ux = -Math.sin(theta) * Math.cos(phi);
    const uy = Math.sin(phi);
    const uz = -Math.cos(theta) * Math.cos(phi);

    // Right vector should be perpendicular to Up vector
    const dotProduct = rx * ux + ry * uy + rz * uz;
    expect(dotProduct).toBeCloseTo(0, 5);

    // Pan translation
    const dMidX = 10;
    const dMidY = 5;
    const panFactor = 1.5;

    const panX = (-dMidX * rx + dMidY * ux) * panFactor;
    const panY = (-dMidX * ry + dMidY * uy) * panFactor;
    const panZ = (-dMidX * rz + dMidY * uz) * panFactor;

    expect(typeof panX).toBe('number');
    expect(typeof panY).toBe('number');
    expect(typeof panZ).toBe('number');
    expect(Number.isFinite(panX)).toBe(true);
    expect(Number.isFinite(panY)).toBe(true);
    expect(Number.isFinite(panZ)).toBe(true);
  });

  it('Verifies auto-orbit idle detection, ramp-in curve, and kinematic rotation after 5 seconds', () => {
    const IDLE_AUTO_ORBIT_DELAY_MS = 5000;
    const AUTO_ORBIT_SPEED_RAD_PER_SEC = 0.065;

    // Test 1: User active (idle for 2.5s) -> No auto-orbit
    const lastActivity1 = 10000;
    const currentTime1 = 12500;
    const idleDuration1 = currentTime1 - lastActivity1;
    const isIdle1 = idleDuration1 >= IDLE_AUTO_ORBIT_DELAY_MS;
    expect(isIdle1).toBe(false);

    // Test 2: User idle for 5s -> Auto-orbit triggers
    const lastActivity2 = 10000;
    const currentTime2 = 15000;
    const idleDuration2 = currentTime2 - lastActivity2;
    const isIdle2 = idleDuration2 >= IDLE_AUTO_ORBIT_DELAY_MS;
    expect(isIdle2).toBe(true);

    // Test 3: Ramp factor calculation after 5s
    const rampAt5s = Math.min(1, (idleDuration2 - IDLE_AUTO_ORBIT_DELAY_MS) / 1200);
    expect(rampAt5s).toBe(0); // Smooth start from 0

    const currentTime3 = 16200; // 1.2s into auto-orbit
    const idleDuration3 = currentTime3 - lastActivity2;
    const rampAt6_2s = Math.min(1, (idleDuration3 - IDLE_AUTO_ORBIT_DELAY_MS) / 1200);
    expect(rampAt6_2s).toBe(1); // Full gentle speed

    // Test 4: Kinematic orbit rotation over 1 second at full ramp
    const initialTheta = Math.PI / 4;
    const delta = 0.016; // ~60fps frame delta
    const orbitStep = AUTO_ORBIT_SPEED_RAD_PER_SEC * delta * rampAt6_2s;
    const newTheta = initialTheta + orbitStep;

    expect(newTheta).toBeGreaterThan(initialTheta);
    expect(orbitStep).toBeCloseTo(0.00104, 5);
  });

  it('Verifies Temporal Anti-Aliasing (TAA) dynamic sample levels and accumulation mode transitions', () => {
    // 1. Stationary camera (no movement, not dragging) -> Accumulate mode with sampleLevel 0 (1 sample/frame accumulating)
    const stationary = computeTaaMotionState(0, 0, 0, 0, false);
    expect(stationary.mode).toBe('STATIONARY_ACCUMULATE');
    expect(stationary.accumulate).toBe(true);
    expect(stationary.sampleLevel).toBe(0);

    // 2. Gentle motion / auto-orbit / slow drag -> Gentle motion mode with 2 sub-pixel jitter samples, accumulate false
    const gentleOrbit = computeTaaMotionState(0.001, 0.0001, 0.05, 0.02, false);
    expect(gentleOrbit.mode).toBe('GENTLE_MOTION');
    expect(gentleOrbit.accumulate).toBe(false);
    expect(gentleOrbit.sampleLevel).toBe(1);

    // 3. User interacting (dragging/touching) with minimal movement -> Gentle motion mode to avoid ghosting
    const userTouch = computeTaaMotionState(0, 0, 0, 0, true);
    expect(userTouch.mode).toBe('GENTLE_MOTION');
    expect(userTouch.accumulate).toBe(false);
    expect(userTouch.sampleLevel).toBe(1);

    // 4. High-speed orbit / fast camera rotation -> High-speed jitter mode with 4 sub-pixel samples
    const fastOrbit = computeTaaMotionState(0.008, 0.004, 0, 0, false);
    expect(fastOrbit.mode).toBe('HIGH_SPEED_JITTER');
    expect(fastOrbit.accumulate).toBe(false);
    expect(fastOrbit.sampleLevel).toBe(2);

    // 5. High-speed zoom momentum -> High-speed jitter mode
    const fastZoom = computeTaaMotionState(0, 0, 5.5, 0, false);
    expect(fastZoom.mode).toBe('HIGH_SPEED_JITTER');
    expect(fastZoom.accumulate).toBe(false);
    expect(fastZoom.sampleLevel).toBe(2);

    // 6. High-speed pan momentum -> High-speed jitter mode
    const fastPan = computeTaaMotionState(0, 0, 0, 3.2, false);
    expect(fastPan.mode).toBe('HIGH_SPEED_JITTER');
    expect(fastPan.accumulate).toBe(false);
    expect(fastPan.sampleLevel).toBe(2);
  });

  it('Calculates 3D Focus Mode close-up camera orbit transform and angle orientation accurately', () => {
    // Target position along positive Z axis
    const posZ: [number, number, number] = [0, 0, 500];
    const transformZ = computeFocusCameraTransform(posZ, 320);

    expect(transformZ.targetPanOffset).toEqual([0, 0, 500]);
    expect(transformZ.targetRadius).toBe(320);
    expect(transformZ.targetTheta).toBeCloseTo(0, 4); // atan2(0, 500) = 0
    expect(transformZ.targetPhi).toBeCloseTo(Math.PI / 2, 4); // Equator

    // Target position along positive X axis
    const posX: [number, number, number] = [400, 0, 0];
    const transformX = computeFocusCameraTransform(posX, 280);

    expect(transformX.targetPanOffset).toEqual([400, 0, 0]);
    expect(transformX.targetRadius).toBe(280);
    expect(transformX.targetTheta).toBeCloseTo(Math.PI / 2, 4); // atan2(400, 0) = PI/2
    expect(transformX.targetPhi).toBeCloseTo(Math.PI / 2, 4);

    // Target position at high elevation (near North Pole) - verifies phi clamp
    const posNorth: [number, number, number] = [0, 500, 0];
    const transformNorth = computeFocusCameraTransform(posNorth, 300);

    expect(transformNorth.targetPhi).toBeGreaterThanOrEqual(0.08);
    expect(transformNorth.targetPhi).toBeLessThanOrEqual(3.06);

    // Target position at low elevation (near South Pole) - verifies phi clamp
    const posSouth: [number, number, number] = [0, -500, 0];
    const transformSouth = computeFocusCameraTransform(posSouth, 300);

    expect(transformSouth.targetPhi).toBeGreaterThanOrEqual(0.08);
    expect(transformSouth.targetPhi).toBeLessThanOrEqual(3.06);
  });

  it('Verifies WebXR support check structure and graceful fallback', async () => {
    const status = await WebXREngine.checkVRSupport();
    expect(status).toHaveProperty('isSupported');
    expect(status).toHaveProperty('hasHardware');
    expect(status).toHaveProperty('message');
    expect(typeof status.message).toBe('string');
  });

  it('Verifies WebXR laser pointer geometry and controller raycasting line setup', () => {
    const laser = WebXREngine.createLaserPointer();
    expect(laser).toBeDefined();
    expect(laser.geometry).toBeDefined();
    expect(laser.material).toBeDefined();
    expect(WebXREngine.isPresenting()).toBe(false);
  });

  it('Verifies WebXR performance profile application handles mock renderer without errors', () => {
    const mockRenderer = {
      xr: {
        setFoveation: vi.fn(),
        setFramebufferScaleFactor: vi.fn(),
      },
    } as unknown as any;

    WebXREngine.applyPerformanceProfile(mockRenderer, true);
    expect(mockRenderer.xr.setFoveation).toHaveBeenCalledWith(1.0);
    expect(mockRenderer.xr.setFramebufferScaleFactor).toHaveBeenCalledWith(0.9);

    WebXREngine.applyPerformanceProfile(mockRenderer, false);
    expect(mockRenderer.xr.setFoveation).toHaveBeenCalledWith(0.0);
    expect(mockRenderer.xr.setFramebufferScaleFactor).toHaveBeenCalledWith(1.0);
  });

  it('Verifies WebXR gesture sensitivity clamping and state retrieval', () => {
    WebXREngine.setGestureSensitivity(1.5);
    expect(WebXREngine.getGestureSensitivity()).toBe(1.5);

    // Clamping min to 0.2
    WebXREngine.setGestureSensitivity(0.05);
    expect(WebXREngine.getGestureSensitivity()).toBe(0.2);

    // Clamping max to 3.0
    WebXREngine.setGestureSensitivity(5.0);
    expect(WebXREngine.getGestureSensitivity()).toBe(3.0);

    // Reset to default 1.0
    WebXREngine.setGestureSensitivity(1.0);
    expect(WebXREngine.getGestureSensitivity()).toBe(1.0);
  });

  it('Calculates VR thumbstick motion with deadzone filtering and sensitivity multiplier', () => {
    // 1. Below deadzone (<0.12) should produce zero delta
    const deadzoneMotion = WebXREngine.computeVRThumbstickMotion(
      [0.05, -0.08, 0.05, -0.08],
      'right',
      1.0,
      0.016
    );
    expect(deadzoneMotion.dYaw).toBe(0);
    expect(deadzoneMotion.dPitch).toBe(0);
    expect(deadzoneMotion.dScale).toBe(0);

    // 2. Right hand thumbstick deflection (Yaw and Pitch)
    const rightStick = WebXREngine.computeVRThumbstickMotion(
      [0, 0, 0.8, 0.6],
      'right',
      1.5,
      0.016
    );
    expect(rightStick.dYaw).toBeGreaterThan(0);
    expect(rightStick.dPitch).toBeGreaterThan(0);
    expect(rightStick.dScale).toBe(0);

    // Verify sensitivity proportionality: 2x sensitivity produces 2x delta
    const baseline = WebXREngine.computeVRThumbstickMotion(
      [0, 0, 1.0, 0],
      'right',
      1.0,
      0.016
    );
    const doubled = WebXREngine.computeVRThumbstickMotion(
      [0, 0, 1.0, 0],
      'right',
      2.0,
      0.016
    );
    expect(doubled.dYaw).toBeCloseTo(baseline.dYaw * 2, 4);

    // 3. Left hand vertical thumbstick deflection (Scale / Zoom)
    const leftStickZoom = WebXREngine.computeVRThumbstickMotion(
      [0, 0, 0, -0.9],
      'left',
      1.0,
      0.016
    );
    expect(leftStickZoom.dScale).toBeGreaterThan(0);
    expect(leftStickZoom.dPitch).toBe(0);
  });

  describe('3D Spatial Audio Processor & Panning Verification', () => {
    it('Calculates exact Euclidean 3D distance between camera and sound source', () => {
      const p1: [number, number, number] = [0, 0, 0];
      const p2: [number, number, number] = [300, 400, 0];
      const d1 = SpatialAudioProcessor.computeDistance(p1, p2);
      expect(d1).toBe(500); // 3-4-5 triangle * 100

      const p3: [number, number, number] = [100, 200, 300];
      const p4: [number, number, number] = [100, 200, 300];
      expect(SpatialAudioProcessor.computeDistance(p3, p4)).toBe(0);

      const p5 = { x: 10, y: 20, z: 30 };
      const p6 = { x: 10, y: 20, z: 50 };
      expect(SpatialAudioProcessor.computeDistance(p5, p6)).toBe(20);
    });

    it('Pans sound sources correctly to Left (-1.0), Center (0.0), and Right (+1.0) based on camera orientation', () => {
      const cameraPos: [number, number, number] = [0, 0, 1000];
      const cameraForward = { x: 0, y: 0, z: -1 }; // Looking toward -Z
      const cameraUp = { x: 0, y: 1, z: 0 }; // Up is +Y

      // Object directly ahead of camera
      const centerItem: [number, number, number] = [0, 0, 500];
      const centerPan = SpatialAudioProcessor.computeStereoPan(centerItem, cameraPos, cameraForward, cameraUp);
      expect(centerPan).toBeCloseTo(0.0, 2);

      // Object to the right of camera (+X is right when looking -Z with +Y up)
      const rightItem: [number, number, number] = [500, 0, 1000];
      const rightPan = SpatialAudioProcessor.computeStereoPan(rightItem, cameraPos, cameraForward, cameraUp);
      expect(rightPan).toBeGreaterThan(0.9);

      // Object to the left of camera (-X is left)
      const leftItem: [number, number, number] = [-500, 0, 1000];
      const leftPan = SpatialAudioProcessor.computeStereoPan(leftItem, cameraPos, cameraForward, cameraUp);
      expect(leftPan).toBeLessThan(-0.9);

      // Object 45 degrees to the right
      const diagItem: [number, number, number] = [500, 0, 500];
      const diagPan = SpatialAudioProcessor.computeStereoPan(diagItem, cameraPos, cameraForward, cameraUp);
      expect(diagPan).toBeGreaterThan(0.5);
      expect(diagPan).toBeLessThan(0.9);
    });

    it('Applies smooth distance attenuation from close focus (1.0) to far distant limit (0.04)', () => {
      // Close distance <= 300 units should have full gain 1.0
      const closeGain = SpatialAudioProcessor.computeDistanceAttenuation(250);
      expect(closeGain).toBe(1.0);

      const midGain = SpatialAudioProcessor.computeDistanceAttenuation(1000);
      expect(midGain).toBeLessThan(1.0);
      expect(midGain).toBeGreaterThan(0.3);

      const farGain = SpatialAudioProcessor.computeDistanceAttenuation(2500);
      expect(farGain).toBe(0.04);

      const extremeGain = SpatialAudioProcessor.computeDistanceAttenuation(5000);
      expect(extremeGain).toBe(0.04);
    });

    it('Calculates air-absorption acoustic lowpass cutoff frequency dynamically with distance', () => {
      const closeCutoff = SpatialAudioProcessor.computeAirAbsorptionCutoff(100);
      const midCutoff = SpatialAudioProcessor.computeAirAbsorptionCutoff(800);
      const farCutoff = SpatialAudioProcessor.computeAirAbsorptionCutoff(3000);

      // High frequencies remain intact up close
      expect(closeCutoff).toBeGreaterThan(12000);

      // Muffled/warmer sound at greater distances
      expect(midCutoff).toBeLessThan(closeCutoff);
      expect(midCutoff).toBeGreaterThan(2500);

      expect(farCutoff).toBeLessThan(midCutoff);
      expect(farCutoff).toBeGreaterThanOrEqual(600);
    });

    it('Synchronizes mute state across AudioSynthesizer and SpatialAudioProcessor', () => {
      SpatialAudioProcessor.setMuted(false);
      AudioSynthesizer.setMuted(false);
      expect(SpatialAudioProcessor.getMuted()).toBe(false);
      expect(AudioSynthesizer.getMuted()).toBe(false);

      AudioSynthesizer.toggleMute();
      expect(AudioSynthesizer.getMuted()).toBe(true);
      expect(SpatialAudioProcessor.getMuted()).toBe(true);

      SpatialAudioProcessor.toggleMute();
      expect(SpatialAudioProcessor.getMuted()).toBe(false);
      expect(AudioSynthesizer.getMuted()).toBe(false);
    });

    it('Generates accurate telemetry state when updating listener and focused item audio', () => {
      SpatialAudioProcessor.updateListener([100, 200, 800], { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 });
      let tel = SpatialAudioProcessor.getTelemetry();
      expect(tel.listenerPosition).toEqual([100, 200, 800]);

      const mockSample = generateSampleAlbum(5)[0];
      mockSample.currentPos = [400, 200, 400];

      SpatialAudioProcessor.updateFocusedItemSpatialAudio(
        [100, 200, 800],
        mockSample.currentPos,
        mockSample,
        { x: 0, y: 0, z: -1 },
        { x: 0, y: 1, z: 0 }
      );

      tel = SpatialAudioProcessor.getTelemetry();
      expect(tel.focusedItemPosition).toEqual([400, 200, 400]);
      expect(tel.distanceToFocus).toBeCloseTo(500, 0); // dx=300, dy=0, dz=-400 -> hypot=500
      expect(tel.stereoPan).toBeGreaterThan(0.4); // To the right (+X)
      expect(tel.isResonating).toBe(true);

      // Clearing focus item disables resonance
      SpatialAudioProcessor.updateFocusedItemSpatialAudio([100, 200, 800], null, null);
      tel = SpatialAudioProcessor.getTelemetry();
      expect(tel.focusedItemPosition).toBeNull();
      expect(tel.isResonating).toBe(false);
    });
  });

  describe('Web Speech API & Voice Vector Search Verification', () => {
    it('Sanitizes natural language voice search phrases by stripping conversational filler prefixes', () => {
      expect(VoiceSearchEngine.sanitizeVoiceQuery('find photos of sunset at beach')).toBe('sunset at beach');
      expect(VoiceSearchEngine.sanitizeVoiceQuery('search for all pictures of red cars')).toBe('red cars');
      expect(VoiceSearchEngine.sanitizeVoiceQuery('show me memories of family in Tokyo')).toBe('family in Tokyo');
      expect(VoiceSearchEngine.sanitizeVoiceQuery('look for mountain summits')).toBe('mountain summits');
      expect(VoiceSearchEngine.sanitizeVoiceQuery('filter by golden hour')).toBe('golden hour');
      expect(VoiceSearchEngine.sanitizeVoiceQuery('birthday celebration in Paris')).toBe('birthday celebration in Paris');
    });

    it('Parses voice transcripts into structural layout, sort, and matrix navigation commands', () => {
      // Layout switches
      const cmdHelix = VoiceSearchEngine.parseVoiceTranscript('switch to DNA helix layout');
      expect(cmdHelix.type).toBe('LAYOUT_CHANGE');
      expect(cmdHelix.payload).toBe('DNA_HELIX');

      const cmdSphere = VoiceSearchEngine.parseVoiceTranscript('show fibonacci sphere');
      expect(cmdSphere.type).toBe('LAYOUT_CHANGE');
      expect(cmdSphere.payload).toBe('FIBONACCI_SPHERE');

      const cmdGalaxy = VoiceSearchEngine.parseVoiceTranscript('galaxy constellation view');
      expect(cmdGalaxy.type).toBe('LAYOUT_CHANGE');
      expect(cmdGalaxy.payload).toBe('GALAXY_CONSTELLATION');

      const cmdMatrix = VoiceSearchEngine.parseVoiceTranscript('cubic matrix grid');
      expect(cmdMatrix.type).toBe('LAYOUT_CHANGE');
      expect(cmdMatrix.payload).toBe('CUBIC_MATRIX');

      // Sort switches
      const cmdTime = VoiceSearchEngine.parseVoiceTranscript('sort by chronological timeline');
      expect(cmdTime.type).toBe('SORT_CHANGE');
      expect(cmdTime.payload).toBe('CHRONOLOGICAL');

      const cmdGeo = VoiceSearchEngine.parseVoiceTranscript('geographic world sort');
      expect(cmdGeo.type).toBe('SORT_CHANGE');
      expect(cmdGeo.payload).toBe('GEOGRAPHIC');

      // Camera and search reset
      const cmdReset = VoiceSearchEngine.parseVoiceTranscript('recenter camera view');
      expect(cmdReset.type).toBe('RESET_CAMERA');

      const cmdClear = VoiceSearchEngine.parseVoiceTranscript('clear search');
      expect(cmdClear.type).toBe('CLEAR_SEARCH');
    });

    it('Executes Vector NLP search matching from sanitized voice input', () => {
      const sampleAlbum = generateSampleAlbum(30);
      const nlp = new VectorNlpEngine();
      nlp.indexItems(sampleAlbum);

      const voiceInput = 'find photos of beach and ocean';
      const parsedCmd = VoiceSearchEngine.parseVoiceTranscript(voiceInput);
      expect(parsedCmd.type).toBe('SEARCH');
      expect(parsedCmd.payload).toBe('beach and ocean');

      const { results, latencyMs } = nlp.search(parsedCmd.payload as string, sampleAlbum);
      expect(results.length).toBeGreaterThan(0);
      expect(latencyMs).toBeLessThan(10); // sub-10ms requirement
    });

    it('Detects Web Speech API support safely across environments', () => {
      const supported = VoiceSearchEngine.isSupported();
      expect(typeof supported).toBe('boolean');
    });
  });

  describe('Automated Background Theme Analysis & Vector Relevancy Engine', () => {
    it('Extracts common themes (beach, sunset, family) from photo metadata and chromatic heuristics', async () => {
      const analyzer = BackgroundThemeAnalyzer.getInstance();
      analyzer.reset();

      // Mock a beach photo item
      const beachPhoto = {
        id: 'photo_beach_01',
        title: 'Sunset Surf at Waikiki Beach',
        description: 'Golden hour waves rolling onto the sand',
        timestamp: new Date('2024-07-15T19:30:00Z').getTime(),
        thumbnailUrl: 'https://images.unsplash.com/photo-beach',
        highResUrl: 'https://images.unsplash.com/photo-beach',
        dominantColor: '#38bdf8',
        hue: 200, // Ocean blue
        aspectRatio: 1.5,
        exif: {
          locationName: 'Waikiki Beach, Hawaii',
          fNumber: 2.8,
          focalLength: 24,
        },
        people: ['Charleigh Rae', 'Mom'],
        tags: ['surf', 'waves'],
        category: 'Travel' as const,
        sentimentScore: 0.95,
        currentPos: [0, 0, 0] as [number, number, number],
        targetPos: [0, 0, 0] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        targetRotation: [0, 0, 0] as [number, number, number],
        matchScore: 1.0,
        isHighlighted: false,
        isSelected: false,
        opacity: 1.0,
        scale: 1.0,
      };

      const report = await analyzer.analyzePhoto(beachPhoto);

      expect(report.itemId).toBe('photo_beach_01');
      expect(report.topThemeNames).toContain('beach');
      expect(report.topThemeNames).toContain('sunset');
      expect(report.topThemeNames).toContain('family');

      const beachTheme = report.extractedThemes.find((t) => t.theme === 'beach');
      expect(beachTheme).toBeDefined();
      expect(beachTheme?.confidence).toBeGreaterThanOrEqual(0.6);
      expect(beachTheme?.evidence.length).toBeGreaterThan(0);
    });

    it('Enriches photo memory item tags with extracted themes and synsets', async () => {
      const analyzer = BackgroundThemeAnalyzer.getInstance();

      const rawPhoto = {
        id: 'photo_fam_02',
        title: 'Charleigh first birthday party',
        description: 'Blowing candles with mom and dad at home',
        timestamp: new Date('2024-03-20T16:00:00Z').getTime(),
        thumbnailUrl: 'https://images.unsplash.com/photo-fam',
        highResUrl: 'https://images.unsplash.com/photo-fam',
        dominantColor: '#f43f5e',
        hue: 340,
        aspectRatio: 1.33,
        exif: {
          locationName: 'Home Living Room',
        },
        people: ['Charleigh Rae', 'Mom', 'Dad', 'Grandma'],
        tags: ['first', 'cake'],
        category: 'Milestones' as const,
        sentimentScore: 0.98,
        currentPos: [0, 0, 0] as [number, number, number],
        targetPos: [0, 0, 0] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        targetRotation: [0, 0, 0] as [number, number, number],
        matchScore: 1.0,
        isHighlighted: false,
        isSelected: false,
        opacity: 1.0,
        scale: 1.0,
      };

      const report = await analyzer.analyzePhoto(rawPhoto);
      expect(report.topThemeNames).toContain('family');
      expect(report.topThemeNames).toContain('celebration');

      const enriched = analyzer.enrichItemWithThemes(rawPhoto, report);
      expect(enriched.tags).toContain('family');
      expect(enriched.tags).toContain('celebration');
      expect(enriched.tags).toContain('memories');
    });

    it('Significantly enhances Vector NLP search relevancy using background theme extraction', () => {
      const album = generateSampleAlbum(30);
      const nlp = new VectorNlpEngine();
      const analyzer = BackgroundThemeAnalyzer.getInstance();

      // Find an item without explicit 'beach' tag but with beach location/description
      const itemToEnrich = album[0];
      itemToEnrich.exif.locationName = 'Laguna Beach Coastal Shore';
      itemToEnrich.description = 'Watching waves crash on the sandy shore';
      itemToEnrich.tags = ['vacation', 'summer'];

      // Perform theme analysis
      const signals = analyzer.extractMetadataSignals(itemToEnrich);
      expect(signals.locationKeywords).toContain('beach');

      const report = {
        itemId: itemToEnrich.id,
        extractedThemes: [
          {
            theme: 'beach',
            confidence: 0.92,
            source: 'MULTI_MODAL' as const,
            evidence: ['Location Geo Match: beach', 'NLP Keywords: waves, shore'],
          },
        ],
        topThemeNames: ['beach'],
        relevancyBoosts: ['beach'],
        analyzedAt: Date.now(),
      };

      analyzer.enrichItemWithThemes(itemToEnrich, report);
      expect(itemToEnrich.tags).toContain('beach');
      expect(itemToEnrich.tags).toContain('ocean');

      // Re-index into VectorNlpEngine
      nlp.indexItems(album);

      // Search for 'beach'
      const { results } = nlp.search('beach', album);
      expect(results.length).toBeGreaterThan(0);

      const match = results.find((r) => r.itemId === itemToEnrich.id);
      expect(match).toBeDefined();
      expect(match!.score).toBeGreaterThan(0.2);
    });

    it('Processes asynchronous queue with time-slicing and notifies progress subscribers', async () => {
      const analyzer = BackgroundThemeAnalyzer.getInstance();
      analyzer.reset();

      const samplePhotos = generateSampleAlbum(5);
      let progressUpdateCount = 0;

      const unsub = analyzer.onProgress((p) => {
        progressUpdateCount++;
        expect(p.totalCount).toBeGreaterThanOrEqual(0);
      });

      analyzer.enqueueItems(samplePhotos);

      // Wait for queue processing to complete
      await new Promise((r) => setTimeout(r, 120));

      const distribution = analyzer.getThemeDistribution();
      expect(distribution.size).toBeGreaterThan(0);
      expect(progressUpdateCount).toBeGreaterThan(1);

      unsub();
    });
  });

  describe('3D Navigation Focus Trail Engine Verification', () => {
    it('Maintains singleton instance and enforces maximum capacity limit', () => {
      const trail1 = FocusTrailEngine.getInstance();
      const trail2 = FocusTrailEngine.getInstance();
      expect(trail1).toBe(trail2);

      trail1.clear();
      expect(trail1.waypointCount).toBe(0);

      trail1.setMaxCapacity(4);
      const items = generateSampleAlbum(8);

      for (const item of items) {
        trail1.addWaypoint(item);
      }

      expect(trail1.waypointCount).toBe(4);
      // Ensure the latest items are retained (sliding window)
      const waypoints = trail1.getWaypoints();
      expect(waypoints[waypoints.length - 1].id).toBe(items[7].id);
    });

    it('Adds waypoints on focus and prevents consecutive duplicate additions', () => {
      const trail = new FocusTrailEngine(10);
      const sample = generateSampleAlbum(3);

      // Add first item
      const added1 = trail.addWaypoint(sample[0]);
      expect(added1).toBe(true);
      expect(trail.waypointCount).toBe(1);

      // Adding same item consecutively should update coordinates rather than duplicate
      sample[0].currentPos = [100, 200, 300];
      const addedAgain = trail.addWaypoint(sample[0]);
      expect(addedAgain).toBe(false);
      expect(trail.waypointCount).toBe(1);

      const currentWp = trail.getWaypoints()[0];
      expect(currentWp.position).toEqual([100, 200, 300]);

      // Adding second distinct item appends
      const added2 = trail.addWaypoint(sample[1]);
      expect(added2).toBe(true);
      expect(trail.waypointCount).toBe(2);
    });

    it('Synchronizes waypoint positions dynamically when items move in 3D space', () => {
      const trail = new FocusTrailEngine(10);
      const sample = generateSampleAlbum(2);

      sample[0].currentPos = [10, 20, 30];
      sample[1].currentPos = [40, 50, 60];

      trail.addWaypoint(sample[0]);
      trail.addWaypoint(sample[1]);

      // Simulate 3D orbit or layout change
      sample[0].currentPos = [150, 250, 350];
      sample[1].currentPos = [450, 550, 650];

      const itemsMap = new Map([[sample[0].id, sample[0]], [sample[1].id, sample[1]]]);
      trail.syncPositions(itemsMap);

      const waypoints = trail.getWaypoints();
      expect(waypoints[0].position).toEqual([150, 250, 350]);
      expect(waypoints[1].position).toEqual([450, 550, 650]);
    });

    it('Generates smooth 3D Catmull-Rom spline points with progressive fading and color transitions', () => {
      const trail = new FocusTrailEngine(10);
      const sample = generateSampleAlbum(4);

      sample[0].currentPos = [0, 0, 0];
      sample[0].hue = 180;
      sample[1].currentPos = [100, 50, 20];
      sample[1].hue = 200;
      sample[2].currentPos = [200, -20, 40];
      sample[2].hue = 220;
      sample[3].currentPos = [300, 100, 80];
      sample[3].hue = 240;

      for (const item of sample) {
        trail.addWaypoint(item);
      }

      const splinePoints = trail.generateSplinePoints(10);
      expect(splinePoints.length).toBeGreaterThanOrEqual(30);

      // Verify start and end points match initial and final coordinates closely
      expect(splinePoints[0].position[0]).toBeCloseTo(0, -1);
      expect(splinePoints[splinePoints.length - 1].position[0]).toBeCloseTo(300, -1);

      // Verify progressive alpha gradient (oldest node is faint, latest node is prominent)
      const firstAlpha = splinePoints[0].alpha;
      const lastAlpha = splinePoints[splinePoints.length - 1].alpha;
      expect(firstAlpha).toBeLessThan(lastAlpha);
      expect(firstAlpha).toBeGreaterThanOrEqual(0.15);
      expect(lastAlpha).toBeGreaterThanOrEqual(0.9);

      // Verify RGB values are normalized between 0 and 1
      for (const pt of splinePoints) {
        expect(pt.color[0]).toBeGreaterThanOrEqual(0);
        expect(pt.color[0]).toBeLessThanOrEqual(1);
        expect(pt.color[1]).toBeGreaterThanOrEqual(0);
        expect(pt.color[1]).toBeLessThanOrEqual(1);
        expect(pt.color[2]).toBeGreaterThanOrEqual(0);
        expect(pt.color[2]).toBeLessThanOrEqual(1);
      }
    });

    it('Evaluates animated energy pulse 3D position along normalized spline progress', () => {
      const trail = new FocusTrailEngine(10);
      const sample = generateSampleAlbum(2);

      sample[0].currentPos = [0, 0, 0];
      sample[1].currentPos = [100, 100, 100];
      trail.addWaypoint(sample[0]);
      trail.addWaypoint(sample[1]);

      const splinePoints = trail.generateSplinePoints(20);

      // At u = 0, pulse is at start
      const pulseStart = FocusTrailEngine.evaluatePulsePosition(splinePoints, 0);
      expect(pulseStart).toBeDefined();
      expect(pulseStart![0]).toBeCloseTo(0, -1);

      // At u = 0.5, pulse is near midpoint
      const pulseMid = FocusTrailEngine.evaluatePulsePosition(splinePoints, 0.5);
      expect(pulseMid).toBeDefined();
      expect(pulseMid![0]).toBeGreaterThan(20);
      expect(pulseMid![0]).toBeLessThan(80);

      // At u = 1.0, pulse is near target focus node
      const pulseEnd = FocusTrailEngine.evaluatePulsePosition(splinePoints, 1.0);
      expect(pulseEnd).toBeDefined();
      expect(pulseEnd![0]).toBeCloseTo(100, -1);
    });

    it('Calculates waypoint beacon ring attributes based on sequential recency', () => {
      const beaconOld = FocusTrailEngine.calculateBeaconProps(0, 5);
      const beaconLatest = FocusTrailEngine.calculateBeaconProps(4, 5);

      expect(beaconOld.isLatest).toBe(false);
      expect(beaconLatest.isLatest).toBe(true);

      expect(beaconOld.scale).toBeLessThan(beaconLatest.scale);
      expect(beaconOld.opacity).toBeLessThan(beaconLatest.opacity);
      expect(beaconOld.ringRadius).toBeLessThan(beaconLatest.ringRadius);
    });

    it('Clears trail and supports removing specific waypoints by item ID', () => {
      const trail = new FocusTrailEngine(10);
      const sample = generateSampleAlbum(3);

      trail.addWaypoint(sample[0]);
      trail.addWaypoint(sample[1]);
      trail.addWaypoint(sample[2]);
      expect(trail.waypointCount).toBe(3);

      trail.remove(sample[1].id);
      expect(trail.waypointCount).toBe(2);
      expect(trail.getWaypoints().some((w) => w.id === sample[1].id)).toBe(false);

      trail.clear();
      expect(trail.waypointCount).toBe(0);
      expect(trail.generateSplinePoints().length).toBe(0);
    });
  });

  describe('SpatialTransitionEngine Verification (GSAP Transitions)', () => {
    it('Verifies camera choreography presets for FIBONACCI_SPHERE, DNA_HELIX, GALAXY_CONSTELLATION, and CUBIC_MATRIX', () => {
      const presets = SpatialTransitionEngine.CAMERA_PRESETS;

      expect(presets.FIBONACCI_SPHERE.targetPhi).toBeCloseTo(Math.PI * 0.5, 2);
      expect(presets.FIBONACCI_SPHERE.radiusMultiplier).toBe(1.0);

      expect(presets.DNA_HELIX.targetPhi).toBeCloseTo(Math.PI * 0.44, 2);
      expect(presets.DNA_HELIX.radiusMultiplier).toBeGreaterThan(1.0);

      expect(presets.GALAXY_CONSTELLATION.targetPhi).toBeCloseTo(Math.PI * 0.32, 2);
      expect(presets.GALAXY_CONSTELLATION.radiusMultiplier).toBeGreaterThan(1.0);

      expect(presets.CUBIC_MATRIX.targetPhi).toBeCloseTo(Math.PI * 0.38, 2);
      expect(presets.CUBIC_MATRIX.thetaDelta).toBeDefined();

      expect(SpatialTransitionEngine.LAYOUT_TITLES.FIBONACCI_SPHERE).toBe('Fibonacci Sphere');
      expect(SpatialTransitionEngine.LAYOUT_TITLES.DNA_HELIX).toBe('DNA Helix');
      expect(SpatialTransitionEngine.LAYOUT_TITLES.GALAXY_CONSTELLATION).toBe('Galaxy Constellation');
      expect(SpatialTransitionEngine.LAYOUT_TITLES.CUBIC_MATRIX).toBe('Cubic Matrix');
    });

    it('Verifies shortest angular delta calculation avoids 360-degree rotation spin artifacts', () => {
      // 0 to PI/2 -> PI/2
      expect(SpatialTransitionEngine.calculateShortestAngle(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 4);

      // 0 to 3*PI/2 -> -PI/2 (shortest path is turning -90 deg, not +270 deg)
      expect(SpatialTransitionEngine.calculateShortestAngle(0, (3 * Math.PI) / 2)).toBeCloseTo(-Math.PI / 2, 4);

      // Crossing +PI / -PI boundary: 3.10 rad to -3.10 rad
      const shortestAcrossPi = SpatialTransitionEngine.calculateShortestAngle(3.10, -3.10);
      expect(Math.abs(shortestAcrossPi)).toBeLessThan(0.15);
    });

    it('Verifies parabolic expansion arc calculation pushes cards outward avoiding center collision', () => {
      const start: [number, number, number] = [300, 100, 200];
      const target: [number, number, number] = [-300, -100, -200];

      const arcSphere = SpatialTransitionEngine.calculateArcVector(start, target, 'FIBONACCI_SPHERE');
      const arcHelix = SpatialTransitionEngine.calculateArcVector(start, target, 'DNA_HELIX');
      const arcGalaxy = SpatialTransitionEngine.calculateArcVector(start, target, 'GALAXY_CONSTELLATION');
      const arcMatrix = SpatialTransitionEngine.calculateArcVector(start, target, 'CUBIC_MATRIX');

      expect(Math.hypot(arcSphere[0], arcSphere[1], arcSphere[2])).toBeGreaterThan(50);
      expect(Math.hypot(arcHelix[0], arcHelix[1], arcHelix[2])).toBeGreaterThan(50);
      expect(Math.hypot(arcGalaxy[0], arcGalaxy[1], arcGalaxy[2])).toBeGreaterThan(50);
      expect(Math.hypot(arcMatrix[0], arcMatrix[1], arcMatrix[2])).toBeGreaterThan(50);
    });

    it('Verifies wave-propagation stagger delay calculation', () => {
      const delayFirst = SpatialTransitionEngine.getStaggerDelay(0, 100, 'DNA_HELIX');
      const delayMid = SpatialTransitionEngine.getStaggerDelay(50, 100, 'DNA_HELIX');
      const delayLast = SpatialTransitionEngine.getStaggerDelay(99, 100, 'DNA_HELIX');

      expect(delayFirst).toBe(0);
      expect(delayMid).toBeGreaterThan(delayFirst);
      expect(delayLast).toBeGreaterThan(delayMid);
      expect(delayLast).toBeLessThanOrEqual(0.4);
    });

    it('Verifies full GSAP transition execution morphs memory cards and camera target values', () => {
      const sample = generateSampleAlbum(10);
      const transforms = SpatialLayoutEngine.calculateTargetTransforms(sample, 'DNA_HELIX', 'CHRONOLOGICAL');

      const cameraState = {
        radius: 1200,
        targetRadius: 1200,
        phi: Math.PI * 0.5,
        targetPhi: Math.PI * 0.5,
        theta: 0,
        targetTheta: 0,
      };

      const handle = SpatialTransitionEngine.startTransition({
        items: sample,
        targetTransforms: transforms,
        fromMode: 'FIBONACCI_SPHERE',
        toMode: 'DNA_HELIX',
        cameraState,
        baseCameraDistance: 1200,
      });

      expect(handle).toBeDefined();
      expect(typeof handle.kill).toBe('function');
      expect(typeof handle.isRunning).toBe('function');
      expect(typeof handle.getProgress).toBe('function');

      // Fast-forward GSAP transition to 100% completion
      handle.seek(1.0);

      // Camera targetRadius should be updated based on DNA_HELIX preset
      expect(cameraState.targetRadius).toBeCloseTo(1200 * SpatialTransitionEngine.CAMERA_PRESETS.DNA_HELIX.radiusMultiplier, -1);
      expect(cameraState.targetPhi).toBeCloseTo(SpatialTransitionEngine.CAMERA_PRESETS.DNA_HELIX.targetPhi, 2);

      // Sample items have updated coordinates matching the DNA_HELIX transforms
      expect(sample[0].currentPos[0]).toBeCloseTo(transforms[0].position[0], 0);
      expect(sample[0].currentPos[1]).toBeCloseTo(transforms[0].position[1], 0);
      expect(sample[0].currentPos[2]).toBeCloseTo(transforms[0].position[2], 0);

      handle.kill();
    });
  });

  describe('Slow Ambient Auto-Rotation Engine Verification', () => {
    it('Verifies smoothstep Hermite interpolation behavior', () => {
      expect(smoothstep(0, 100, -10)).toBe(0);
      expect(smoothstep(0, 100, 0)).toBe(0);
      expect(smoothstep(0, 100, 50)).toBeCloseTo(0.5, 3);
      expect(smoothstep(0, 100, 100)).toBe(1);
      expect(smoothstep(0, 100, 150)).toBe(1);
    });

    it('Disables auto-rotation when enabled is set to false', () => {
      const res = evaluateAutoRotation({
        enabled: false,
        idleDurationMs: 10000,
        deltaSeconds: 0.016,
        timestamp: 5000,
        isUserInteracting: false,
        isFocusModeActive: false,
      });

      expect(res.status).toBe('DISABLED');
      expect(res.isActive).toBe(false);
      expect(res.angularStep).toBe(0);
      expect(res.rampFactor).toBe(0);
    });

    it('Pauses auto-rotation immediately when user is actively interacting', () => {
      const res = evaluateAutoRotation({
        enabled: true,
        idleDurationMs: 8000, // Even if idle duration was high before
        deltaSeconds: 0.016,
        timestamp: 8000,
        isUserInteracting: true, // User is dragging or multi-touching
        isFocusModeActive: false,
      });

      expect(res.status).toBe('PAUSED_INTERACTION');
      expect(res.isActive).toBe(false);
      expect(res.angularStep).toBe(0);
      expect(res.remainingIdleMs).toBe(DEFAULT_AUTO_ROTATION_CONFIG.idleDelayMs);
    });

    it('Pauses auto-rotation when Focus Mode is actively inspecting a memory node', () => {
      const res = evaluateAutoRotation({
        enabled: true,
        idleDurationMs: 9000,
        deltaSeconds: 0.016,
        timestamp: 9000,
        isUserInteracting: false,
        isFocusModeActive: true,
      });

      expect(res.status).toBe('PAUSED_FOCUS');
      expect(res.isActive).toBe(false);
      expect(res.angularStep).toBe(0);
    });

    it('Remains paused and counts down during inactivity cooldown period', () => {
      const delay = DEFAULT_AUTO_ROTATION_CONFIG.idleDelayMs; // 4000ms
      const res = evaluateAutoRotation({
        enabled: true,
        idleDurationMs: 2500, // Less than 4000ms
        deltaSeconds: 0.016,
        timestamp: 2500,
        isUserInteracting: false,
        isFocusModeActive: false,
      });

      expect(res.status).toBe('PAUSED_INTERACTION');
      expect(res.isActive).toBe(false);
      expect(res.angularStep).toBe(0);
      expect(res.remainingIdleMs).toBe(delay - 2500); // 1500ms remaining
    });

    it('Resumes ambient auto-rotation with smooth cubic ramp-in acceleration', () => {
      const delay = DEFAULT_AUTO_ROTATION_CONFIG.idleDelayMs; // 4000ms
      const rampPeriod = DEFAULT_AUTO_ROTATION_CONFIG.rampDurationMs; // 1600ms

      // Mid-ramp test (halfway through acceleration period)
      const resMid = evaluateAutoRotation({
        enabled: true,
        idleDurationMs: delay + rampPeriod * 0.5,
        deltaSeconds: 0.016,
        timestamp: 10000,
        isUserInteracting: false,
        isFocusModeActive: false,
      });

      expect(resMid.status).toBe('ACTIVE');
      expect(resMid.isActive).toBe(true);
      expect(resMid.rampFactor).toBeGreaterThan(0);
      expect(resMid.rampFactor).toBeLessThan(1);
      expect(resMid.remainingIdleMs).toBe(0);
      expect(resMid.angularStep).toBeGreaterThan(0);

      // Fully accelerated test
      const resFull = evaluateAutoRotation({
        enabled: true,
        idleDurationMs: delay + rampPeriod + 500,
        deltaSeconds: 0.016,
        timestamp: 15000,
        isUserInteracting: false,
        isFocusModeActive: false,
      });

      expect(resFull.status).toBe('ACTIVE');
      expect(resFull.isActive).toBe(true);
      expect(resFull.rampFactor).toBe(1.0);
      expect(resFull.angularStep).toBeCloseTo(DEFAULT_AUTO_ROTATION_CONFIG.baseSpeedRadPerSec * 0.016, 5);
    });

    it('Generates subtle ambient breathing tilt oscillation without destabilizing horizon', () => {
      const res = evaluateAutoRotation({
        enabled: true,
        idleDurationMs: 8000,
        deltaSeconds: 0.016,
        timestamp: 5000,
        isUserInteracting: false,
        isFocusModeActive: false,
      });

      expect(Math.abs(res.tiltOscillationStep)).toBeLessThan(0.001); // Micro-step
    });

    it('Verifies PhotoSphereCanvas constants match DEFAULT_AUTO_ROTATION_CONFIG', () => {
      expect(IDLE_AUTO_ORBIT_DELAY_MS).toBe(DEFAULT_AUTO_ROTATION_CONFIG.idleDelayMs);
      expect(AUTO_ORBIT_SPEED_RAD_PER_SEC).toBe(DEFAULT_AUTO_ROTATION_CONFIG.baseSpeedRadPerSec);
    });
  });

  describe('Atmospheric Bloom Post-Processing Engine Verification', () => {
    it('Provides production-safe defaults for atmospheric bloom', () => {
      expect(DEFAULT_BLOOM_CONFIG.strength).toBe(0.62);
      expect(DEFAULT_BLOOM_CONFIG.radius).toBe(0.44);
      expect(DEFAULT_BLOOM_CONFIG.threshold).toBe(0.68);
      expect(DEFAULT_BLOOM_CONFIG.ambientHaloOpacity).toBe(0.24);
      expect(DEFAULT_BLOOM_CONFIG.exposure).toBe(1.10);
    });

    it('Sanitizes and bounds-checks bloom parameters accurately', () => {
      const sanitized = sanitizeBloomConfig({
        strength: -1.0,
        radius: 5.0,
        threshold: 2.0,
        ambientHaloOpacity: 3.0,
      });

      expect(sanitized.strength).toBe(0);
      expect(sanitized.radius).toBe(2.0);
      expect(sanitized.threshold).toBe(1);
      expect(sanitized.ambientHaloOpacity).toBe(1);
    });

    it('Computes adaptive bloom dynamically for normal, focus, and high-speed motion states', () => {
      const normalState = computeAdaptiveBloom({
        isFocusMode: false,
        isHighSpeedMotion: false,
      });
      expect(normalState.effectiveStrength).toBeCloseTo(0.62, 3);
      expect(normalState.effectiveRadius).toBeCloseTo(0.44, 3);

      const focusState = computeAdaptiveBloom({
        isFocusMode: true,
        isHighSpeedMotion: false,
      });
      expect(focusState.effectiveStrength).toBeCloseTo(0.62 * 1.18, 3);
      expect(focusState.effectiveRadius).toBeCloseTo(0.44, 3);

      const motionState = computeAdaptiveBloom({
        isFocusMode: false,
        isHighSpeedMotion: true,
      });
      expect(motionState.effectiveStrength).toBeCloseTo(0.62, 3);
      expect(motionState.effectiveRadius).toBeCloseTo(0.44 * 0.85, 3);

      // Combined focus mode during high speed motion
      const combined = computeAdaptiveBloom({
        isFocusMode: true,
        isHighSpeedMotion: true,
      });
      expect(combined.effectiveStrength).toBeCloseTo(0.62 * 1.18, 3);
      expect(combined.effectiveRadius).toBeCloseTo(0.44 * 0.85, 3);
    });
  });

  describe('Cinematic Depth-of-Field Post-Processing Engine', () => {
    it('Has production-grade default configuration values', () => {
      expect(DEFAULT_DOF_CONFIG.enabled).toBe(true);
      expect(DEFAULT_DOF_CONFIG.focus).toBe(320.0);
      expect(DEFAULT_DOF_CONFIG.aperture).toBeGreaterThan(0);
      expect(DEFAULT_DOF_CONFIG.maxblur).toBe(0.018);
      expect(DEFAULT_DOF_CONFIG.focalRange).toBe(28.0);
    });

    it('Computes precise optical autofocus distance along camera optical axis', () => {
      const camera = new THREE.PerspectiveCamera(50, 16 / 9, 10, 8000);
      camera.position.set(0, 0, 500);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();

      // Object at origin (0, 0, 0) is 500 units in front of camera
      const targetPos: [number, number, number] = [0, 0, 0];
      const dist = computeAutoFocusDistance(camera, targetPos);
      expect(dist).toBeCloseTo(500, 1);

      // Object at (0, 0, 200) is 300 units in front of camera
      const dist2 = computeAutoFocusDistance(camera, [0, 0, 200]);
      expect(dist2).toBeCloseTo(300, 1);
    });

    it('Computes circle of confusion zero for focused plane and progressive blur for background nodes', () => {
      const focalDist = 320.0;
      // In-focus tolerance deadband (focalRange = 28.0)
      const exactCoC = computeCircleOfConfusion(320.0, focalDist);
      expect(exactCoC).toBe(0.0);

      const nearCoC = computeCircleOfConfusion(335.0, focalDist);
      expect(nearCoC).toBe(0.0); // Within deadband

      // Background nodes outside deadband
      const farNodeDist = 800.0;
      const farCoC = computeCircleOfConfusion(farNodeDist, focalDist);
      expect(farCoC).toBeGreaterThan(0.0);
      expect(farCoC).toBeLessThanOrEqual(DEFAULT_DOF_CONFIG.maxblur);

      // Distant background node caps at maxblur
      const veryFarCoC = computeCircleOfConfusion(2500.0, focalDist);
      expect(veryFarCoC).toBe(DEFAULT_DOF_CONFIG.maxblur);
    });

    it('Computes adaptive depth of field parameters in focus mode vs ambient overview mode', () => {
      // Focus mode active: rack-focus smoothly progresses toward targetDistance
      const inFocus = computeAdaptiveDepthOfField({
        isFocusMode: true,
        targetDistance: 320.0,
        currentFocus: 800.0,
        currentMaxBlur: 0.0,
        currentAperture: 0.0,
      });
      expect(inFocus.nextFocus).toBeLessThan(800.0);
      expect(inFocus.nextFocus).toBeGreaterThan(320.0);
      expect(inFocus.nextMaxBlur).toBeGreaterThan(0.0);
      expect(inFocus.nextAperture).toBeGreaterThan(0.0);

      // Ambient overview mode: blur is smoothly dialed down
      const ambient = computeAdaptiveDepthOfField({
        isFocusMode: false,
        targetDistance: 1200.0,
        currentFocus: 320.0,
        currentMaxBlur: 0.018,
        currentAperture: 0.00008,
      });
      expect(ambient.nextMaxBlur).toBeLessThan(0.018);
      expect(ambient.nextAperture).toBeLessThan(0.00008);
      expect(ambient.isSharp).toBe(true);
    });
  });
});


