/**
 * FocusModeDock.tsx
 * Floating glassmorphic dock active during Focus Mode with close-up 3D orbit controls,
 * memory metadata summary, quick navigation cycle, and deep inspection trigger.
 */

import React, { useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { PhotoMemoryItem } from '../types';
import { AudioSynthesizer } from '../engine/AudioSynthesizer';
import { SpatialAudioProcessor } from '../engine/SpatialAudioProcessor';

interface Props {
  focusedItem: PhotoMemoryItem | null;
  items: PhotoMemoryItem[];
  trailCount?: number;
  onExitFocus: () => void;
  onSelectNext: () => void;
  onSelectPrev: () => void;
  onOpenDeepInspect: (item: PhotoMemoryItem) => void;
}

export const FocusModeDock: React.FC<Props> = ({
  focusedItem,
  items,
  trailCount = 0,
  onExitFocus,
  onSelectNext,
  onSelectPrev,
  onOpenDeepInspect,
}) => {
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
        onSelectPrev();
      } else if (e.key === 'ArrowRight' || e.key === 'k' || e.key === 'K' || e.key === ']') {
        e.preventDefault();
        onSelectNext();
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        onOpenDeepInspect(focusedItem);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedItem, onExitFocus, onSelectNext, onSelectPrev, onOpenDeepInspect]);

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
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-[95vw] w-auto pointer-events-auto"
      >
        <div className="flex items-center gap-3.5 px-4 py-3 rounded-2xl bg-[#090b14]/85 backdrop-blur-2xl border border-sky-400/25 shadow-[0_16px_48px_rgba(0,0,0,0.6),0_0_24px_rgba(56,189,248,0.15)] text-white">
          {/* Pulsing Focus Mode Indicator */}
          <div className="hidden sm:flex flex-col items-center justify-center pr-3 border-r border-white/10">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-400/30 text-sky-300 text-[10px] font-semibold tracking-wider uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
              <span>Focus Orbit</span>
            </div>
            <div className="flex items-center gap-1.5 mt-1 font-mono text-[10px] text-white/40">
              <span>{currentIndex >= 0 ? `${currentIndex + 1} / ${totalCount}` : ''}</span>
              {trailCount > 1 && (
                <span className="text-cyan-300 font-semibold flex items-center gap-0.5" title={`Navigation trail: ${trailCount} visited items`}>
                  • <Route className="w-2.5 h-2.5 inline" /> {trailCount}
                </span>
              )}
            </div>
          </div>

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
                onSelectPrev();
              }}
              title="Previous Memory (← or [)"
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/15 active:scale-95 border border-white/10 flex items-center justify-center text-white/80 hover:text-white transition-all cursor-pointer"
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
                onSelectNext();
              }}
              title="Next Memory (→ or ])"
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/15 active:scale-95 border border-white/10 flex items-center justify-center text-white/80 hover:text-white transition-all cursor-pointer"
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
