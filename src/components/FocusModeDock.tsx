/**
 * FocusModeDock.tsx
 * Floating glassmorphic dock active during Focus Mode with close-up 3D orbit controls,
 * memory metadata summary, quick navigation cycle, and deep inspection trigger.
 */

import React, { useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Calendar,
  MapPin,
  Sparkles,
  Orbit,
  Tag,
  Compass,
  Route,
  Camera,
} from 'lucide-react';
import { PhotoMemoryItem } from '../types';
import { AudioSynthesizer } from '../engine/AudioSynthesizer';
import { SpatialAudioProcessor } from '../engine/SpatialAudioProcessor';

interface Props {
  focusedItem: PhotoMemoryItem | null;
  items: PhotoMemoryItem[];
  trailCount?: number;
  depthOfFieldEnabled?: boolean;
  onToggleDepthOfField?: () => void;
  onExitFocus: () => void;
  onSelectNext: () => void;
  onSelectPrev: () => void;
  onOpenDeepInspect: (item: PhotoMemoryItem) => void;
  isTransitioning?: boolean;
  transitionProgress?: number;
  navDirection?: 'next' | 'prev' | 'direct';
}

export const FocusModeDock: React.FC<Props> = ({
  focusedItem,
  items,
  trailCount = 0,
  depthOfFieldEnabled = true,
  onToggleDepthOfField,
  onExitFocus,
  onSelectNext,
  onSelectPrev,
  onOpenDeepInspect,
  isTransitioning = false,
  transitionProgress = 0,
  navDirection = 'next',
}) => {
  const lastNavTimeRef = useRef<number>(0);

  // Safe debounced next/prev to prevent double-tap race conditions while maintaining high responsiveness
  const handleNextWithThrottle = useCallback(() => {
    const now = performance.now();
    if (now - lastNavTimeRef.current < 120) return;
    lastNavTimeRef.current = now;
    onSelectNext();
  }, [onSelectNext]);

  const handlePrevWithThrottle = useCallback(() => {
    const now = performance.now();
    if (now - lastNavTimeRef.current < 120) return;
    lastNavTimeRef.current = now;
    onSelectPrev();
  }, [onSelectPrev]);

  // Keyboard navigation shortcuts when focused: Left/Right to cycle, Esc to exit, Space/Enter for deep inspect
  useEffect(() => {
    if (!focusedItem) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing inside search input
      if (document.activeElement?.tagName === 'INPUT') return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onExitFocus();
      } else if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J' || e.key === '[') {
        e.preventDefault();
        handlePrevWithThrottle();
      } else if (e.key === 'ArrowRight' || e.key === 'k' || e.key === 'K' || e.key === ']') {
        e.preventDefault();
        handleNextWithThrottle();
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        onOpenDeepInspect(focusedItem);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedItem, onExitFocus, handleNextWithThrottle, handlePrevWithThrottle, onOpenDeepInspect]);

  if (!focusedItem) return null;

  const dateFormatted = new Date(focusedItem.timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const currentIndex = items.findIndex((i) => i.id === focusedItem.id);
  const totalCount = items.length;

  return (
    <AnimatePresence>
      <motion.div
        id="focus-mode-dock"
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.95 }}
        transition={{ type: 'spring', damping: 26, stiffness: 280 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-10 max-w-[95vw] w-auto pointer-events-auto"
      >
        <div className="floating-memory-label-card group relative flex items-center gap-3.5 px-4 py-3 rounded-2xl bg-[#090b14]/85 backdrop-blur-2xl border border-sky-400/25 shadow-[0_16px_48px_rgba(0,0,0,0.6),0_0_24px_rgba(56,189,248,0.15)] text-white overflow-hidden">
          {/* Glassmorphism hover glow layer */}
          <div
            className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-[1]"
            style={{
              background: 'radial-gradient(circle at center, rgba(255,255,255,0.25), transparent 70%)',
            }}
          />

          {/* Subtle transition flight progress bar at top edge */}
          {isTransitioning && (
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/10 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]"
                initial={{ width: '0%' }}
                animate={{ width: `${Math.round(transitionProgress * 100)}%` }}
                transition={{ ease: 'linear', duration: 0.05 }}
              />
            </div>
          )}

          {/* Focus Orbit / Flight Indicator */}
          <div className="hidden sm:flex flex-col items-center justify-center pr-3 border-r border-white/10 min-w-[80px]">
            {isTransitioning ? (
              <div
                id="focus-flight-badge"
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-[10px] font-semibold tracking-wider uppercase animate-pulse shadow-[0_0_12px_rgba(34,211,238,0.3)]"
              >
                <Compass className="w-2.5 h-2.5 animate-spin text-cyan-300" />
                <span>Transition</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-400/30 text-sky-300 text-[10px] font-semibold tracking-wider uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
                <span>Focus Orbit</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 mt-1 font-mono text-[10px] text-white/40">
              <span>{currentIndex >= 0 ? `${currentIndex + 1} / ${totalCount}` : ''}</span>
              {trailCount > 1 && (
                <span className="text-cyan-300 font-semibold flex items-center gap-0.5" title={`Navigation trail: ${trailCount} visited items`}>
                  • <Route className="w-2.5 h-2.5 inline" /> {trailCount}
                </span>
              )}
            </div>
          </div>

          {/* Animated Directional Slide Container for Thumbnail & Meta */}
          <div className="relative flex items-center gap-3 overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={focusedItem.id}
                initial={{ opacity: 0, x: navDirection === 'prev' ? -20 : 20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: navDirection === 'prev' ? 20 : -20, scale: 0.95 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="flex items-center gap-3"
              >
                {/* Photo Thumbnail */}
                <div
                  onClick={() => onOpenDeepInspect(focusedItem)}
                  className="relative w-12 h-12 rounded-xl overflow-hidden cursor-pointer border border-white/20 shadow-md group flex-shrink-0"
                  title="Click to Deep Inspect"
                >
                  <img
                    src={focusedItem.thumbnailUrl}
                    alt={focusedItem.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
                </div>

                {/* Meta Info */}
                <div className="flex flex-col min-w-0 pr-2 max-w-[180px] sm:max-w-[260px] md:max-w-[340px]">
                  <h3 className="text-sm font-semibold text-white truncate leading-tight">
                    {focusedItem.title}
                  </h3>
                  <div className="flex items-center gap-2.5 text-[11px] text-white/60 mt-0.5 truncate">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-sky-400/80 flex-shrink-0" />
                      {dateFormatted}
                    </span>
                    {focusedItem.exif?.locationName && (
                      <span className="flex items-center gap-1 truncate text-white/50">
                        <MapPin className="w-3 h-3 text-amber-400/80 flex-shrink-0" />
                        <span className="truncate">{focusedItem.exif.locationName}</span>
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center gap-1.5 pl-2 border-l border-white/10 flex-shrink-0">
            {/* Prev Memory */}
            <button
              id="focus-prev-btn"
              onClick={() => {
                const prevIdx = (currentIndex - 1 + totalCount) % totalCount;
                const prevItem = items[prevIdx];
                if (prevItem) {
                  SpatialAudioProcessor.playSpatialCardSelect(prevItem.currentPos, [0, 0, 320], prevItem.hue);
                } else {
                  AudioSynthesizer.playCardSelect(focusedItem.hue);
                }
                handlePrevWithThrottle();
              }}
              title="Previous Memory (← or [)"
              className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                isTransitioning && navDirection === 'prev'
                  ? 'bg-sky-500/25 border-sky-400/50 text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.4)]'
                  : 'bg-white/5 hover:bg-white/15 active:scale-95 border-white/10 text-white/80 hover:text-white'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Next Memory */}
            <button
              id="focus-next-btn"
              onClick={() => {
                const nextIdx = (currentIndex + 1) % totalCount;
                const nextItem = items[nextIdx];
                if (nextItem) {
                  SpatialAudioProcessor.playSpatialCardSelect(nextItem.currentPos, [0, 0, 320], nextItem.hue);
                } else {
                  AudioSynthesizer.playCardSelect(focusedItem.hue);
                }
                handleNextWithThrottle();
              }}
              title="Next Memory (→ or ])"
              className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                isTransitioning && navDirection === 'next'
                  ? 'bg-sky-500/25 border-sky-400/50 text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.4)]'
                  : 'bg-white/5 hover:bg-white/15 active:scale-95 border-white/10 text-white/80 hover:text-white'
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>


            {/* Deep Inspect Button */}
            <button
              id="focus-inspect-btn"
              onClick={() => {
                AudioSynthesizer.playCardSelect(focusedItem.hue);
                onOpenDeepInspect(focusedItem);
              }}
              title="Deep Inspect (Space / Enter)"
              className="flex items-center gap-1.5 px-3 h-8 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 active:scale-95 border border-sky-400/40 text-sky-300 hover:text-sky-200 text-xs font-medium transition-all cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Inspect</span>
            </button>

            {/* Depth of Field Autofocus Bokeh Toggle */}
            {onToggleDepthOfField && (
              <button
                id="focus-dof-toggle-btn"
                onClick={() => {
                  AudioSynthesizer.playCardSelect(90);
                  onToggleDepthOfField();
                }}
                title={
                  depthOfFieldEnabled
                    ? 'Depth of Field (Autofocus Bokeh): Active (Key: F)'
                    : 'Depth of Field (Autofocus Bokeh): Disabled (Key: F)'
                }
                className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                  depthOfFieldEnabled
                    ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.3)]'
                    : 'bg-white/5 border-white/10 text-white/40 hover:text-white/80'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Exit Focus Button */}
            <button
              id="focus-exit-btn"
              onClick={() => {
                AudioSynthesizer.playLayoutSwoosh(0);
                onExitFocus();
              }}
              title="Exit Focus Mode (Esc)"
              className="w-8 h-8 rounded-xl bg-red-500/10 hover:bg-red-500/25 active:scale-95 border border-red-400/30 flex items-center justify-center text-red-300 hover:text-red-200 transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
