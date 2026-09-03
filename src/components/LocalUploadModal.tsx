/**
 * LocalUploadModal.tsx
 * Comprehensive Device Photo Batch Ingestion Studio.
 * Supports multi-file selection, whole-folder selection, drag-and-drop batch queuing,
 * per-photo batch selection toggles, batch naming/tagging, and append/replace modes.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  Upload,
  X,
  Image as ImageIcon,
  FolderOpen,
  CheckSquare,
  Square,
  Trash2,
  Sparkles,
  Plus,
  Layers,
  RefreshCw,
  Tag,
  CheckCircle2,
  FileText,
  Sliders,
} from 'lucide-react';
import { PhotoMemoryItem } from '../types';
import { TextureManager } from '../engine/TextureManager';
import { BackgroundThemeAnalyzer } from '../engine/BackgroundThemeAnalyzer';
import { AudioSynthesizer } from '../engine/AudioSynthesizer';
import { generateSampleAlbum } from '../data/sampleMemories';

interface StagedFileItem {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
  size: number;
  selected: boolean;
  aspect: number;
  dominantColor?: string;
  hue?: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAddLocalItems: (items: PhotoMemoryItem[], replaceMode?: boolean, batchName?: string) => void;
}

export const LocalUploadModal: React.FC<Props> = ({ isOpen, onClose, onAddLocalItems }) => {
  const [stagedFiles, setStagedFiles] = useState<StagedFileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [batchName, setBatchName] = useState<string>('My Device Batch');
  const [batchTags, setBatchTags] = useState<string>('device, upload, memory');
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFilesQueued = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (fileArray.length === 0) return;

    AudioSynthesizer.playCardSelect(180);

    const newStaged: StagedFileItem[] = [];
    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      const previewUrl = URL.createObjectURL(file);
      newStaged.push({
        id: `staged_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        file,
        previewUrl,
        name: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '),
        size: file.size,
        selected: true,
        aspect: 1.33,
      });
    }

    setStagedFiles((prev) => [...prev, ...newStaged]);
    if (!batchName || batchName === 'My Device Batch') {
      const dateStr = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      setBatchName(`Device Batch (${dateStr})`);
    }
  };

  const handleToggleSelectStaged = (id: string) => {
    setStagedFiles((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const handleSelectAllStaged = (selected: boolean) => {
    setStagedFiles((prev) => prev.map((item) => ({ ...item, selected })));
  };

  const handleRemoveStaged = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setStagedFiles((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const handleClearAllStaged = () => {
    stagedFiles.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    setStagedFiles([]);
  };

  const handleProcessAndIngest = async () => {
    const selectedToProcess = stagedFiles.filter((item) => item.selected);
    if (selectedToProcess.length === 0) return;

    setIsProcessing(true);
    setProcessedCount(0);

    const customTagList = batchTags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const newItems: PhotoMemoryItem[] = [];
    const analyzer = BackgroundThemeAnalyzer.getInstance();

    for (let i = 0; i < selectedToProcess.length; i++) {
      const staged = selectedToProcess[i];
      const { dataUrl, hue, dominantColor, aspect } = await TextureManager.analyzeLocalImage(staged.file);
      
      const rawItem: PhotoMemoryItem = {
        id: `local_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
        title: staged.name || `Photo #${i + 1}`,
        description: `Imported from device (${(staged.size / 1024).toFixed(0)} KB)`,
        timestamp: staged.file.lastModified || Date.now(),
        thumbnailUrl: dataUrl,
        highResUrl: dataUrl,
        dominantColor: dominantColor || '#38bdf8',
        hue: hue || 200,
        aspectRatio: aspect || 1.33,
        exif: {
          cameraMake: 'Local Device Upload',
          locationName: batchName || 'Local Album',
        },
        people: ['Local Batch'],
        tags: Array.from(new Set([...customTagList, 'device', 'upload', batchName.toLowerCase().replace(/\s+/g, '-')])),
        category: 'Everyday Joy',
        sentimentScore: 0.85,
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

      try {
        const report = await analyzer.analyzePhoto(rawItem);
        analyzer.enrichItemWithThemes(rawItem, report);
      } catch {
        // Continue gracefully
      }

      newItems.push(rawItem);
      setProcessedCount(i + 1);
    }

    AudioSynthesizer.playLayoutSwoosh(2);
    onAddLocalItems(newItems, importMode === 'replace', batchName);
    
    // Clean up URLs
    stagedFiles.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    setStagedFiles([]);
    setIsProcessing(false);
    onClose();
  };

  // Preset fast batch generator for instant testing
  const handleLoadPresetBatch = (count: number, presetName: string) => {
    setIsProcessing(true);
    setTimeout(() => {
      const presetItems = generateSampleAlbum(count);
      onAddLocalItems(presetItems, importMode === 'replace', presetName);
      setIsProcessing(false);
      onClose();
    }, 200);
  };

  const selectedCount = stagedFiles.filter((f) => f.selected).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-3xl bg-[#050507]/95 border border-white/15 rounded-3xl p-5 md:p-7 shadow-[0_0_60px_rgba(0,0,0,0.95)] overflow-hidden max-h-[92vh] flex flex-col backdrop-blur-2xl text-white/90">
        
        {/* Modal Header */}
        <div className="flex items-start justify-between pb-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-[0_0_20px_rgba(52,211,153,0.2)]">
              <Upload className="w-5 h-5 md:w-6 md:h-6" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-bold tracking-tight text-white/95 flex items-center gap-2">
                Device Photo & Batch Ingestion Studio
              </h2>
              <p className="text-[11px] md:text-xs text-white/50">
                Upload photos from your computer/device, select batches, extract chromatic hues, and visualize in 3D
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

        {/* Hidden Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFilesQueued(e.target.files);
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFilesQueued(e.target.files);
          }}
        />

        {/* Content Body */}
        <div className="overflow-y-auto pr-1 space-y-4 flex-1 my-3">
          {/* Action Row: Pick Files, Pick Folder, Quick Presets */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-xs font-semibold text-white/90 hover:text-white transition-all group shadow-sm"
            >
              <ImageIcon className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
              <span>Select Multiple Photos</span>
            </button>

            <button
              onClick={() => folderInputRef.current?.click()}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-xs font-semibold text-white/90 hover:text-white transition-all group shadow-sm"
            >
              <FolderOpen className="w-4 h-4 text-sky-400 group-hover:scale-110 transition-transform" />
              <span>Select Entire Folder</span>
            </button>

            <button
              onClick={() => handleLoadPresetBatch(48, 'Sample High-Density Matrix (48)')}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500/15 to-indigo-500/15 hover:from-purple-500/25 hover:to-indigo-500/25 border border-purple-500/30 rounded-2xl text-xs font-semibold text-purple-200 transition-all group"
            >
              <Sparkles className="w-4 h-4 text-purple-400 group-hover:rotate-12 transition-transform" />
              <span>Load Instant Demo Batch</span>
            </button>
          </div>

          {/* Drag & Drop Target Area (Shown when empty or collapsed) */}
          {stagedFiles.length === 0 ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files) handleFilesQueued(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`p-8 md:p-12 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]'
                  : 'border-white/15 hover:border-emerald-400/40 bg-white/5 hover:bg-white/10'
              }`}
            >
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-emerald-400 mb-3 shadow-inner">
                <Upload className="w-8 h-8" />
              </div>
              <h3 className="text-base font-semibold text-white/95 mb-1">
                Drag & Drop Photos or Entire Folders Here
              </h3>
              <p className="text-xs text-white/50 max-w-md">
                Select your batch of images (JPEG, PNG, WEBP, HEIC). Images are parsed 100% locally in your browser with real-time color extraction.
              </p>
              <div className="mt-4 flex items-center gap-2 text-[11px] font-mono text-emerald-400/80 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Zero Cloud OAuth required • Instant browser ingestion</span>
              </div>
            </div>
          ) : (
            /* Staged Batch Queue Preview with Selection Checkboxes */
            <div className="space-y-3">
              {/* Batch Configuration Strip */}
              <div className="p-3.5 bg-white/5 border border-white/10 rounded-2xl grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] uppercase font-mono tracking-wider text-white/40 mb-1">
                    Batch Name / Album
                  </label>
                  <input
                    type="text"
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    placeholder="e.g. Summer Vacation, Nature Trip, Batch #1"
                    className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-white/30 outline-none focus:border-emerald-400/50"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-mono tracking-wider text-white/40 mb-1">
                    Batch Tags (Comma separated)
                  </label>
                  <input
                    type="text"
                    value={batchTags}
                    onChange={(e) => setBatchTags(e.target.value)}
                    placeholder="e.g. vacation, family, summer"
                    className="w-full bg-black/40 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-white/30 outline-none focus:border-emerald-400/50"
                  />
                </div>
              </div>

              {/* Batch Selection Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-white/5 border border-white/10 rounded-2xl text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-emerald-400 font-bold">
                    {selectedCount} of {stagedFiles.length} photos selected
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleSelectAllStaged(true)}
                      className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white text-[11px] rounded-lg transition-colors font-medium"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => handleSelectAllStaged(false)}
                      className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-[11px] rounded-lg transition-colors"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white text-[11px] rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add More</span>
                  </button>
                  <button
                    onClick={handleClearAllStaged}
                    className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-[11px] rounded-lg transition-colors border border-rose-500/20 flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear Queue</span>
                  </button>
                </div>
              </div>

              {/* Thumbnail Grid with Selection Checkbox on Each Photo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5 max-h-[300px] overflow-y-auto p-1 scrollbar-thin">
                {stagedFiles.map((staged) => (
                  <div
                    key={staged.id}
                    onClick={() => handleToggleSelectStaged(staged.id)}
                    className={`group relative rounded-2xl overflow-hidden border cursor-pointer aspect-square bg-black/40 transition-all ${
                      staged.selected
                        ? 'border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)] ring-2 ring-emerald-400/40'
                        : 'border-white/10 opacity-50 hover:opacity-80'
                    }`}
                  >
                    <img
                      src={staged.previewUrl}
                      alt={staged.name}
                      className="w-full h-full object-cover"
                    />

                    {/* Checkbox Icon */}
                    <div className="absolute top-2 left-2 z-10">
                      {staged.selected ? (
                        <div className="w-5 h-5 rounded-md bg-emerald-500 text-black flex items-center justify-center shadow-md">
                          <CheckSquare className="w-3.5 h-3.5 fill-current" />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-md bg-black/60 border border-white/40 flex items-center justify-center text-white/40">
                          <Square className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>

                    {/* Delete Item Button */}
                    <button
                      onClick={(e) => handleRemoveStaged(staged.id, e)}
                      className="absolute top-2 right-2 z-10 w-5 h-5 rounded-md bg-black/70 hover:bg-rose-500 text-white/60 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                      title="Remove from batch"
                    >
                      <X className="w-3 h-3" />
                    </button>

                    {/* Title & Size overlay */}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2 text-[10px]">
                      <p className="font-semibold text-white/95 truncate">{staged.name}</p>
                      <p className="text-white/50 font-mono">{(staged.size / 1024).toFixed(0)} KB</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Processing Indicator */}
        {isProcessing && (
          <div className="my-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-3 text-xs text-emerald-300">
            <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <div className="font-mono">
              Analyzing chromatic hues & extracting spatial themes ({processedCount} processed)...
            </div>
          </div>
        )}

        {/* Modal Footer Controls */}
        <div className="pt-3 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-white/50 font-mono">Mode:</span>
            <div className="inline-flex p-0.5 bg-white/5 border border-white/10 rounded-xl">
              <button
                onClick={() => setImportMode('append')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  importMode === 'append'
                    ? 'bg-emerald-500 text-black shadow-sm'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Append to Sphere
              </button>
              <button
                onClick={() => setImportMode('replace')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  importMode === 'replace'
                    ? 'bg-amber-400 text-black shadow-sm'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Replace Matrix
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-medium text-white/70 hover:text-white transition-colors"
            >
              Cancel
            </button>

            <button
              id="btn-confirm-local-upload"
              onClick={handleProcessAndIngest}
              disabled={selectedCount === 0 || isProcessing}
              className="flex-1 sm:flex-none px-6 py-2.5 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>
                {selectedCount > 0
                  ? `Import ${selectedCount} Selected Photos`
                  : 'Select Photos to Import'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
