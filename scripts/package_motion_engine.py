import os
import zipfile

def package_motion_engine():
    zip_path = os.path.abspath('public/photosphere-motion-engine.zip')
    os.makedirs(os.path.dirname(zip_path), exist_ok=True)

    files_to_pack = [
        'src/components/PhotoSphereCanvas.tsx',
        'src/engine/SpatialTransitionEngine.ts',
        'src/math/SpatialLayoutEngine.ts',
        'src/engine/FocusTrailEngine.ts',
        'src/engine/TextureManager.ts',
        'src/engine/WebXREngine.ts',
        'src/engine/VRControllerMenu.ts',
        'src/engine/AutoRotationEngine.ts',
        'src/engine/SpatialAudioProcessor.ts',
        'src/engine/AudioSynthesizer.ts',
        'src/engine/BackgroundThemeAnalyzer.ts',
        'src/hooks/useBackgroundThemeAnalyzer.ts',
        'src/components/FocusModeDock.tsx',
        'src/components/BatchActionBar.tsx',
        'src/components/GlassmorphicHUD.tsx',
        'src/types.ts',
        'src/index.css',
    ]

    readme_content = """# PhotoSphere 3D: Interactivity, Motion, & Visual Engine
### Core Architecture Package for Spatial Mechanics & Frame-Rate Performance

This package contains all files governing 3D sphere interactivity, gesture kinematics, 60-120 FPS animation pipelines, visual materials, and GSAP/Framer Motion spatial transitions.

---

## 1. Directory Structure

### A. Interactivity & Input Handling
- **`src/components/PhotoSphereCanvas.tsx`**
  - **Multi-Touch Gestures**: Computes pinch-to-zoom distance delta and clamping, two-finger rotational delta with angular boundary wrapping, and midpoint 2D translation projected into camera view-plane 3D pan offsets.
  - **Pointer & Inertia Kinematics**: Implements drag tracking, momentum coasting (0.92 inertia factor, lerp speed 0.08), and 5-second idle detection that triggers smooth auto-orbit kinematics.
  - **Raycasting & Card Picking**: Raycasts through Three.js camera frustum to pick individual cards, handles hover highlights, focus inspection, and double-click framing.
  - **Screen-Space Lasso Selection**: High-performance 2D canvas overlay (`#photosphere-lasso-overlay`) running point-in-polygon tests to batch-select memory cards across the screen.

- **`src/engine/WebXREngine.ts` & `src/engine/VRControllerMenu.ts`**
  - Spatial immersion for VR headsets: 6-DoF controller tracking, laser pointer raycasting line, thumbstick camera flight with deadzone filtering, and a floating 3D holographic wrist menu.

- **`src/components/FocusModeDock.tsx` & `src/components/BatchActionBar.tsx`**
  - HUD dock for stepped navigation through focused nodes, autoplay sequences, and multi-selection batch operations.

---

### B. Motion, Transitions, & Frame-Rate Optimization
- **`src/engine/SpatialTransitionEngine.ts`**
  - **GSAP Spatial Morphing**: High-performance coordinate morphing between `FIBONACCI_SPHERE`, `DNA_HELIX`, `GALAXY_CONSTELLATION`, and `CUBIC_MATRIX`.
  - **Parabolic Bloom Arcs**: Displaces cards outward during mid-flight so nodes blossom smoothly instead of colliding through origin (0, 0, 0).
  - **Euler Shortest-Path Normalization**: Wraps angular deltas to [-pi, pi] to prevent 360-degree rotation spin artifacts.
  - **Wave-Propagation Stagger**: Cascades transitions with natural rippling delays (golden spiral ripple for Sphere, ascending ladder for DNA Helix, radial wave for Galaxy, volume cluster pulse for Matrix).
  - **Cinematic Camera Choreography**: Eases camera orbital tilt (`targetPhi`), radius (`targetRadius`), and perspective angles during formation changes.

- **`src/math/SpatialLayoutEngine.ts`**
  - Dynamic mathematical formulas generating 3D coordinates and Euler rotations for all 4 spatial formations.
  - Dynamic radius scaling formula ($R = \\text{baseRadius} \\times \\sqrt{N / 60}$) and perspective FOV camera distance calculation.

- **`src/engine/BackgroundThemeAnalyzer.ts` & `src/hooks/useBackgroundThemeAnalyzer.ts`**
  - Cooperative time-slicing (24ms idle execution slices) ensuring metadata analysis never starves the main thread.
  - Batched progress events with 250ms debouncing, preventing React component re-render churn while rotating.

- **Frame Rate Protection Architecture in `PhotoSphereCanvas.tsx`**:
  - **Decoupled Render Loop**: Animation loop runs continuously via `requestAnimationFrame` reading mutable refs (search, focus, selection) without tearing down during React state changes.
  - **Hardware MSAA & Clamped DPR**: Replaced heavy multi-pass offscreen renderers with native hardware multi-sampling and 1.5x pixel ratio clamp, eliminating high-DPI GPU fill-rate drops.
  - **Draw Call Culling**: Bypasses rendering transparent card halo meshes whenever their opacity falls below threshold.

---

### C. Visuals as the Sphere Rotates
- **`src/engine/TextureManager.ts`**
  - Procedural canvas gradient fallbacks and real image loader.
  - Generates mipmaps and configures anisotropic texture filtering (up to 8x) for crisp oblique angles during orbit.
  - LRU memory cache preventing WebGL texture leaks.

- **`src/engine/FocusTrailEngine.ts`**
  - Constructs smooth 3D Catmull-Rom cubic spline paths connecting sequential focused memory nodes.
  - Animated glowing energy pulse traveling along the normalized spline.
  - Waypoint beacon rings with progressive recency color shifting and distance-attenuated alphas.

- **`src/engine/SpatialAudioProcessor.ts` & `src/engine/AudioSynthesizer.ts`**
  - 3D spatial audio listener orientation tracking camera position and forward vector.
  - Panning (-1.0 to +1.0), distance attenuation, and air-absorption low-pass filtering throttled to 25 Hz.

- **`src/index.css`**
  - Hardware compositor layer promotion (`contain: strict`, `contain: layout size paint`, `transform: translateZ(0)`, `will-change: transform`).
  - Dark void aesthetic and touch-action suppression (`touch-action: none`) preventing mobile browser pull-to-refresh interference.

- **`src/types.ts`**
  - Shared TypeScript interfaces for 3D coordinates, layout modes, camera states, and gesture parameters.

---

## 2. Dependencies
Ensure your project contains:
- `three` & `@types/three`
- `gsap`
- `motion` (or `framer-motion`)
- `lucide-react`
- `react` (v18+)

---
Generated by PhotoSphere 3D Spatial Memory Engine.
"""

    with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('README.md', readme_content.strip())
        for f in files_to_pack:
            if os.path.exists(f):
                zf.write(f, f)
                print(f"Added: {f}")
            else:
                print(f"Missing file: {f}")

    print(f"Archive successfully generated at: {zip_path}")
    print(f"Size: {os.path.getsize(zip_path)} bytes")

if __name__ == '__main__':
    package_motion_engine()
