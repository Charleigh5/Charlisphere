/**
 * GlassmorphicHUD.tsx
 * Immersive UI Spatial Workbench HUD with layout switchers, sub-5ms vector NLP search,
 * orbital parameter rails, telemetry readout, and tri-modal quick hotkeys.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Globe,
  Dna,
  Sparkles,
  Grid3X3,
  Search,
  Clock,
  MapPin,
  Palette,
  Users,
  Brain,
  Volume2,
  VolumeX,
  Upload,
  Layers,
  Info,
  Maximize2,
  Minimize2,
  Camera,
  Activity,
  Flame,
  CheckSquare,
  Square,
  Glasses,
  Mic,
  MicOff,
  Route,
  Download,
  Orbit,
  ScanText,
  Home,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Layout3DMode, SpatialSortMode, EngineStats } from '../types';
import { AudioSynthesizer } from '../engine/AudioSynthesizer';
import { auth, onAuthStateChanged, User } from '../services/firebase';
import { useVoiceSearch } from '../hooks/useVoiceSearch';
import { ThemeAnalyzerProgress } from '../engine/BackgroundThemeAnalyzer';
import { SpatialControlsDrawer } from './SpatialControlsDrawer';
import { SpatialTransitionEngine } from '../engine/SpatialTransitionEngine';

interface Props {
  layoutMode: Layout3DMode;
  sortMode: SpatialSortMode;
  searchQuery: string;
  stats: EngineStats;
  selectedCount: number;
  activeSourceName?: string;
  showClusterLabels: boolean;
  isVrActive?: boolean;
  themeProgress?: ThemeAnalyzerProgress;
  topThemes?: Array<{ theme: string; count: number }>;
  onTriggerReanalysis?: () => void;
  onToggleClusterLabels: () => void;
  onToggleVR: () => void;
  onLayoutChange: (mode: Layout3DMode) => void;
  onSortChange: (mode: SpatialSortMode) => void;
  onSearchChange: (query: string) => void;
  onOpenGooglePhotos?: () => void;
  onOpenLocalUpload: () => void;
  onPresetCountChange: (count: number) => void;
  onResetCamera: () => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  showFocusTrail?: boolean;
  trailCount?: number;
  onToggleFocusTrail?: () => void;
  onClearTrail?: () => void;
  autoRotateEnabled?: boolean;
  onToggleAutoRotate?: () => void;
  bloomEnabled?: boolean;
  onToggleBloom?: () => void;
  depthOfFieldEnabled?: boolean;
  onToggleDepthOfField?: () => void;
  showHoloOverlays?: boolean;
  onToggleHoloOverlays?: () => void;
  isFooterCollapsed?: boolean;
  onToggleFooterCollapse?: (collapsed: boolean) => void;
}

export const GlassmorphicHUD: React.FC<Props> = ({
  layoutMode,
  sortMode,
  searchQuery,
  stats,
  selectedCount,
  activeSourceName,
  showClusterLabels,
  isVrActive = false,
  themeProgress,
  topThemes = [],
  onTriggerReanalysis,
  onToggleClusterLabels,
  onToggleVR,
  onLayoutChange,
  onSortChange,
  onSearchChange,
  onOpenGooglePhotos,
  onOpenLocalUpload,
  onPresetCountChange,
  onResetCamera,
  onSelectAll,
  onClearSelection,
  showFocusTrail = true,
  trailCount = 0,
  onToggleFocusTrail,
  onClearTrail,
  autoRotateEnabled = true,
  onToggleAutoRotate,
  bloomEnabled = true,
  onToggleBloom,
  depthOfFieldEnabled = true,
  onToggleDepthOfField,
  showHoloOverlays = true,
  onToggleHoloOverlays,
  isFooterCollapsed: controlledFooterCollapsed,
  onToggleFooterCollapse,
}) => {
  const [isMuted, setIsMuted] = useState(AudioSynthesizer.getMuted());
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isControlsDrawerOpen, setIsControlsDrawerOpen] = useState(false);
  const [localFooterCollapsed, setLocalFooterCollapsed] = useState(false);
  const isFooterCollapsed = controlledFooterCollapsed !== undefined ? controlledFooterCollapsed : localFooterCollapsed;
  const handleSetFooterCollapsed = (collapsed: boolean) => {
    setLocalFooterCollapsed(collapsed);
    onToggleFooterCollapse?.(collapsed);
  };
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    isSupported: isVoiceSupported,
    isListening,
    status: voiceStatus,
    errorMessage: voiceError,
    interimText,
    feedbackBadge,
    toggleListening,
  } = useVoiceSearch({
    onSearchQuery: onSearchChange,
    onLayoutChange,
    onSortChange,
    onResetCamera,
    onToggleThemes: onToggleClusterLabels,
    onToggleVR,
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setCurrentUser(u);
    });
    return () => unsub();
  }, []);

  // Global Keyboard Shortcuts (Cmd+K / '/' for search, 1-4 for layout, Esc dismiss)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === 'Escape') {
        searchInputRef.current?.blur();
        setShowStatsModal(false);
        return;
      }
      if (document.activeElement === searchInputRef.current) return;

      if (e.key === '1') onLayoutChange('FIBONACCI_SPHERE');
      if (e.key === '2') onLayoutChange('DNA_HELIX');
      if (e.key === '3') onLayoutChange('GALAXY_CONSTELLATION');
      if (e.key === '4') onLayoutChange('CUBIC_MATRIX');
      if (e.key === '5') onLayoutChange('STRUCTURED_SPHERE');
      if (e.key === '6') onLayoutChange('PLANAR_GRID');
      if (e.key === '7') onLayoutChange('CYLINDER_GALLERY');
      if (e.key === '8') onLayoutChange('RING_CAROUSEL');
      if (e.key === 't' || e.key === 'T') onToggleClusterLabels();
      if (e.key === 'v' || e.key === 'V') onToggleVR();
      if (e.key === 'o' || e.key === 'O') onToggleAutoRotate?.();
      if (e.key === 'm' || e.key === 'M') setIsControlsDrawerOpen((prev) => !prev);
      if (e.key === 'c' || e.key === 'C') handleSetFooterCollapsed(!isFooterCollapsed);
      if (e.key === 'r' || e.key === 'R') onResetCamera();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onLayoutChange, onToggleClusterLabels, onToggleVR, onToggleAutoRotate, onResetCamera, isFooterCollapsed]);

  const toggleMute = () => {
    const muted = AudioSynthesizer.toggleMute();
    setIsMuted(muted);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between overflow-hidden">
      {/* Top Header Bar - Immersive UI Specification */}
      <header className="pointer-events-auto z-10 flex justify-between items-center px-4 sm:px-6 py-2 sm:py-2.5 h-[52px] sm:h-[56px] border-b border-white/[0.08] bg-black/40 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <div className="w-8 h-8 bg-gradient-to-br from-[#38bdf8] to-[#818cf8] rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(56,189,248,0.35)] shrink-0">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xs sm:text-[13px] font-bold tracking-[0.2em] uppercase text-white/90 leading-tight">
              Photo-Sphere
            </h1>
            <p className="text-[9px] sm:text-[10px] text-[#38bdf8] font-mono uppercase tracking-wider truncate max-w-[150px] sm:max-w-[260px] leading-tight">
              {activeSourceName || 'Spatial Runtime v1.0.0-PROD'}
            </p>
          </div>
        </div>

        {/* Status & Quick Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden sm:flex flex-col items-end leading-tight">
            <span className="text-[9px] uppercase tracking-widest text-white/40">Engine</span>
            <span className="text-[10px] font-mono text-[#4ade80] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse"></span>
              ACTIVE / {stats.fps} FPS
            </span>
          </div>

          <div className="hidden sm:block w-[1px] h-6 bg-white/10" />

          {/* Primary Action: Upload Photos (Local Device & Batches) */}
          <button
            id="photosphere-btn-upload-top"
            onClick={onOpenLocalUpload}
            className="px-2.5 sm:px-3 py-1 sm:py-1.5 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 hover:from-emerald-500/30 hover:to-teal-500/30 border border-emerald-500/40 rounded-full text-[10px] sm:text-[11px] uppercase tracking-wider text-emerald-300 hover:text-white transition-all flex items-center gap-1.5 shadow-sm shadow-emerald-500/20 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-semibold">Upload Photos</span>
          </button>

          {/* Consolidated Matrix Controls & Spatial Shapes Drawer Trigger */}
          <button
            id="photosphere-btn-matrix-drawer"
            onClick={() => setIsControlsDrawerOpen(true)}
            title="Open Consolidated Spatial Controls, Sorts & Shapes Menu (Key: M)"
            className="px-2.5 sm:px-3 py-1 rounded-full border text-[10px] sm:text-[11px] font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer bg-gradient-to-r from-sky-500/20 to-indigo-500/20 hover:from-sky-500/30 hover:to-indigo-500/30 border-sky-400/50 text-sky-200 hover:text-white shadow-[0_0_15px_rgba(56,189,248,0.25)]"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />
            <span className="font-semibold">Controls</span>
            <span className="hidden md:inline px-1.5 py-0.2 rounded-full bg-white/10 text-[9px] text-white/80">
              {SpatialTransitionEngine.LAYOUT_TITLES[layoutMode] || layoutMode}
            </span>
          </button>

          {/* Center Sphere Home Button - Equal Spacing All Around */}
          <button
            id="photosphere-btn-center-home"
            onClick={onResetCamera}
            title="Center Sphere: Default Home Location with Equal Black Space on All 4 Edges (Key: R)"
            className="px-2.5 sm:px-3 py-1 rounded-full border text-[10px] sm:text-[11px] font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/15 hover:border-sky-400/40"
          >
            <Home className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Center</span>
          </button>

          {/* Batch Selection Action */}
          {stats.photoCount > 0 && (
            <button
              id="photosphere-btn-batch-select-all"
              onClick={() => {
                if (selectedCount > 0) {
                  onClearSelection?.();
                } else {
                  onSelectAll?.();
                }
              }}
              className={`px-2.5 sm:px-3 py-1 border rounded-full text-[10px] sm:text-[11px] font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedCount > 0
                  ? 'bg-[#38bdf8]/20 border-[#38bdf8]/50 text-[#38bdf8]'
                  : 'bg-white/5 border-white/10 text-white/60 hover:text-white hover:bg-white/10'
              }`}
              title={selectedCount > 0 ? 'Clear batch selection' : 'Select all photos in matrix'}
            >
              {selectedCount > 0 ? (
                <CheckSquare className="w-3.5 h-3.5 text-[#38bdf8]" />
              ) : (
                <Square className="w-3.5 h-3.5 text-white/40" />
              )}
              <span className="hidden sm:inline">
                {selectedCount > 0 ? `Selected (${selectedCount})` : `Select All (${stats.photoCount})`}
              </span>
            </button>
          )}

          {/* 3D Cluster Theme Labels Toggle */}
          <button
            id="photosphere-btn-cluster-labels"
            onClick={onToggleClusterLabels}
            title={showClusterLabels ? 'Hide 3D Cluster Theme Labels (Key: T)' : 'Show 3D Cluster Theme Labels (Key: T)'}
            className={`px-2.5 sm:px-3 py-1 rounded-full border text-[10px] sm:text-[11px] font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
              showClusterLabels
                ? 'bg-[#38bdf8]/20 border-[#38bdf8]/50 text-[#38bdf8] shadow-[0_0_14px_rgba(56,189,248,0.3)]'
                : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10'
            }`}
          >
            <Sparkles className={`w-3.5 h-3.5 ${showClusterLabels ? 'text-[#38bdf8] animate-pulse' : 'text-white/40'}`} />
            <span className="hidden lg:inline">3D Themes</span>
            <span className={`w-1.5 h-1.5 rounded-full ${showClusterLabels ? 'bg-[#38bdf8]' : 'bg-white/20'}`} />
          </button>

          {/* 3D Navigation Focus Trail Toggle */}
          <div className="flex items-center gap-1">
            <button
              id="photosphere-btn-focus-trail"
              onClick={onToggleFocusTrail}
              title={
                showFocusTrail
                  ? `Hide 3D Navigation Focus Trail (Key: N) • ${trailCount || 0} visited waypoints`
                  : 'Show 3D Navigation Focus Trail (Key: N)'
              }
              className={`px-2.5 sm:px-3 py-1 rounded-full border text-[10px] sm:text-[11px] font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                showFocusTrail
                  ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-300 shadow-[0_0_14px_rgba(56,189,248,0.25)]'
                  : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10'
              }`}
            >
              <Route className={`w-3.5 h-3.5 ${showFocusTrail ? 'text-cyan-400' : 'text-white/40'}`} />
              <span className="hidden lg:inline">Trail</span>
              {Boolean(trailCount && trailCount > 1) && (
                <span className="px-1.5 py-0.2 rounded-full bg-cyan-400/25 text-cyan-200 text-[9px] font-bold">
                  {trailCount}
                </span>
              )}
              <span className={`w-1.5 h-1.5 rounded-full ${showFocusTrail ? 'bg-cyan-400' : 'bg-white/20'}`} />
            </button>
            {Boolean(trailCount && trailCount > 1 && onClearTrail) && (
              <button
                id="photosphere-btn-clear-trail"
                onClick={onClearTrail}
                title="Clear 3D Navigation Focus Trail"
                className="w-5 h-5 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-white/40 hover:text-white flex items-center justify-center text-[10px] transition-colors cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Subtle 3D Holographic Metadata Overlays Toggle */}
          <button
            id="photosphere-btn-holo-overlays"
            onClick={onToggleHoloOverlays}
            title={
              showHoloOverlays
                ? 'Hide 3D Holographic Metadata Overlays on Selected Nodes (Key: H)'
                : 'Show 3D Holographic Metadata Overlays on Selected Nodes (Key: H)'
            }
            className={`px-2.5 sm:px-3 py-1 rounded-full border text-[10px] sm:text-[11px] font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
              showHoloOverlays
                ? 'bg-sky-500/20 border-sky-400/50 text-sky-300 shadow-[0_0_14px_rgba(56,189,248,0.3)]'
                : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10'
            }`}
          >
            <ScanText className={`w-3.5 h-3.5 ${showHoloOverlays ? 'text-sky-400' : 'text-white/40'}`} />
            <span className="hidden lg:inline">Holo Overlays</span>
            <span className={`w-1.5 h-1.5 rounded-full ${showHoloOverlays ? 'bg-sky-400' : 'bg-white/20'}`} />
          </button>

          {/* WebXR VR Immersion Toggle */}
          <button
            id="photosphere-btn-vr-toggle"
            onClick={onToggleVR}
            title={isVrActive ? 'Exit WebXR VR Immersion (Key: V)' : 'Enter WebXR VR Immersion (Key: V)'}
            className={`px-2.5 sm:px-3 py-1 rounded-full border text-[10px] sm:text-[11px] font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
              isVrActive
                ? 'bg-gradient-to-r from-sky-400 to-indigo-500 text-black border-sky-300 font-bold shadow-[0_0_18px_rgba(56,189,248,0.5)] scale-105'
                : 'bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10 hover:border-sky-400/40'
            }`}
          >
            <Glasses className={`w-3.5 h-3.5 ${isVrActive ? 'text-black animate-pulse' : 'text-sky-400'}`} />
            <span className="hidden sm:inline font-semibold">VR</span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isVrActive ? 'bg-black' : 'bg-sky-400'
              }`}
            />
          </button>

          {/* Quick Utility Icons */}
          <div className="flex items-center gap-1">
            {/* Ambient Auto-Rotation Toggle */}
            <button
              id="photosphere-btn-auto-rotate"
              onClick={onToggleAutoRotate}
              title={
                !autoRotateEnabled
                  ? 'Enable Ambient Auto-Rotation (Key: O)'
                  : stats.autoRotationStatus === 'ACTIVE'
                  ? 'Ambient Auto-Rotation: Active (Key: O)'
                  : stats.autoRotationStatus === 'PAUSED_INTERACTION'
                  ? 'Ambient Auto-Rotation: Paused (User interacting) (Key: O)'
                  : 'Ambient Auto-Rotation: Paused in Focus Mode (Key: O)'
              }
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
                !autoRotateEnabled
                  ? 'bg-white/5 border-white/10 text-white/30 hover:text-white/70 hover:bg-white/10'
                  : stats.autoRotationStatus === 'ACTIVE'
                  ? 'bg-sky-500/15 border-sky-400/50 text-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.3)]'
                  : 'bg-amber-500/15 border-amber-400/40 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
              }`}
            >
              <Orbit
                className={`w-3.5 h-3.5 transition-transform ${
                  autoRotateEnabled && stats.autoRotationStatus === 'ACTIVE'
                    ? 'animate-[spin_16s_linear_infinite]'
                    : ''
                }`}
              />
            </button>

            {/* Atmospheric Bloom Glow Post-Processing Toggle */}
            <button
              id="photosphere-btn-bloom"
              onClick={onToggleBloom}
              title={
                bloomEnabled
                  ? 'Atmospheric Bloom Glow: Active (Key: B)'
                  : 'Atmospheric Bloom Glow: Disabled (Key: B)'
              }
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
                bloomEnabled
                  ? 'bg-amber-400/15 border-amber-400/50 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.35)]'
                  : 'bg-white/5 border-white/10 text-white/30 hover:text-white/70 hover:bg-white/10'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>

            {/* Cinematic Optical Depth-of-Field (Autofocus Bokeh) Post-Processing Toggle */}
            <button
              id="photosphere-btn-dof"
              onClick={onToggleDepthOfField}
              title={
                depthOfFieldEnabled
                  ? 'Cinematic Depth-of-Field: Active (Key: F)'
                  : 'Cinematic Depth-of-Field: Disabled (Key: F)'
              }
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
                depthOfFieldEnabled
                  ? 'bg-emerald-400/15 border-emerald-400/50 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.35)]'
                  : 'bg-white/5 border-white/10 text-white/30 hover:text-white/70 hover:bg-white/10'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
            </button>

            {/* Download Motion & Interactivity Engine ZIP */}
            <a
              id="photosphere-btn-download-engine"
              href="/photosphere-motion-engine.zip"
              download="photosphere-motion-engine.zip"
              title="Download 3D Motion, Interactivity & Visuals Engine (ZIP)"
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-cyan-500/10 hover:bg-cyan-500/25 border border-cyan-400/30 flex items-center justify-center text-cyan-300 hover:text-white transition-all shadow-[0_0_10px_rgba(6,182,212,0.2)] cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
            </a>

            <button
              id="photosphere-btn-audio"
              onClick={toggleMute}
              title={isMuted ? 'Unmute Spatial Audio' : 'Mute Spatial Audio'}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5 text-white/30" /> : <Volume2 className="w-3.5 h-3.5 text-[#38bdf8]" />}
            </button>

            <button
              id="photosphere-btn-stats"
              onClick={() => setShowStatsModal(!showStatsModal)}
              title="Mathematical Density Telemetry"
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <Info className="w-3.5 h-3.5" />
            </button>

            <button
              id="photosphere-btn-fullscreen"
              onClick={toggleFullscreen}
              title="Toggle Fullscreen"
              className="hidden lg:flex w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/5 border border-white/10 items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Left Parameters Vertical Rail - Hidden to keep viewport completely unobstructed */}
      <aside className="hidden">
        <div className="flex flex-col gap-2">
          <span className="text-[9px] uppercase tracking-[0.2em] text-white/30 [writing-mode:vertical-rl] rotate-180 mb-2 font-mono">
            Parameters
          </span>
          <div className="flex flex-col gap-4 font-mono text-[10px]">
            <div className="group cursor-help" title="Constant Surface Density Sphere Radius">
              <span className="text-white/40">R(N)</span>
              <br />
              <span className="text-[#38bdf8] font-semibold">{stats.sphereRadius.toFixed(1)}px</span>
            </div>
            <div className="group cursor-help" title="Active 3D Memory Nodes Count">
              <span className="text-white/40">NODES</span>
              <br />
              <span className="text-white font-semibold">{stats.photoCount} items</span>
            </div>
            <div className="group cursor-help" title="Vector NLP Sub-5ms Latency">
              <span className="text-white/40">NLP LATENCY</span>
              <br />
              <span className="text-[#fbbf24] font-semibold">{stats.searchLatencyMs.toFixed(1)} ms</span>
            </div>
            <div className="group cursor-help" title="Camera Coordinate Distance">
              <span className="text-white/40">CAM DIST</span>
              <br />
              <span className="text-indigo-400 font-semibold">{stats.cameraDistance}px</span>
            </div>
          </div>
        </div>

        {/* Quick Density Presets */}
        <div className="flex flex-col gap-1.5 pt-2 border-t border-white/10">
          <span className="text-[8px] uppercase tracking-wider text-white/30 font-mono">Density N</span>
          {[30, 120, 360, 1000].map((n) => (
            <button
              key={n}
              onClick={() => onPresetCountChange(n)}
              className={`px-2 py-1 rounded text-[10px] font-mono transition-all text-left ${
                stats.photoCount === n
                  ? 'bg-[#38bdf8]/20 text-[#38bdf8] font-bold border border-[#38bdf8]/40'
                  : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              N={n}
            </button>
          ))}
        </div>

        {/* 3D Theme Cluster Labels Switcher */}
        <div className="flex flex-col gap-1.5 pt-2 border-t border-white/10 font-mono text-[10px]">
          <span className="text-[8px] uppercase tracking-wider text-white/30 font-mono">3D Theme Labels</span>
          <button
            onClick={onToggleClusterLabels}
            className={`px-2 py-1 rounded text-[10px] font-bold transition-all text-left flex items-center justify-between ${
              showClusterLabels
                ? 'bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/40'
                : 'text-white/40 hover:text-white hover:bg-white/5 border border-white/5'
            }`}
          >
            <span>Clusters</span>
            <span className="text-[9px] uppercase tracking-wider">{showClusterLabels ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </aside>

      {/* Right Layout Engine Selector Dock - Hidden from viewport center space */}
      <aside className="hidden">
        <div className="flex flex-col gap-2.5 p-2 bg-white/5 border border-white/10 rounded-full backdrop-blur-lg shadow-2xl">
          {[
            {
              mode: 'STRUCTURED_SPHERE',
              title: 'Structured Sphere: Geodesic Rings (5)',
              icon: <span className="text-sm font-mono font-bold">🧭</span>,
            },
            {
              mode: 'PLANAR_GRID',
              title: 'Planar Grid Wall: Museum Matrix (6)',
              icon: <span className="text-sm font-mono font-bold">▦</span>,
            },
            {
              mode: 'CYLINDER_GALLERY',
              title: 'Cylinder Gallery: Amphitheater (7)',
              icon: <span className="text-sm font-mono font-bold">🏛️</span>,
            },
            {
              mode: 'RING_CAROUSEL',
              title: 'Ring Carousel: Upright Rings (8)',
              icon: <span className="text-sm font-mono font-bold">🎡</span>,
            },
            {
              mode: 'FIBONACCI_SPHERE',
              title: 'Fibonacci Golden Sphere (1)',
              icon: (
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                  <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
                </svg>
              ),
            },
            {
              mode: 'DNA_HELIX',
              title: 'DNA Timeline Helix (2)',
              icon: (
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                  <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />
                </svg>
              ),
            },
            {
              mode: 'GALAXY_CONSTELLATION',
              title: 'Galaxy Constellation (3)',
              icon: (
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                  <path d="M21 3H3v18h18V3zM10 17l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
              ),
            },
            {
              mode: 'CUBIC_MATRIX',
              title: 'Cubic Matrix Grid (4)',
              icon: (
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                  <path d="M4 4h16v16H4z" />
                </svg>
              ),
            },
          ].map(({ mode, title, icon }) => {
            const isActive = layoutMode === mode;
            return (
              <button
                key={mode}
                onClick={() => onLayoutChange(mode as Layout3DMode)}
                title={title}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#38bdf8] text-black shadow-[0_0_15px_rgba(56,189,248,0.5)] scale-105 font-bold'
                    : 'text-white/40 hover:text-white hover:bg-white/10'
                }`}
              >
                {icon}
              </button>
            );
          })}
          <div className="w-5 h-[1px] bg-white/10 mx-auto" />
          <button
            id="photosphere-btn-dock-open-drawer"
            onClick={() => setIsControlsDrawerOpen(true)}
            title="Open Consolidated Matrix Shapes & Controls Drawer (Key: M)"
            className="w-9 h-9 rounded-full flex items-center justify-center text-sky-400 hover:text-white hover:bg-sky-500/20 transition-all cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
        <span className="text-[9px] uppercase tracking-[0.2em] text-white/30 [writing-mode:vertical-rl] font-mono">
          Layout Engine
        </span>
      </aside>

      {/* Footer & Natural Language Semantic Search - Docked Underneath Viewport */}
      <footer className="pointer-events-auto z-10 w-full bg-[#07080e]/95 border-t border-white/[0.08] backdrop-blur-2xl px-4 sm:px-6 py-2 sm:py-2.5 flex flex-col items-center gap-1.5 sm:gap-2 shrink-0 shadow-[0_-12px_32px_rgba(0,0,0,0.6)]">
        {isFooterCollapsed ? (
          /* Collapsed Discreet Quick Pill for 100% Unobstructed Equator View */
          <div className="flex items-center gap-2 p-1.5 bg-black/60 border border-white/15 rounded-full backdrop-blur-2xl shadow-2xl animate-fadeIn">
            <button
              id="photosphere-btn-collapsed-matrix-menu"
              onClick={() => setIsControlsDrawerOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-sky-300 hover:text-white hover:bg-sky-500/20 transition-all cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />
              <span>Spatial Controls & Shapes</span>
            </button>
            <div className="h-4 w-[1px] bg-white/15" />
            <button
              id="photosphere-btn-expand-footer"
              onClick={() => handleSetFooterCollapsed(false)}
              title="Expand Quick Footer Bar (Key: C)"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] text-white/60 hover:text-white hover:bg-white/10 transition-all font-mono cursor-pointer"
            >
              <span>Quick Bar</span>
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <>
            {/* 1. Spatial Sort Mode Pills Bar (div:nth-of-type(1)) */}
            <div className="flex items-center gap-1 sm:gap-1.5 p-1 bg-white/[0.04] hover:bg-white/[0.06] border border-white/[0.08] rounded-full backdrop-blur-md shadow-sm transition-all overflow-x-auto max-w-full">
              {[
                { mode: 'CHRONOLOGICAL', label: 'Timeline', icon: Clock },
                { mode: 'GEOGRAPHIC', label: 'Globe', icon: MapPin },
                { mode: 'CHROMATIC', label: 'Color Hue', icon: Palette },
                { mode: 'RELATIONAL', label: 'People', icon: Users },
                { mode: 'SEMANTIC', label: 'Narrative', icon: Brain },
              ].map(({ mode, label, icon: Icon }) => {
                const isActive = sortMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => onSortChange(mode as SpatialSortMode)}
                    className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'bg-sky-500/20 text-sky-300 font-semibold border border-sky-400/40 shadow-[0_0_12px_rgba(56,189,248,0.2)]'
                        : 'text-white/60 hover:text-white hover:bg-white/[0.06]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                  </button>
                );
              })}
              <div className="h-3.5 w-[1px] bg-white/10 mx-0.5" />
              {/* Button 6: All Controls Drawer */}
              <button
                id="photosphere-btn-open-drawer-from-sort-bar"
                onClick={() => setIsControlsDrawerOpen(true)}
                title="Open Consolidated Matrix Controls & Shapes (Key: M)"
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium text-sky-300 hover:text-white hover:bg-sky-500/20 transition-all whitespace-nowrap cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />
                <span>All Controls</span>
              </button>
              {/* Button 7: Collapse button (button#photosphere-btn-collapse-footer:nth-of-type(7)) */}
              <button
                id="photosphere-btn-collapse-footer"
                onClick={() => handleSetFooterCollapsed(true)}
                title="Collapse bottom controls deck (Key: C)"
                className="p-1 sm:p-1.5 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer ml-0.5 shrink-0"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* 2. Extracted Theme Quick Filters (div:nth-of-type(2)) */}
            <div className="flex items-center gap-1.5 overflow-x-auto max-w-2xl py-0.5 px-1 scrollbar-none">
              <span className="text-[10px] uppercase font-mono tracking-wider text-sky-400/80 mr-1 flex items-center gap-1 shrink-0">
                <Sparkles className="w-3 h-3 text-sky-400" />
                <span>Extracted Themes:</span>
              </span>
              {(topThemes.length > 0
                ? topThemes.slice(0, 6)
                : [
                    { theme: 'beach', count: 18 },
                    { theme: 'sunset', count: 14 },
                    { theme: 'family', count: 24 },
                    { theme: 'nature', count: 16 },
                    { theme: 'travel', count: 20 },
                    { theme: 'celebration', count: 10 },
                  ]
              ).map(({ theme, count }) => {
                const isSelected = searchQuery.toLowerCase() === theme.toLowerCase();
                return (
                  <button
                    key={theme}
                    onClick={() => {
                      if (isSelected) {
                        onSearchChange('');
                      } else {
                        onSearchChange(theme);
                        AudioSynthesizer.playSearchFilter();
                      }
                    }}
                    className={`relative overflow-hidden flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-mono whitespace-nowrap transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-sky-400 text-black font-bold shadow-[0_0_12px_rgba(56,189,248,0.6)] scale-105'
                        : 'bg-white/5 hover:bg-sky-500/20 text-white/70 hover:text-sky-300 border border-white/10 hover:border-sky-400/40'
                    }`}
                  >
                    <span>#{theme}</span>
                    {count > 0 && (
                      <span className={`text-[9px] px-1 rounded-full font-bold ${
                        isSelected ? 'bg-black/20 text-black' : 'bg-white/10 text-white/50'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* 3. Main Search Input Container (div:nth-of-type(3)) */}
            <div
              className={`w-full max-w-2xl bg-[#0c0e17]/90 border rounded-xl backdrop-blur-md p-1 sm:p-1.5 flex items-center shadow-md relative transition-all duration-200 ${
                isListening
                  ? 'border-rose-500/60 shadow-[0_0_20px_rgba(244,63,94,0.3)] bg-rose-950/20'
                  : 'border-white/[0.1] hover:border-white/[0.2]'
              }`}
            >
              {/* Voice Feedback & Interim Transcription Badge inside/above search container */}
              {(feedbackBadge || isListening) && (
                <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-0.5 bg-black/80 border border-sky-400/40 rounded-full text-[10px] font-mono text-sky-300 backdrop-blur-md shadow-lg">
                  {isListening ? (
                    <>
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                      </span>
                      <span className="text-rose-300 font-semibold uppercase">Listening:</span>
                      <span className="text-white/90 truncate max-w-xs">{interimText || 'Speak search query...'}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3 text-sky-400" />
                      <span>{feedbackBadge}</span>
                    </>
                  )}
                </div>
              )}

              <div className="flex-1 flex items-center px-3 sm:px-4">
                <svg
                  viewBox="0 0 24 24"
                  className={`w-4 h-4 shrink-0 transition-colors ${
                    isListening ? 'text-rose-400 animate-pulse' : 'text-white/40'
                  }`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.35-4.35" />
                </svg>
                <input
                  ref={searchInputRef}
                  id="photosphere-search-input"
                  type="text"
                  value={isListening && interimText ? interimText : searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={
                    isListening
                      ? "Listening... Speak your query (e.g. 'sunset at beach', 'reset camera')..."
                      : "Search memories via Natural Language (Press / or Cmd+K)..."
                  }
                  className="bg-transparent border-none outline-none text-xs sm:text-sm px-2.5 sm:px-3.5 w-full text-white placeholder:text-white/30"
                />
              </div>

              <div className="flex items-center gap-1 sm:gap-1.5 px-1 sm:px-1.5">
                {/* Voice Search Web Speech API Trigger Button */}
                <button
                  id="photosphere-btn-voice-search"
                  onClick={toggleListening}
                  title={
                    isListening
                      ? 'Stop Voice Recognition'
                      : isVoiceSupported
                      ? 'Voice Search (Click and speak query or command)'
                      : 'Web Speech API not supported in this browser'
                  }
                  className={`h-7 w-7 sm:h-8 sm:w-8 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                    isListening
                      ? 'bg-rose-500 text-white shadow-[0_0_12px_rgba(244,63,94,0.7)] animate-pulse scale-105'
                      : isVoiceSupported
                      ? 'bg-white/5 border border-white/10 text-white/70 hover:text-sky-300 hover:bg-sky-500/20 hover:border-sky-400/40'
                      : 'bg-white/5 border border-white/5 text-white/20 cursor-not-allowed'
                  }`}
                >
                  {isListening ? (
                    <Mic className="w-3.5 h-3.5 text-white animate-bounce" />
                  ) : isVoiceSupported ? (
                    <Mic className="w-3.5 h-3.5" />
                  ) : (
                    <MicOff className="w-3.5 h-3.5" />
                  )}
                </button>

                <span className="hidden sm:inline-block text-[10px] bg-white/10 text-white/40 px-1.5 py-0.5 rounded font-mono border border-white/5">
                  ⌘K
                </span>
                {searchQuery.trim().length > 0 && (
                  <button
                    onClick={() => onSearchChange('')}
                    className="text-[10px] text-white/40 hover:text-white px-1.5 py-0.5 rounded"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={() => {
                    if (searchQuery.trim()) {
                      AudioSynthesizer.playSearchFilter();
                    }
                  }}
                  className="h-7 sm:h-8 px-2.5 sm:px-4 bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 rounded-lg text-[11px] font-semibold tracking-wide text-sky-200 transition-all whitespace-nowrap cursor-pointer"
                >
                  Search
                </button>
              </div>
            </div>
          </>
        )}
      </footer>

      {/* Telemetry & Mathematical Density Law Modal */}
      {showStatsModal && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="w-full max-w-lg bg-[#050507]/95 border border-white/15 rounded-3xl p-6 shadow-2xl backdrop-blur-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#38bdf8] to-[#818cf8] flex items-center justify-center text-white shadow-[0_0_15px_rgba(56,189,248,0.4)]">
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-wide text-white uppercase font-mono">
                    Mathematical Scaling Laws
                  </h3>
                  <p className="text-[11px] text-white/50">Section 2 Autonomous Coordinate Proofs</p>
                </div>
              </div>
              <button
                onClick={() => setShowStatsModal(false)}
                className="text-white/40 hover:text-white text-xs px-2.5 py-1 rounded-lg bg-white/5 border border-white/10"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3 font-mono text-xs text-white/80">
              <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                <div className="text-white/40 text-[10px] uppercase tracking-wider mb-1">
                  Constant Surface Density Scaling Law:
                </div>
                <div className="text-[#38bdf8] font-semibold">R(N) = max(380px, 115.84 * sqrt(N / 4π))</div>
                <div className="text-white/40 mt-2 text-[11px] flex justify-between">
                  <span>Current Radius R({stats.photoCount}):</span>
                  <span className="text-white font-bold">{stats.sphereRadius} px</span>
                </div>
              </div>

              <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                <div className="text-white/40 text-[10px] uppercase tracking-wider mb-1">
                  Adaptive Camera Distance:
                </div>
                <div className="text-indigo-400 font-semibold">
                  D_cam = (R(N) / sin(FOV/2)) * max(1, 1/aspect) * 1.18
                </div>
                <div className="text-white/40 mt-2 text-[11px] flex justify-between">
                  <span>Current D_cam:</span>
                  <span className="text-white font-bold">{stats.cameraDistance} px</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 text-center">
                  <div className="text-white/40 text-[9px] uppercase">Frame Rate</div>
                  <div className="text-[#4ade80] text-sm font-bold mt-0.5">{stats.fps} FPS</div>
                </div>
                <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 text-center">
                  <div className="text-white/40 text-[9px] uppercase">Draw Calls</div>
                  <div className="text-[#38bdf8] text-sm font-bold mt-0.5">{stats.drawCalls} / 5</div>
                </div>
                <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 text-center">
                  <div className="text-white/40 text-[9px] uppercase">NLP Latency</div>
                  <div className="text-[#fbbf24] text-sm font-bold mt-0.5">{stats.searchLatencyMs.toFixed(1)} ms</div>
                </div>
                <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 text-center">
                  <div className="text-white/40 text-[9px] uppercase">Auto-Orbit</div>
                  <div
                    className={`text-xs font-bold mt-0.5 ${
                      !autoRotateEnabled
                        ? 'text-white/30'
                        : stats.autoRotationStatus === 'ACTIVE'
                        ? 'text-sky-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {!autoRotateEnabled
                      ? 'OFF'
                      : stats.autoRotationStatus === 'ACTIVE'
                      ? 'ACTIVE'
                      : 'PAUSED'}
                  </div>
                </div>
                <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 text-center">
                  <div className="text-white/40 text-[9px] uppercase">Bloom Glow</div>
                  <div
                    className={`text-xs font-bold mt-0.5 ${
                      bloomEnabled ? 'text-amber-400' : 'text-white/30'
                    }`}
                  >
                    {bloomEnabled ? 'ACTIVE' : 'OFF'}
                  </div>
                </div>
                <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 text-center">
                  <div className="text-white/40 text-[9px] uppercase">Holo Overlays</div>
                  <div
                    className={`text-xs font-bold mt-0.5 ${
                      showHoloOverlays ? 'text-sky-400' : 'text-white/30'
                    }`}
                  >
                    {showHoloOverlays ? 'ACTIVE' : 'OFF'}
                  </div>
                </div>
                <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 text-center sm:col-span-2">
                  <div className="text-white/40 text-[9px] uppercase">Depth of Field</div>
                  <div
                    className={`text-xs font-bold mt-0.5 flex items-center justify-center gap-1.5 ${
                      depthOfFieldEnabled ? 'text-emerald-400' : 'text-white/30'
                    }`}
                  >
                    <span>{depthOfFieldEnabled ? 'ACTIVE' : 'OFF'}</span>
                    {depthOfFieldEnabled && stats.focusDistance && (
                      <span className="text-[10px] text-emerald-300/70 font-mono font-normal">
                        ({stats.focusDistance}u)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Package Download Card */}
              <div className="p-3 bg-gradient-to-r from-sky-950/50 to-cyan-950/50 rounded-xl border border-cyan-400/30 flex items-center justify-between gap-3">
                <div>
                  <div className="text-cyan-300 font-bold text-xs flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5" />
                    <span>3D Motion & Interactivity Package (.ZIP)</span>
                  </div>
                  <div className="text-white/50 text-[10px] mt-0.5">
                    15 source files: Canvas, GSAP Transitions, Spline Trails, Texture Cache, Kinematics & Audio
                  </div>
                </div>
                <a
                  id="photosphere-btn-modal-download"
                  href="/photosphere-motion-engine.zip"
                  download="photosphere-motion-engine.zip"
                  className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-[10px] uppercase tracking-wider transition-all flex items-center gap-1 whitespace-nowrap shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                >
                  <Download className="w-3 h-3" />
                  <span>Download</span>
                </a>
              </div>

              <div className="text-white/40 text-[11px] pt-2 space-y-1">
                <p>• 1-Finger / Mouse Left: Drag to orbit with damping momentum</p>
                <p>• 2-Finger Pinch: Zoom in & out with scale-invariant distance</p>
                <p>• 2-Finger Rotate: Azimuthal orbit rotation & twist</p>
                <p>• 2-Finger Drag: Camera pan across 3D view plane</p>
                <p>• Double Tap / R Key: Recenter camera focus & distance</p>
                <p>• Shift + Drag / Right Click: Screen-space 3D Lasso selection</p>
                <p>• W/A/S/D or Arrow Keys: Orbit viewport</p>
                <p>• 1-4 Keys: Switch 3D layout instantly</p>
                <p>• O Key / Orbit Icon: Ambient auto-rotation (pauses on interaction, resumes when idle)</p>
                <p>• B Key / Sparkles Icon: Toggle atmospheric bloom glow post-processing</p>
                <p>• H Key / Holo Icon: Toggle subtle 3D holographic metadata overlays on selected nodes</p>
                <p>• T Key: Toggle dynamic 3D NLP cluster theme labels</p>
                <p>• 🎙️ Voice Search: Click mic to speak semantic queries or say "DNA helix", "reset camera"</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Consolidated Matrix Controls & Shapes Drawer Component */}
      <SpatialControlsDrawer
        isOpen={isControlsDrawerOpen}
        onClose={() => setIsControlsDrawerOpen(false)}
        layoutMode={layoutMode}
        onLayoutChange={onLayoutChange}
        sortMode={sortMode}
        onSortChange={onSortChange}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        onVoiceSearchTrigger={toggleListening}
        isVoiceActive={isListening}
        voiceTranscript={interimText}
        extractedThemes={topThemes.map((t) => t.theme)}
        onSelectTheme={(theme) => onSearchChange(theme)}
        selectedTheme={searchQuery}
        stats={stats}
        onResetCamera={onResetCamera}
        autoRotateEnabled={autoRotateEnabled}
        onToggleAutoRotate={onToggleAutoRotate}
        bloomEnabled={bloomEnabled}
        onToggleBloom={onToggleBloom}
        depthOfFieldEnabled={depthOfFieldEnabled}
        onToggleDepthOfField={onToggleDepthOfField}
        showClusterLabels={showClusterLabels}
        onToggleClusterLabels={onToggleClusterLabels}
        showFocusTrail={showFocusTrail}
        onToggleFocusTrail={onToggleFocusTrail}
        showHoloOverlays={showHoloOverlays}
        onToggleHoloOverlays={onToggleHoloOverlays}
        onPresetCountChange={onPresetCountChange}
      />
    </div>
  );
};
