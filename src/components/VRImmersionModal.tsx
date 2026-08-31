/**
 * VRImmersionModal.tsx
 * Dialog providing WebXR Device API immersion triggers, hardware detection,
 * VR controller guidance, and spherical VR preview instructions.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Glasses,
  Headset,
  X,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Compass,
  Cpu,
  Monitor,
  ExternalLink,
  Layers,
  ChevronRight,
  Zap,
  Gauge,
  ShieldCheck,
  Activity,
  Sliders,
} from 'lucide-react';
import { WebXREngine, WebXRSupportStatus } from '../engine/WebXREngine';
import { AudioSynthesizer } from '../engine/AudioSynthesizer';

interface Props {
  isOpen: boolean;
  isVrActive: boolean;
  onClose: () => void;
  onEnterVR: (performanceMode?: boolean, sensitivity?: number) => Promise<void>;
  onExitVR: () => Promise<void>;
  performanceMode?: boolean;
  onTogglePerformanceMode?: (enabled: boolean) => void;
  gestureSensitivity?: number;
  onGestureSensitivityChange?: (sensitivity: number) => void;
}

export const VRImmersionModal: React.FC<Props> = ({
  isOpen,
  isVrActive,
  onClose,
  onEnterVR,
  onExitVR,
  performanceMode = true,
  onTogglePerformanceMode,
  gestureSensitivity = 1.0,
  onGestureSensitivityChange,
}) => {
  const [supportStatus, setSupportStatus] = useState<WebXRSupportStatus>({
    isSupported: false,
    hasHardware: false,
    message: 'Checking WebXR Device API...',
  });
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const [isLaunching, setIsLaunching] = useState<boolean>(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [localPerfMode, setLocalPerfMode] = useState<boolean>(performanceMode);
  const [localSensitivity, setLocalSensitivity] = useState<number>(gestureSensitivity);

  useEffect(() => {
    setLocalPerfMode(performanceMode);
  }, [performanceMode]);

  useEffect(() => {
    setLocalSensitivity(gestureSensitivity);
  }, [gestureSensitivity]);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsChecking(true);
    setLaunchError(null);

    WebXREngine.checkVRSupport().then((status) => {
      if (isMounted) {
        setSupportStatus(status);
        setIsChecking(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTogglePerf = () => {
    const next = !localPerfMode;
    setLocalPerfMode(next);
    onTogglePerformanceMode?.(next);
    AudioSynthesizer.playSearchFilter();
  };

  const handleSensitivityChange = (val: number) => {
    const clamped = Math.max(0.2, Math.min(2.5, Math.round(val * 10) / 10));
    setLocalSensitivity(clamped);
    onGestureSensitivityChange?.(clamped);
  };

  const handlePresetSensitivity = (preset: number) => {
    handleSensitivityChange(preset);
    AudioSynthesizer.playSearchFilter();
  };

  const handleLaunchVR = async () => {
    try {
      setIsLaunching(true);
      setLaunchError(null);
      AudioSynthesizer.playVREnter();
      await onEnterVR(localPerfMode, localSensitivity);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLaunchError(msg);
      AudioSynthesizer.playModalOpen();
    } finally {
      setIsLaunching(false);
    }
  };

  const handleEndVR = async () => {
    try {
      setIsLaunching(true);
      await onExitVR();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLaunchError(msg);
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xl">
        <motion.div
          id="vr-immersion-modal"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl bg-[#090b14]/95 border border-sky-400/30 p-6 sm:p-8 shadow-[0_24px_64px_rgba(0,0,0,0.8),0_0_40px_rgba(56,189,248,0.2)] text-white overflow-y-auto"
        >
          {/* Ambient Glow */}
          <div className="absolute -top-24 -right-24 w-60 h-60 bg-sky-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="flex items-center justify-between pb-5 border-b border-white/10 relative z-10">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-600 flex items-center justify-center shadow-[0_0_24px_rgba(56,189,248,0.4)]">
                <Glasses className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                  <span>WebXR VR Immersion</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono tracking-widest uppercase bg-sky-500/20 text-sky-300 border border-sky-400/30">
                    Spatial 3D
                  </span>
                </h2>
                <p className="text-xs text-white/50 mt-0.5">
                  Full-screen immersive stereoscopic 360° PhotoSphere
                </p>
              </div>
            </div>
            <button
              id="close-vr-modal-btn"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Status Box */}
          <div className="mt-5 p-4 rounded-2xl bg-white/[0.03] border border-white/10 relative z-10 space-y-3">
            <div className="flex items-start gap-3">
              {isChecking ? (
                <div className="w-5 h-5 rounded-full border-2 border-sky-400 border-t-transparent animate-spin flex-shrink-0 mt-0.5" />
              ) : supportStatus.isSupported ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white/90">
                    {isChecking
                      ? 'Probing WebXR Device API...'
                      : supportStatus.isSupported
                      ? 'WebXR VR Headset Ready'
                      : 'WebXR Hardware Status'}
                  </span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                      supportStatus.isSupported
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    }`}
                  >
                    {supportStatus.isSupported ? 'CONNECTED' : 'API READY'}
                  </span>
                </div>
                <p className="text-xs text-white/60 mt-1 leading-relaxed">
                  {supportStatus.message}
                </p>
              </div>
            </div>

            {launchError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{launchError}</span>
              </div>
            )}
          </div>

          {/* VR Performance Mode Toggle Setting */}
          <div
            id="vr-performance-setting-card"
            className="mt-4 p-4 rounded-2xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-sky-400/20 relative z-10 transition-all hover:border-sky-400/40"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                    localPerfMode
                      ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 shadow-[0_0_16px_rgba(251,191,36,0.3)]'
                      : 'bg-white/5 text-white/40 border border-white/10'
                  }`}
                >
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white tracking-tight">
                      VR Performance Mode
                    </span>
                    <span
                      className={`text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                        localPerfMode
                          ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                          : 'bg-white/10 text-white/50 border-white/10'
                      }`}
                    >
                      {localPerfMode ? '90FPS+ Target' : 'Max Quality'}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/60 mt-0.5">
                    Streamlines GPU load for consistent 90–120Hz refresh rates on standalone mobile VR headsets.
                  </p>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                id="vr-performance-mode-toggle"
                type="button"
                role="switch"
                aria-checked={localPerfMode}
                onClick={handleTogglePerf}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  localPerfMode ? 'bg-amber-400' : 'bg-white/20'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-black shadow ring-0 transition duration-200 ease-in-out ${
                    localPerfMode ? 'translate-x-5 bg-black' : 'translate-x-0 bg-white'
                  }`}
                />
              </button>
            </div>

            {/* Performance Mode Optimization Details */}
            <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center gap-2 text-white/70">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    localPerfMode ? 'bg-amber-400 animate-pulse' : 'bg-white/20'
                  }`}
                />
                <span>
                  {localPerfMode
                    ? 'Particle density: 250 points (79% lighter)'
                    : 'Particle density: 1,200 points (full density)'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-white/70">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    localPerfMode ? 'bg-amber-400' : 'bg-white/20'
                  }`}
                />
                <span>
                  {localPerfMode
                    ? 'Post-processing shaders: Bypassed for low latency'
                    : 'Post-processing: Multi-pass TAA active'}
                </span>
              </div>
            </div>
          </div>

          {/* Gesture Sensitivity Slider Setting */}
          <div
            id="vr-gesture-sensitivity-card"
            className="mt-3 p-4 rounded-2xl bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-sky-400/20 relative z-10 transition-all hover:border-sky-400/40"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-400/20 text-sky-300 border border-sky-400/40 shadow-[0_0_16px_rgba(56,189,248,0.25)] flex items-center justify-center">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white tracking-tight">
                      Gesture Sensitivity
                    </span>
                    <span
                      id="vr-gesture-sensitivity-badge"
                      className={`text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                        localSensitivity <= 0.7
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                          : localSensitivity <= 1.2
                          ? 'bg-sky-500/20 text-sky-300 border-sky-400/40'
                          : localSensitivity <= 1.7
                          ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                          : 'bg-purple-500/20 text-purple-300 border-purple-400/40'
                      }`}
                    >
                      {localSensitivity <= 0.7
                        ? `Precision (${localSensitivity.toFixed(1)}x)`
                        : localSensitivity <= 1.2
                        ? `Balanced (${localSensitivity.toFixed(1)}x)`
                        : localSensitivity <= 1.7
                        ? `Responsive (${localSensitivity.toFixed(1)}x)`
                        : `Hyper Agility (${localSensitivity.toFixed(1)}x)`}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/60 mt-0.5">
                    Controls responsiveness of thumbsticks and 6DoF hand grip squeeze when rotating or scaling the memory sphere.
                  </p>
                </div>
              </div>
            </div>

            {/* Slider Control */}
            <div className="mt-3 space-y-2">
              <div className="relative flex items-center">
                <input
                  id="vr-gesture-sensitivity-slider"
                  type="range"
                  min="0.2"
                  max="2.5"
                  step="0.1"
                  value={localSensitivity}
                  onChange={(e) => handleSensitivityChange(parseFloat(e.target.value))}
                  aria-label="VR Gesture Sensitivity Slider"
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                />
              </div>

              {/* Slider Scale Labels */}
              <div className="flex justify-between text-[10px] font-mono text-white/50 px-0.5">
                <span>0.2x (Fine)</span>
                <span>1.0x (Default)</span>
                <span>2.5x (Fast)</span>
              </div>

              {/* Quick Preset Buttons */}
              <div className="pt-2 flex flex-wrap gap-1.5">
                {[
                  { label: '0.5x Fine', val: 0.5 },
                  { label: '1.0x Standard', val: 1.0 },
                  { label: '1.5x Agile', val: 1.5 },
                  { label: '2.0x Hyper', val: 2.0 },
                ].map((preset) => {
                  const isActive = Math.abs(localSensitivity - preset.val) < 0.05;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handlePresetSensitivity(preset.val)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer border ${
                        isActive
                          ? 'bg-sky-400/25 text-sky-200 border-sky-400/60 shadow-[0_0_10px_rgba(56,189,248,0.3)]'
                          : 'bg-white/[0.04] text-white/70 border-white/10 hover:bg-white/[0.08] hover:text-white'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Features Grid */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5 relative z-10 text-xs">
            <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-1.5">
              <div className="w-7 h-7 rounded-xl bg-sky-500/15 text-sky-300 flex items-center justify-center">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <span className="font-semibold text-white">Controller Wrist Menu</span>
              <span className="text-[11px] text-white/50">
                Interactive spatial palette on your controller to switch 3D layouts & search in VR.
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-1.5">
              <div className="w-7 h-7 rounded-xl bg-indigo-500/15 text-indigo-300 flex items-center justify-center">
                <Cpu className="w-3.5 h-3.5" />
              </div>
              <span className="font-semibold text-white">Laser Controllers</span>
              <span className="text-[11px] text-white/50">
                Point and trigger VR controllers to lock & inspect photos with haptic click feedback.
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col gap-1.5">
              <div className="w-7 h-7 rounded-xl bg-purple-500/15 text-purple-300 flex items-center justify-center">
                <Compass className="w-3.5 h-3.5" />
              </div>
              <span className="font-semibold text-white">6DoF Spatial Orbit</span>
              <span className="text-[11px] text-white/50">
                Thumbstick rotation and grip pinch to zoom into holographic memory clusters.
              </span>
            </div>
          </div>

          {/* Supported Headsets Guide */}
          <div className="mt-4 p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 text-[11px] text-white/60 space-y-1.5 relative z-10">
            <span className="text-white/80 font-medium flex items-center gap-1.5">
              <Headset className="w-3.5 h-3.5 text-sky-400" />
              Compatible VR Devices & Platforms:
            </span>
            <p className="leading-relaxed">
              • <strong>Meta Quest 2 / 3 / 3S / Pro</strong> (Meta Quest Browser)
              <br />
              • <strong>Apple Vision Pro</strong> (Safari with WebXR enabled)
              <br />
              • <strong>Pico 4 / Ultra</strong> (Pico Browser)
              <br />
              • <strong>HTC Vive / Valve Index</strong> (Chrome / Edge with SteamVR)
            </p>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex flex-col sm:flex-row items-center gap-3 relative z-10">
            {isVrActive ? (
              <button
                id="exit-vr-session-btn"
                onClick={handleEndVR}
                disabled={isLaunching}
                className="w-full sm:flex-1 h-12 rounded-2xl bg-red-500/20 hover:bg-red-500/30 border border-red-400/40 text-red-300 font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>Exit VR Immersion</span>
              </button>
            ) : (
              <button
                id="enter-vr-session-btn"
                onClick={handleLaunchVR}
                disabled={isLaunching}
                className="w-full sm:flex-1 h-12 rounded-2xl bg-gradient-to-r from-sky-400 to-indigo-500 hover:from-sky-300 hover:to-indigo-400 text-black font-bold text-sm flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(56,189,248,0.4)] transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
              >
                {isLaunching ? (
                  <div className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                ) : (
                  <Glasses className="w-4 h-4" />
                )}
                <span>Launch VR Immersion</span>
              </button>
            )}

            <button
              id="cancel-vr-modal-btn"
              onClick={onClose}
              className="w-full sm:w-auto px-6 h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-sm font-medium transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

