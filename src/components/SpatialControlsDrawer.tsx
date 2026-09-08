import React from 'react';
import { 
  X, 
  Home, 
  Clock, 
  MapPin, 
  Palette, 
  Users, 
  Brain, 
  Sparkles, 
  Search, 
  Mic, 
  Orbit, 
  Camera, 
  Route, 
  ScanText, 
  SlidersHorizontal,
  Compass,
  Grid,
  Maximize2
} from 'lucide-react';
import { Layout3DMode, SpatialSortMode, EngineStats } from '../types';
import { SpatialTransitionEngine } from '../engine/SpatialTransitionEngine';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  layoutMode: Layout3DMode;
  onLayoutChange: (mode: Layout3DMode) => void;
  sortMode: SpatialSortMode;
  onSortChange: (mode: SpatialSortMode) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onVoiceSearchTrigger?: () => void;
  isVoiceActive?: boolean;
  voiceTranscript?: string;
  extractedThemes?: string[];
  onSelectTheme?: (theme: string) => void;
  selectedTheme?: string | null;
  stats: EngineStats;
  onResetCamera: () => void;
  autoRotateEnabled?: boolean;
  onToggleAutoRotate?: () => void;
  bloomEnabled?: boolean;
  onToggleBloom?: () => void;
  depthOfFieldEnabled?: boolean;
  onToggleDepthOfField?: () => void;
  showClusterLabels?: boolean;
  onToggleClusterLabels?: () => void;
  showFocusTrail?: boolean;
  onToggleFocusTrail?: () => void;
  showHoloOverlays?: boolean;
  onToggleHoloOverlays?: () => void;
  onPresetCountChange?: (count: number) => void;
}

export const SpatialControlsDrawer: React.FC<Props> = ({
  isOpen,
  onClose,
  layoutMode,
  onLayoutChange,
  sortMode,
  onSortChange,
  searchQuery,
  onSearchChange,
  onVoiceSearchTrigger,
  isVoiceActive = false,
  voiceTranscript = '',
  extractedThemes = [],
  onSelectTheme,
  selectedTheme = null,
  stats,
  onResetCamera,
  autoRotateEnabled = true,
  onToggleAutoRotate,
  bloomEnabled = true,
  onToggleBloom,
  depthOfFieldEnabled = true,
  onToggleDepthOfField,
  showClusterLabels = true,
  onToggleClusterLabels,
  showFocusTrail = true,
  onToggleFocusTrail,
  showHoloOverlays = true,
  onToggleHoloOverlays,
  onPresetCountChange,
}) => {
  if (!isOpen) return null;

  const sortOptions: Array<{
    mode: SpatialSortMode;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      mode: 'CHRONOLOGICAL',
      label: 'Timeline',
      description: 'Ordered by capture timestamp from past to present',
      icon: Clock,
    },
    {
      mode: 'GEOGRAPHIC',
      label: 'Globe',
      description: 'Projected onto real Earth coordinates (latitude & longitude)',
      icon: MapPin,
    },
    {
      mode: 'CHROMATIC',
      label: 'Color Hue',
      description: 'Sorted around a 360° color wheel spectrum',
      icon: Palette,
    },
    {
      mode: 'RELATIONAL',
      label: 'People',
      description: 'Grouped by facial affinity, co-occurrence, and family clusters',
      icon: Users,
    },
    {
      mode: 'SEMANTIC',
      label: 'Narrative',
      description: 'Organized by AI narrative sentiment and thematic storylines',
      icon: Brain,
    },
  ];

  const straightLinedShapes: Array<{
    mode: Layout3DMode;
    label: string;
    tag: string;
    description: string;
    glyph: string;
  }> = [
    {
      mode: 'STRUCTURED_SPHERE',
      label: 'Structured Sphere',
      tag: 'Straight Rings',
      description: 'Concentric parallel latitude rings with level horizon alignment',
      glyph: '🧭',
    },
    {
      mode: 'PLANAR_GRID',
      label: 'Planar Grid Wall',
      tag: 'Straight Matrix',
      description: 'Museum gallery matrix aligned in straight horizontal rows and columns',
      glyph: '▦',
    },
    {
      mode: 'CYLINDER_GALLERY',
      label: 'Cylinder Gallery',
      tag: 'Straight Columns',
      description: 'Panoramic curved amphitheater with straight vertical columns',
      glyph: '🏛️',
    },
    {
      mode: 'RING_CAROUSEL',
      label: 'Ring Carousel',
      tag: 'Upright Rings',
      description: 'Concentric upright rings with cards standing level and straight',
      glyph: '🎡',
    },
  ];

  const volumetricShapes: Array<{
    mode: Layout3DMode;
    label: string;
    tag: string;
    description: string;
    glyph: string;
  }> = [
    {
      mode: 'FIBONACCI_SPHERE',
      label: 'Fibonacci Sphere',
      tag: 'Golden Spiral',
      description: 'Harmonic phyllotaxis golden spiral distribution',
      glyph: '🌐',
    },
    {
      mode: 'CUBIC_MATRIX',
      label: 'Cubic Matrix',
      tag: 'Isometric 3D',
      description: 'Volumetric cubic grid with isometric perspective',
      glyph: '🧊',
    },
    {
      mode: 'DNA_HELIX',
      label: 'DNA Helix',
      tag: 'Double-Helix',
      description: 'Ascending chronological double-helix staircase',
      glyph: '🧬',
    },
    {
      mode: 'GALAXY_CONSTELLATION',
      label: 'Galaxy Constellation',
      tag: 'Spiral Arms',
      description: 'Logarithmic galactic disk with cosmic density ripples',
      glyph: '🌌',
    },
  ];

  return (
    <div 
      id="photosphere-matrix-controls-overlay"
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm pointer-events-auto transition-all animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        id="photosphere-matrix-controls-panel"
        className="w-full sm:w-[460px] h-full bg-[#0d121c]/95 border-l border-white/10 shadow-2xl flex flex-col overflow-hidden text-white font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-400">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-wide text-white">Spatial Controls & Sort</h2>
              <p className="text-[11px] text-white/40 font-mono">Consolidated Matrix Navigator</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Center Sphere Home Button */}
            <button
              id="drawer-btn-center-sphere"
              onClick={() => {
                onResetCamera();
                onClose();
              }}
              title="Center Sphere with Equal Black Margins on All 4 Edges"
              className="px-2.5 py-1.5 rounded-lg border border-sky-400/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 text-[11px] font-mono flex items-center gap-1.5 transition-all"
            >
              <Home className="w-3.5 h-3.5 text-sky-400" />
              <span className="font-semibold">Center Sphere</span>
            </button>

            {/* Close Drawer */}
            <button
              id="drawer-btn-close"
              onClick={onClose}
              className="w-8 h-8 rounded-lg border border-white/10 bg-white/5 hover:bg-white/15 text-white/60 hover:text-white flex items-center justify-center transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 scrollbar-thin scrollbar-thumb-white/10">
          
          {/* Quick Natural Language Search & Voice */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase font-mono tracking-wider text-white/50">Semantic Vector Search</span>
              {Boolean(searchQuery) && (
                <button
                  onClick={() => onSearchChange('')}
                  className="text-[10px] font-mono text-sky-400 hover:underline"
                >
                  Clear filter
                </button>
              )}
            </div>
            <div className="relative flex items-center">
              <Search className="absolute left-3 w-4 h-4 text-white/40 pointer-events-none" />
              <input
                id="drawer-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Filter memories (e.g. 'sunset at beach', 'hiking')..."
                className="w-full pl-9 pr-12 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-white/30 focus:outline-none focus:border-sky-400/60 focus:ring-1 focus:ring-sky-400/30 transition-all font-sans"
              />
              {onVoiceSearchTrigger && (
                <button
                  id="drawer-voice-search-btn"
                  onClick={onVoiceSearchTrigger}
                  title={isVoiceActive ? 'Listening... Speak your query' : 'Search by Voice'}
                  className={`absolute right-2 p-1.5 rounded-lg border transition-all ${
                    isVoiceActive
                      ? 'bg-rose-500/20 border-rose-400/60 text-rose-300 animate-pulse'
                      : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Mic className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {isVoiceActive && Boolean(voiceTranscript) && (
              <p className="text-[11px] font-mono text-rose-300 italic px-1">
                Listening: &quot;{voiceTranscript}&quot;
              </p>
            )}
          </div>

          {/* Spatial Sorting Section (The Consolidated Selected Element) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase font-mono tracking-wider text-sky-400 font-semibold flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-sky-400" />
                Spatial Sorting Modes
              </span>
              <span className="text-[10px] font-mono text-white/40">5 Mathematical Presets</span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {sortOptions.map(({ mode, label, description, icon: Icon }) => {
                const isActive = sortMode === mode;
                return (
                  <button
                    key={mode}
                    id={`drawer-sort-btn-${mode.toLowerCase()}`}
                    onClick={() => onSortChange(mode)}
                    className={`w-full p-3 rounded-xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                      isActive
                        ? 'bg-sky-500/15 border-sky-400/50 shadow-[0_0_20px_rgba(56,189,248,0.15)] text-white'
                        : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.07] text-white/70 hover:text-white'
                    }`}
                  >
                    <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                      isActive ? 'bg-sky-400 text-black font-bold' : 'bg-white/5 text-white/50'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-xs font-semibold ${isActive ? 'text-sky-300' : 'text-white'}`}>
                          {label}
                        </span>
                        {isActive && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono uppercase bg-sky-400/20 text-sky-300 font-bold border border-sky-400/30">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-white/50 leading-relaxed line-clamp-2">
                        {description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Clean Straight-Lined Formations */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase font-mono tracking-wider text-emerald-400 font-semibold flex items-center gap-1.5">
                <Grid className="w-3.5 h-3.5 text-emerald-400" />
                Straight-Lined Formations
              </span>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-emerald-400/10 text-emerald-300 border border-emerald-400/20">
                Clean Structure
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {straightLinedShapes.map(({ mode, label, tag, description, glyph }) => {
                const isActive = layoutMode === mode;
                return (
                  <button
                    key={mode}
                    id={`drawer-layout-btn-${mode.toLowerCase()}`}
                    onClick={() => onLayoutChange(mode)}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                      isActive
                        ? 'bg-emerald-500/15 border-emerald-400/60 shadow-[0_0_20px_rgba(52,211,153,0.15)] text-white'
                        : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.07] text-white/70 hover:text-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xl">{glyph}</span>
                        <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${
                          isActive ? 'bg-emerald-400 text-black font-bold' : 'bg-white/10 text-white/50'
                        }`}>
                          {tag}
                        </span>
                      </div>
                      <h3 className={`text-xs font-semibold mb-1 ${isActive ? 'text-emerald-300' : 'text-white'}`}>
                        {label}
                      </h3>
                      <p className="text-[10px] text-white/50 leading-normal line-clamp-2">
                        {description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Volumetric 3D Formations */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase font-mono tracking-wider text-indigo-400 font-semibold flex items-center gap-1.5">
                <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
                Volumetric & Celestial Formations
              </span>
              <span className="text-[9px] font-mono text-white/40">3D Orbits</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {volumetricShapes.map(({ mode, label, tag, description, glyph }) => {
                const isActive = layoutMode === mode;
                return (
                  <button
                    key={mode}
                    id={`drawer-layout-btn-${mode.toLowerCase()}`}
                    onClick={() => onLayoutChange(mode)}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between cursor-pointer ${
                      isActive
                        ? 'bg-indigo-500/15 border-indigo-400/60 shadow-[0_0_20px_rgba(99,102,241,0.15)] text-white'
                        : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.07] text-white/70 hover:text-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xl">{glyph}</span>
                        <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded ${
                          isActive ? 'bg-indigo-400 text-black font-bold' : 'bg-white/10 text-white/50'
                        }`}>
                          {tag}
                        </span>
                      </div>
                      <h3 className={`text-xs font-semibold mb-1 ${isActive ? 'text-indigo-300' : 'text-white'}`}>
                        {label}
                      </h3>
                      <p className="text-[10px] text-white/50 leading-normal line-clamp-2">
                        {description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Extracted Theme Pills */}
          {extractedThemes.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase font-mono tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Extracted Themes
                </span>
                {Boolean(selectedTheme) && onSelectTheme && (
                  <button
                    onClick={() => onSelectTheme('')}
                    className="text-[10px] font-mono text-amber-400 hover:underline"
                  >
                    Reset tag
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {extractedThemes.map((theme) => {
                  const isSelected = selectedTheme === theme;
                  return (
                    <button
                      key={theme}
                      onClick={() => onSelectTheme && onSelectTheme(theme)}
                      className={`px-2.5 py-1 rounded-full text-xs font-mono transition-all ${
                        isSelected
                          ? 'bg-amber-400 text-black font-bold shadow-[0_0_12px_rgba(251,191,36,0.4)]'
                          : 'bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      #{theme}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Density Presets */}
          {onPresetCountChange && (
            <div className="space-y-2 pt-3 border-t border-white/10">
              <span className="text-[11px] uppercase font-mono tracking-wider text-white/40">
                Memory Node Density (N)
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                {[30, 120, 360, 1000].map((count) => {
                  const isCurrent = stats.photoCount === count;
                  return (
                    <button
                      key={count}
                      onClick={() => onPresetCountChange(count)}
                      className={`py-1.5 rounded-lg text-xs font-mono transition-all border ${
                        isCurrent
                          ? 'bg-sky-400/20 border-sky-400/60 text-sky-300 font-bold'
                          : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      N={count}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Display & Optics Toggles */}
          <div className="space-y-2 pt-3 border-t border-white/10">
            <span className="text-[11px] uppercase font-mono tracking-wider text-white/40">
              Display & Optics
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              {onToggleAutoRotate && (
                <button
                  onClick={onToggleAutoRotate}
                  className={`p-2.5 rounded-xl border flex items-center justify-between transition-all ${
                    autoRotateEnabled
                      ? 'bg-sky-500/15 border-sky-400/40 text-sky-300'
                      : 'bg-white/5 border-white/10 text-white/40'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Orbit className="w-3.5 h-3.5" />
                    Auto-Orbit
                  </span>
                  <span className="text-[10px] font-bold">{autoRotateEnabled ? 'ON' : 'OFF'}</span>
                </button>
              )}

              {onToggleBloom && (
                <button
                  onClick={onToggleBloom}
                  className={`p-2.5 rounded-xl border flex items-center justify-between transition-all ${
                    bloomEnabled
                      ? 'bg-amber-400/15 border-amber-400/40 text-amber-300'
                      : 'bg-white/5 border-white/10 text-white/40'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Bloom
                  </span>
                  <span className="text-[10px] font-bold">{bloomEnabled ? 'ON' : 'OFF'}</span>
                </button>
              )}

              {onToggleDepthOfField && (
                <button
                  onClick={onToggleDepthOfField}
                  className={`p-2.5 rounded-xl border flex items-center justify-between transition-all ${
                    depthOfFieldEnabled
                      ? 'bg-emerald-400/15 border-emerald-400/40 text-emerald-300'
                      : 'bg-white/5 border-white/10 text-white/40'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5" />
                    Depth of Field
                  </span>
                  <span className="text-[10px] font-bold">{depthOfFieldEnabled ? 'ON' : 'OFF'}</span>
                </button>
              )}

              {onToggleClusterLabels && (
                <button
                  onClick={onToggleClusterLabels}
                  className={`p-2.5 rounded-xl border flex items-center justify-between transition-all ${
                    showClusterLabels
                      ? 'bg-sky-400/15 border-sky-400/40 text-sky-300'
                      : 'bg-white/5 border-white/10 text-white/40'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    3D Clusters
                  </span>
                  <span className="text-[10px] font-bold">{showClusterLabels ? 'ON' : 'OFF'}</span>
                </button>
              )}

              {onToggleFocusTrail && (
                <button
                  onClick={onToggleFocusTrail}
                  className={`p-2.5 rounded-xl border flex items-center justify-between transition-all ${
                    showFocusTrail
                      ? 'bg-cyan-400/15 border-cyan-400/40 text-cyan-300'
                      : 'bg-white/5 border-white/10 text-white/40'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Route className="w-3.5 h-3.5" />
                    Focus Trail
                  </span>
                  <span className="text-[10px] font-bold">{showFocusTrail ? 'ON' : 'OFF'}</span>
                </button>
              )}

              {onToggleHoloOverlays && (
                <button
                  onClick={onToggleHoloOverlays}
                  className={`p-2.5 rounded-xl border flex items-center justify-between transition-all ${
                    showHoloOverlays
                      ? 'bg-sky-400/15 border-sky-400/40 text-sky-300'
                      : 'bg-white/5 border-white/10 text-white/40'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <ScanText className="w-3.5 h-3.5" />
                    Holo Cards
                  </span>
                  <span className="text-[10px] font-bold">{showHoloOverlays ? 'ON' : 'OFF'}</span>
                </button>
              )}
            </div>
          </div>

        </div>

        {/* Footer info & Home button */}
        <div className="p-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between text-[11px] font-mono text-white/40">
          <span>{stats.photoCount} Memories in Matrix</span>
          <button
            onClick={() => {
              onResetCamera();
              onClose();
            }}
            className="text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Reset to Center</span>
          </button>
        </div>
      </div>
    </div>
  );
};
