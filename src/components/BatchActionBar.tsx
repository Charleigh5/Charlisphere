/**
 * BatchActionBar.tsx
 * Floating Dock for batch actions on photos picked via 3D Screen Lasso,
 * batch upload queues, or multi-selection filters.
 */

import React, { useState } from 'react';
import {
  Play,
  X,
  Filter,
  Download,
  Sparkles,
  CheckSquare,
  Trash2,
  Tag,
  Eye,
  Layers,
} from 'lucide-react';
import { PhotoMemoryItem } from '../types';

interface Props {
  selectedIds: Set<string>;
  items: PhotoMemoryItem[];
  onClearSelection: () => void;
  onStartSlideshow: () => void;
  onExportSelected: () => void;
  onBatchDelete?: (ids: string[]) => void;
  onBatchAddTag?: (ids: string[], newTag: string) => void;
  onSelectAllMatching?: () => void;
}

export const BatchActionBar: React.FC<Props> = ({
  selectedIds,
  items,
  onClearSelection,
  onStartSlideshow,
  onExportSelected,
  onBatchDelete,
  onBatchAddTag,
  onSelectAllMatching,
}) => {
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagText, setTagText] = useState('');

  if (selectedIds.size === 0) return null;

  const handleAddTagSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tagText.trim() && onBatchAddTag) {
      onBatchAddTag(Array.from(selectedIds), tagText.trim().toLowerCase());
      setTagText('');
      setShowTagInput(false);
    }
  };

  return (
    <div
      id="photosphere-batch-bar"
      className="pointer-events-auto fixed bottom-24 left-1/2 -translate-x-1/2 z-30 flex flex-wrap items-center gap-2.5 px-4 py-2.5 bg-[#050507]/92 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.85)] animate-slideUp text-white/90 max-w-[95vw]"
    >
      <div className="flex items-center gap-2 pr-3 border-r border-white/10 shrink-0">
        <div className="flex items-center justify-center min-w-6 h-6 px-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 font-mono text-xs font-bold border border-emerald-500/30">
          {selectedIds.size}
        </div>
        <span className="text-xs font-semibold text-white/90 hidden sm:inline">
          Selected in Batch
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Inspect Slideshow */}
        <button
          onClick={onStartSlideshow}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-black text-xs font-bold shadow-[0_0_15px_rgba(52,211,153,0.3)] transition-all"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Inspect Batch</span>
        </button>

        {/* Tag Batch */}
        {showTagInput ? (
          <form onSubmit={handleAddTagSubmit} className="flex items-center gap-1">
            <input
              type="text"
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              placeholder="Add tag..."
              autoFocus
              className="bg-black/60 border border-white/20 rounded-xl px-2.5 py-1 text-xs text-white outline-none focus:border-emerald-400 w-24"
            />
            <button
              type="submit"
              className="px-2 py-1 bg-emerald-500 text-black text-xs font-bold rounded-lg"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setShowTagInput(false)}
              className="p-1 text-white/50 hover:text-white"
            >
              ✕
            </button>
          </form>
        ) : (
          <button
            onClick={() => setShowTagInput(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-xs font-medium transition-all"
            title="Add Tag to Selected Photos"
          >
            <Tag className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden md:inline">Tag Batch</span>
          </button>
        )}

        {/* Export JSON */}
        <button
          onClick={onExportSelected}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-xs font-medium transition-all"
          title="Export Selected Photos JSON"
        >
          <Download className="w-3.5 h-3.5 text-white/40" />
          <span className="hidden sm:inline">Export</span>
        </button>

        {/* Batch Delete */}
        {onBatchDelete && (
          <button
            onClick={() => onBatchDelete(Array.from(selectedIds))}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-300 hover:text-rose-200 text-xs font-medium transition-all"
            title="Remove Selected Photos from Sphere"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Delete</span>
          </button>
        )}

        {/* Clear Selection */}
        <button
          onClick={onClearSelection}
          className="p-1.5 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-colors ml-1"
          title="Clear Selection (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
