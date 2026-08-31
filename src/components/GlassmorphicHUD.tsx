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
  User as UserIcon,
  LogIn,
  Glasses,
  Mic,
  MicOff,
} from 'lucide-react';
import { Layout3DMode, SpatialSortMode, EngineStats } from '../types';
import { AudioSynthesizer } from '../engine/AudioSynthesizer';
import { auth, onAuthStateChanged, User } from '../services/firebase';
import { useVoiceSearch } from '../hooks/useVoiceSearch';
import { ThemeAnalyzerProgress } from '../engine/BackgroundThemeAnalyzer';

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
  onOpenGooglePhotos: () => void;
  onOpenLocalUpload: () => void;
  onPresetCountChange: (count: number) => void;
  onResetCamera: () => void;
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
}) => {
  const [isMuted, setIsMuted] = useState(AudioSynthesizer.getMuted());
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
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
      if (e.key === 't' || e.key === 'T') onToggleClusterLabels();
      if (e.key === 'v' || e.key === 'V') onToggleVR();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onLayoutChange, onToggleClusterLabels, onToggleVR]);

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
    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between overflow-hidden">
      {/* Top Header Bar - Immersive UI Specification */}
      <header className="pointer-events-auto z-10 flex justify-between items-center px-4 sm:px-8 py-4 sm:py-5 border-b border-white/[0.08] bg-black/20 backdrop-blur-md">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-[#38bdf8] to-[#818cf8] rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(56,189,248,0.4)]">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xs sm:text-sm font-bold tracking-[0.3em] uppercase text-white/90">
              Photo-Sphere
            </h1>
            <p className="text-[10px] text-[#38bdf8] font-mono uppercase tracking-wider truncate max-w-[200px] sm:max-w-[340px]">
              {activeSourceName || 'Spatial Runtime v1.0.0-PROD'}
            </p>
          </div>
        </div>

        {/* Status & Quick Actions */}
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Engine Status</span>
            <span className="text-xs font-mono text-[#4ade80] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse"></span>
              ACTIVE / {stats.fps} FPS
            </span>
          </div>

          <div className="hidden sm:block w-[1px] h-8 bg-white/10" />

          <button
            id="photosphere-btn-google-photos-top"
            onClick={onOpenGooglePhotos}
            className={`px-3.5 sm:px-4 py-2 border rounded-full text-[10px] sm:text-[11px] uppercase tracking-widest transition-all flex items-center gap-1.5 ${
              currentUser
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 shadow-sm shadow-emerald-500/20'
                : 'bg-white/5 border-white/10 text-white/80 hover:text-white hover:bg-white/10'
            }`}
          >
            {currentUser?.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt=""
                className="w-4 h-4 rounded-full object-cover border border-emerald-400/50"
                referrerPolicy="no-referrer"
              />
            ) : (
              <Camera className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>{currentUser ? (currentUser.displayName?.split(' ')[0] || 'Photos Sync') : 'Google Auth'}</span>
          </button>

          <button
            id="photosphere-btn-upload-top"
            onClick={onOpenLocalUpload}
            className="hidden md:flex px-3.5 py-2 bg-white/5 border border-white/10 rounded-full text-[11px] uppercase tracking-widest text-white/80 hover:text-white hover:bg-white/10 transition-colors items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span>Local Files</span>
          </button>

          {/* 3D Cluster Theme Labels Toggle */}
          <button
            id="photosphere-btn-cluster-labels"
            onClick={onToggleClusterLabels}
            title={showClusterLabels ? 'Hide 3D Cluster Theme Labels (Key: T)' : 'Show 3D Cluster Theme Labels (Key: T)'}
            className={`px-3 py-1.5 rounded-full border text-[11px] font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all ${
              showClusterLabels
                ? 'bg-[#38bdf8]/20 border-[#38bdf8]/50 text-[#38bdf8] shadow-[0_0_14px_rgba(56,189,248,0.3)]'
                : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10'
            }`}
          >
            <Sparkles className={`w-3.5 h-3.5 ${showClusterLabels ? 'text-[#38bdf8] animate-pulse' : 'text-white/40'}`} />
            <span className="hidden lg:inline">3D Themes</span>
            <span className={`w-1.5 h-1.5 rounded-full ${showClusterLabels ? 'bg-[#38bdf8]' : 'bg-white/20'}`} />
          </button>

          {/* WebXR VR Immersion Toggle */}
          <button
            id="photosphere-btn-vr-toggle"
            onClick={onToggleVR}
            title={isVrActive ? 'Exit WebXR VR Immersion (Key: V)' : 'Enter WebXR VR Immersion (Key: V)'}
            className={`px-3 py-1.5 rounded-full border text-[11px] font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
              isVrActive
                ? 'bg-gradient-to-r from-sky-400 to-indigo-500 text-black border-sky-300 font-bold shadow-[0_0_18px_rgba(56,189,248,0.5)] scale-105'
                : 'bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10 hover:border-sky-400/40'
            }`}
          >
            <Glasses className={`w-3.5 h-3.5 ${isVrActive ? 'text-black animate-pulse' : 'text-sky-400'}`} />
            <span className="hidden sm:inline font-semibold">VR Immersion</span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isVrActive ? 'bg-black' : 'bg-sky-400'
              }`}
            />
          </button>

          {/* Quick Utility Icons */}
          <div className="flex items-center gap-1.5">
            <button
              id="photosphere-btn-audio"
              onClick={toggleMute}
              title={isMuted ? 'Unmute Spatial Audio' : 'Mute Spatial Audio'}
              className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-white/30" /> : <Volume2 className="w-4 h-4 text-[#38bdf8]" />}
            </button>

            <button
              id="photosphere-btn-stats"
              onClick={() => setShowStatsModal(!showStatsModal)}
              title="Mathematical Density Telemetry"
              className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Info className="w-4 h-4" />
            </button>

            <button
              id="photosphere-btn-fullscreen"
              onClick={toggleFullscreen}
              title="Toggle Fullscreen"
              className="hidden lg:flex w-9 h-9 rounded-full bg-white/5 border border-white/10 items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Left Parameters Vertical Rail - Immersive UI Specification */}
      <aside className="pointer-events-auto absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 hidden md:flex flex-col gap-8 z-20">
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

      {/* Right Layout Engine Selector Dock - Immersive UI Specification */}
      <aside className="pointer-events-auto absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 flex flex-col items-center gap-6 z-20">
        <div className="flex flex-col gap-3 p-2 bg-white/5 border border-white/10 rounded-full backdrop-blur-lg shadow-2xl">
          {[
            {
              mode: 'FIBONACCI_SPHERE',
              title: 'Fibonacci Sphere (1)',
              icon: (
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                  <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
                </svg>
              ),
            },
            {
              mode: 'DNA_HELIX',
              title: 'DNA Timeline Helix (2)',
              icon: (
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                  <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />
                </svg>
              ),
            },
            {
              mode: 'GALAXY_CONSTELLATION',
              title: 'Galaxy Constellation (3)',
              icon: (
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                  <path d="M21 3H3v18h18V3zM10 17l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
              ),
            },
            {
              mode: 'CUBIC_MATRIX',
              title: 'Cubic Matrix Grid (4)',
              icon: (
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
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
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                  isActive
                    ? 'bg-[#38bdf8] text-black shadow-[0_0_15px_rgba(56,189,248,0.5)] scale-105 font-bold'
                    : 'text-white/40 hover:text-white hover:bg-white/10'
                }`}
              >
                {icon}
              </button>
            );
          })}
        </div>
        <span className="text-[9px] uppercase tracking-[0.2em] text-white/30 [writing-mode:vertical-rl] font-mono">
          Layout Engine
        </span>
      </aside>

      {/* Footer & Natural Language Semantic Search - Immersive UI Specification */}
      <footer className="pointer-events-auto z-10 px-4 sm:px-8 py-6 sm:py-8 flex flex-col items-center">
        {/* Spatial Sort Mode Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-white/5 border border-white/10 rounded-full backdrop-blur-xl mb-3 shadow-xl overflow-x-auto max-w-full">
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-white/20 text-white font-semibold shadow-inner border border-white/20'
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Extracted Theme Quick Filters */}
        <div className="flex items-center gap-1.5 mb-2 overflow-x-auto max-w-2xl py-1 px-1 scrollbar-none">
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
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-mono whitespace-nowrap transition-all cursor-pointer ${
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

        {/* Voice Feedback & Interim Transcription Toast */}
        {(feedbackBadge || isListening) && (
          <div className="mb-2 flex items-center gap-2 px-3.5 py-1.5 bg-black/60 border border-sky-400/30 rounded-full text-xs font-mono backdrop-blur-xl shadow-[0_0_20px_rgba(56,189,248,0.2)] animate-in fade-in slide-in-from-bottom-2 duration-200">
            {isListening ? (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                </span>
                <span className="text-rose-300 font-semibold tracking-wide uppercase text-[10px]">
                  Listening:
                </span>
                <span className="text-white/90 italic truncate max-w-xs">
                  {interimText || 'Speak search query or command...'}
                </span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-sky-300 font-semibold">{feedbackBadge}</span>
              </>
            )}
          </div>
        )}

        {/* Main Search Input Container */}
        <div
          className={`w-full max-w-2xl bg-white/5 border rounded-2xl backdrop-blur-2xl p-2 flex items-center shadow-2xl relative transition-all duration-300 ${
            isListening
              ? 'border-rose-500/60 shadow-[0_0_25px_rgba(244,63,94,0.3)] bg-rose-950/10'
              : 'border-white/10 hover:border-white/20'
          }`}
        >
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
                  ? "Listening... Speak your query (e.g. 'sunset at beach', 'DNA helix', 'reset camera')..."
                  : "Search memories via Natural Language (Semantic Matrix)..."
              }
              className="bg-transparent border-none outline-none text-xs sm:text-sm px-3 sm:px-4 w-full text-white placeholder:text-white/30"
            />
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 px-1 sm:px-2">
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
              className={`h-9 w-9 sm:h-10 sm:w-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                isListening
                  ? 'bg-rose-500 text-white shadow-[0_0_16px_rgba(244,63,94,0.7)] animate-pulse scale-105'
                  : isVoiceSupported
                  ? 'bg-white/5 border border-white/10 text-white/70 hover:text-sky-300 hover:bg-sky-500/20 hover:border-sky-400/40'
                  : 'bg-white/5 border border-white/5 text-white/20 cursor-not-allowed'
              }`}
            >
              {isListening ? (
                <Mic className="w-4 h-4 text-white animate-bounce" />
              ) : isVoiceSupported ? (
                <Mic className="w-4 h-4" />
              ) : (
                <MicOff className="w-4 h-4" />
              )}
            </button>

            <span className="hidden sm:inline-block text-[10px] bg-white/10 text-white/40 px-2 py-1 rounded-md font-mono border border-white/5">
              Cmd+K
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
              className="h-9 sm:h-10 px-3 sm:px-6 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-xs font-bold uppercase tracking-wider text-white transition-all whitespace-nowrap"
            >
              Execute Query
            </button>
          </div>
        </div>

        {/* Sub-Footer Telemetry Row - Immersive UI Specification */}
        <div className="mt-4 sm:mt-6 flex flex-wrap gap-4 sm:gap-8 items-center justify-center text-xs">
          <div className="flex items-center gap-2 opacity-50">
            <span className="text-[10px] font-mono">LAT: 64.1265</span>
            <span className="text-[10px] font-mono">LON: -21.8174</span>
          </div>

          {/* Automated Theme Analysis Status Telemetry */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 font-mono text-[10px]">
            <span className={`w-2 h-2 rounded-full ${themeProgress?.status === 'ANALYZING' ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
            <span className="text-white/70">
              {themeProgress?.status === 'ANALYZING'
                ? `Analyzing Themes (${themeProgress.processedCount}/${themeProgress.totalCount})`
                : `AI Themes Active (${topThemes.length || 6} categories)`}
            </span>
            <span className="text-[#38bdf8] font-bold">
              • Vector Relevancy Boosted
            </span>
          </div>

          <div className="flex items-center gap-1.5 opacity-50">
            <div className="w-2 h-2 rounded-full bg-[#38bdf8] shadow-[0_0_8px_#38bdf8]"></div>
            <span className="text-[10px] font-mono">
              {stats.photoCount}/{stats.photoCount} Hydrated
            </span>
          </div>
        </div>
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

              <div className="grid grid-cols-3 gap-2">
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
                <p>• T Key: Toggle dynamic 3D NLP cluster theme labels</p>
                <p>• 🎙️ Voice Search: Click mic to speak semantic queries or say "DNA helix", "reset camera"</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
