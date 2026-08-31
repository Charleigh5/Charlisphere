/**
 * LocalUploadModal.tsx
 * Offline Local Image Drag-and-Drop Ingestion Engine with HTML5 Canvas Hue extraction.
 */

import React, { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Sparkles, CheckCircle2, FileText, Brain } from 'lucide-react';
import { PhotoMemoryItem } from '../types';
import { TextureManager } from '../engine/TextureManager';
import { BackgroundThemeAnalyzer } from '../engine/BackgroundThemeAnalyzer';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAddLocalItems: (items: PhotoMemoryItem[]) => void;
}

export const LocalUploadModal: React.FC<Props> = ({ isOpen, onClose, onAddLocalItems }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (fileArray.length === 0) return;

    setIsProcessing(true);
    setProcessedCount(0);

    const newItems: PhotoMemoryItem[] = [];
    const analyzer = BackgroundThemeAnalyzer.getInstance();

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const { dataUrl, hue, dominantColor, aspect } = await TextureManager.analyzeLocalImage(file);
      const title = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

      const rawItem: PhotoMemoryItem = {
        id: `local_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
        title,
        description: `Imported local photo (${(file.size / 1024).toFixed(0)} KB)`,
        timestamp: file.lastModified || Date.now(),
        thumbnailUrl: dataUrl,
        highResUrl: dataUrl,
        dominantColor,
        hue,
        aspectRatio: aspect,
        exif: {
          cameraMake: 'Local Upload Device',
          locationName: 'Local Storage',
        },
        people: ['Local Album'],
        tags: ['uploaded', 'local', 'memory'],
        category: 'Everyday Joy',
        sentimentScore: 0.8,
        currentPos: [0, 0, 0],
        targetPos: [0, 0, 0],
        rotation: [0, 0, 0],
        targetRotation: [0, 0, 0],
        matchScore: 1.0,
        isHighlighted: false,
        isSelected: false,
        opacity: 1.0,
        scale: 1.0,
      };

      // Perform local image analysis for common themes
      try {
        const report = await analyzer.analyzePhoto(rawItem);
        analyzer.enrichItemWithThemes(rawItem, report);
      } catch {
        // Fallback gracefully
      }

      newItems.push(rawItem);
      setProcessedCount(i + 1);
    }

    onAddLocalItems(newItems);
    setIsProcessing(false);
    onClose();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      processFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-xl bg-[#050507]/95 border border-white/15 rounded-3xl p-6 md:p-8 shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden backdrop-blur-2xl text-white/90">
        <div className="flex items-start justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-[#4ade80]/15 text-[#4ade80] border border-[#4ade80]/30">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold tracking-tight text-white/95">
                Drop Local Photo Files
              </h2>
              <p className="text-xs text-white/50">
                Instantly extract dominant color hues & integrate into 3D space
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) processFiles(e.target.files);
          }}
        />

        {/* Drag & Drop Target Box */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`mt-6 p-10 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-[#4ade80] bg-[#4ade80]/10 scale-[1.02]'
              : 'border-white/15 hover:border-white/30 bg-white/5 hover:bg-white/10'
          }`}
        >
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#4ade80] mb-4 shadow-inner">
            <ImageIcon className="w-8 h-8" />
          </div>
          <h3 className="text-base font-semibold text-white/90 mb-1">
            Drag & drop images here, or click to browse
          </h3>
          <p className="text-xs text-white/40 max-w-sm">
            Supports PNG, JPEG, WEBP, and HEIC files. Images are processed 100% locally in your browser.
          </p>
        </div>

        {isProcessing && (
          <div className="mt-4 p-4 bg-white/5 rounded-2xl border border-white/10 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-[#4ade80] border-t-transparent rounded-full animate-spin" />
            <div className="text-xs text-white/80">
              Processing & analyzing colors for {processedCount} photos...
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
