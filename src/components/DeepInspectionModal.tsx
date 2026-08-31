/**
 * DeepInspectionModal.tsx
 * 2.5D Parallax Inspection Modal with EXIF metadata telemetry,
 * dominant color palette swatches, spatial audio waveforms, and mobile swipe-to-dismiss.
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  MapPin,
  Camera,
  Layers,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Heart,
  Share2,
  Download,
  Music,
  User,
  Tag,
  Compass,
} from 'lucide-react';
import { PhotoMemoryItem } from '../types';
import { AudioSynthesizer } from '../engine/AudioSynthesizer';
import { PhotoAnalysisReport, BackgroundThemeAnalyzer } from '../engine/BackgroundThemeAnalyzer';

interface Props {
  item: PhotoMemoryItem | null;
  allMatchingItems: PhotoMemoryItem[];
  report?: PhotoAnalysisReport;
  onClose: () => void;
  onSelectNext: () => void;
  onSelectPrev: () => void;
  onToggleFavorite?: (id: string) => void;
}

export const DeepInspectionModal: React.FC<Props> = ({
  item,
  allMatchingItems,
  report: propReport,
  onClose,
  onSelectNext,
  onSelectPrev,
  onToggleFavorite,
}) => {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [touchStartY, setTouchStartY] = useState(0);
  const [touchDeltaY, setTouchDeltaY] = useState(0);
  const [isFavorited, setIsFavorited] = useState(false);

  const report = propReport || (item ? BackgroundThemeAnalyzer.getInstance().getReport(item.id) : undefined);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onSelectNext();
      if (e.key === 'ArrowLeft') onSelectPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onSelectNext, onSelectPrev]);

  if (!item) return null;

  const dateFormatted = new Date(item.timestamp).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const timeFormatted = new Date(item.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const currentIndex = allMatchingItems.findIndex((i) => i.id === item.id);
  const totalCount = allMatchingItems.length;

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const delta = e.touches[0].clientY - touchStartY;
    if (delta > 0) {
      setTouchDeltaY(delta);
    }
  };

  const handleTouchEnd = () => {
    if (touchDeltaY > 120) {
      onClose();
    }
    setTouchDeltaY(0);
  };

  const toggleSoundscape = () => {
    AudioSynthesizer.playCardSelect(item.hue);
    setIsPlayingAudio(!isPlayingAudio);
  };

  return (
    <div
      id="photosphere-inspection-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-md animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="photosphere-inspection-card"
        style={{ transform: `translateY(${touchDeltaY}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative flex flex-col lg:flex-row w-full max-w-5xl max-h-[92vh] bg-[#050507]/95 border border-white/15 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden transition-transform backdrop-blur-2xl"
      >
        {/* Mobile Swipe Dismiss Handle */}
        <div className="lg:hidden w-full flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 rounded-full bg-white/20" />
        </div>

        {/* Left: High-Res 2.5D Parallax Image Viewer */}
        <div className="relative flex-1 bg-black/50 flex items-center justify-center min-h-[300px] lg:min-h-[500px] overflow-hidden group">
          {/* Subtle Ambient Radial Glow matching Photo Dominant Hue */}
          <div
            className="absolute inset-0 opacity-25 blur-3xl pointer-events-none transition-all duration-700"
            style={{
              background: `radial-gradient(circle at center, ${item.dominantColor}, transparent 70%)`,
            }}
          />

          <img
            src={item.highResUrl || item.thumbnailUrl}
            alt={item.title}
            className="max-h-[75vh] w-auto object-contain z-10 rounded-xl shadow-2xl transition-transform duration-500 group-hover:scale-[1.02]"
          />

          {/* Previous / Next Arrow Controls */}
          {totalCount > 1 && (
            <>
              <button
                id="photosphere-btn-prev"
                onClick={onSelectPrev}
                title="Previous Memory (Left Arrow)"
                className="absolute left-4 z-20 flex items-center justify-center w-11 h-11 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-white hover:bg-white/10 transition-all shadow-lg"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                id="photosphere-btn-next"
                onClick={onSelectNext}
                title="Next Memory (Right Arrow)"
                className="absolute right-4 z-20 flex items-center justify-center w-11 h-11 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-white hover:bg-white/10 transition-all shadow-lg"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {/* Index Counter Pill */}
          <div className="absolute top-4 left-4 z-20 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-[11px] font-mono text-white/80">
            {currentIndex + 1} / {totalCount}
          </div>
        </div>

        {/* Right: EXIF Metadata, Swatches, and Relational Tags Panel */}
        <div className="w-full lg:w-[380px] p-6 flex flex-col justify-between overflow-y-auto border-t lg:border-t-0 lg:border-l border-white/10">
          <div>
            {/* Header & Close */}
            <div className="flex items-start justify-between gap-2 mb-4">
              <div>
                <span className="inline-block text-[10px] font-bold tracking-widest uppercase px-2.5 py-0.5 rounded-full bg-[#38bdf8]/15 text-[#38bdf8] border border-[#38bdf8]/30 mb-2 font-mono">
                  {item.category}
                </span>
                <h2 className="text-xl font-bold tracking-tight text-white/95">{item.title}</h2>
              </div>
              <button
                id="photosphere-btn-close-inspection"
                onClick={onClose}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Description */}
            {item.description && (
              <p className="text-xs text-white/70 mb-4 leading-relaxed bg-white/5 p-3 rounded-xl border border-white/10">
                {item.description}
              </p>
            )}

            {/* Date & Location telemetry */}
            <div className="space-y-2 mb-5 text-xs text-white/80">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#38bdf8] shrink-0" />
                <span>{dateFormatted} at {timeFormatted}</span>
              </div>
              {item.exif.locationName && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-[#4ade80] shrink-0" />
                  <span>{item.exif.locationName}</span>
                </div>
              )}
            </div>

            {/* EXIF Camera Specs Grid */}
            <div className="mb-5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2 flex items-center gap-1.5 font-mono">
                <Camera className="w-3.5 h-3.5 text-[#fbbf24]" />
                <span>EXIF Optical Diagnostics</span>
              </div>
              <div className="grid grid-cols-2 gap-2 bg-white/5 p-3 rounded-2xl border border-white/10 font-mono text-[11px]">
                <div>
                  <span className="text-white/40">Camera:</span>
                  <div className="text-white/90 font-medium truncate">{item.exif.cameraMake || 'Sony / Pixel Pro'}</div>
                </div>
                <div>
                  <span className="text-white/40">Lens:</span>
                  <div className="text-white/90 font-medium">{item.exif.focalLength || 35}mm</div>
                </div>
                <div>
                  <span className="text-white/40">ISO:</span>
                  <div className="text-white/90 font-medium">ISO {item.exif.iso || 100}</div>
                </div>
                <div>
                  <span className="text-white/40">Shutter:</span>
                  <div className="text-white/90 font-medium">{item.exif.exposureTime || '1/500s'}</div>
                </div>
              </div>
            </div>

            {/* Dominant Color Swatch Palette */}
            <div className="mb-5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2 flex items-center justify-between font-mono">
                <span>Color Harmony ({item.hue}° Hue)</span>
                <span className="font-mono text-[#38bdf8]">{item.dominantColor}</span>
              </div>
              <div className="flex items-center gap-2 h-7 rounded-xl overflow-hidden border border-white/10 p-1 bg-black/40">
                <div
                  className="h-full flex-1 rounded-lg"
                  style={{ backgroundColor: `hsl(${item.hue}, 85%, 65%)` }}
                />
                <div
                  className="h-full flex-1 rounded-lg"
                  style={{ backgroundColor: `hsl(${(item.hue + 30) % 360}, 75%, 50%)` }}
                />
                <div
                  className="h-full flex-1 rounded-lg"
                  style={{ backgroundColor: `hsl(${(item.hue + 60) % 360}, 65%, 35%)` }}
                />
                <div
                  className="h-full flex-1 rounded-lg"
                  style={{ backgroundColor: `hsl(${(item.hue + 180) % 360}, 70%, 55%)` }}
                />
              </div>
            </div>

            {/* AI Extracted Themes via Automated Background Analysis */}
            {report && report.extractedThemes.length > 0 && (
              <div className="mb-4 p-3 rounded-2xl bg-sky-950/20 border border-sky-400/20 backdrop-blur-sm">
                <div className="text-[11px] font-bold uppercase tracking-wider text-sky-400 mb-2 flex items-center justify-between font-mono">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
                    <span>AI Extracted Themes</span>
                  </div>
                  <span className="text-[10px] text-sky-300/60 lowercase">
                    {report.extractedThemes[0].source.toLowerCase().replace('_', ' ')}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {report.extractedThemes.map((th) => (
                    <div
                      key={th.theme}
                      className="group/th relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/15 border border-sky-400/30 text-sky-200 text-xs font-mono"
                    >
                      <span className="font-semibold capitalize">#{th.theme}</span>
                      <span className="text-[10px] px-1 py-0.2 rounded bg-sky-400/20 text-sky-300 font-bold">
                        {Math.round(th.confidence * 100)}%
                      </span>
                    </div>
                  ))}
                </div>

                {/* Evidence telemetry breakdown */}
                {report.extractedThemes[0]?.evidence.length > 0 && (
                  <div className="text-[10px] font-mono text-white/50 space-y-0.5 border-t border-white/5 pt-1.5">
                    {report.extractedThemes.slice(0, 2).flatMap((t) => t.evidence).slice(0, 3).map((ev, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <span className="text-sky-400/80">•</span>
                        <span>{ev}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* People & Facial Clusters */}
            {item.people.length > 0 && (
              <div className="mb-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2 flex items-center gap-1.5 font-mono">
                  <User className="w-3.5 h-3.5 text-indigo-400" />
                  <span>People & Faces</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {item.people.map((person) => (
                    <span
                      key={person}
                      className="text-xs px-2.5 py-1 rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                    >
                      {person}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Semantic Tags */}
            {item.tags.length > 0 && (
              <div className="mb-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2 flex items-center gap-1.5 font-mono">
                  <Tag className="w-3.5 h-3.5 text-teal-400" />
                  <span>Semantic Vector Synsets</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded-md bg-white/5 text-white/60 border border-white/10 font-mono"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Action Affordances */}
          <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-2">
            <button
              onClick={toggleSoundscape}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                isPlayingAudio
                  ? 'bg-[#38bdf8] text-black shadow-[0_0_15px_rgba(56,189,248,0.5)] font-bold animate-pulse'
                  : 'bg-white/5 hover:bg-white/10 border border-white/10 text-white/80'
              }`}
            >
              <Music className="w-4 h-4" />
              <span>{isPlayingAudio ? 'Ambient Soundscape Active' : 'Play Harmonic Note'}</span>
            </button>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setIsFavorited(!isFavorited)}
                className={`p-2 rounded-xl border transition-colors ${
                  isFavorited
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                    : 'bg-white/5 border-white/10 text-white/40 hover:text-white'
                }`}
              >
                <Heart className={`w-4 h-4 ${isFavorited ? 'fill-current' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
