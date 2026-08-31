/**
 * BatchActionBar.tsx
 * Floating Dock for batch actions on photos picked via 3D Screen Lasso or multi-selection.
 */

import React from 'react';
import { Play, X, Filter, Download, Sparkles, CheckSquare } from 'lucide-react';
import { PhotoMemoryItem } from '../types';

interface Props {
  selectedIds: Set<string>;
  items: PhotoMemoryItem[];
  onClearSelection: () => void;
  onStartSlideshow: () => void;
  onExportSelected: () => void;
}

export const BatchActionBar: React.FC<Props> = ({
  selectedIds,
  items,
  onClearSelection,
  onStartSlideshow,
  onExportSelected,
}) => {
  if (selectedIds.size === 0) return null;

  return (
    <div
      id="photosphere-batch-bar"
      className="pointer-events-auto fixed bottom-24 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2.5 bg-[#050507]/90 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.8)] animate-slideUp text-white/90"
    >
      <div className="flex items-center gap-2 pr-3 border-r border-white/10">
        <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-[#38bdf8]/20 text-[#38bdf8] font-mono text-xs font-bold border border-[#38bdf8]/30">
          {selectedIds.size}
        </div>
        <span className="text-xs font-semibold text-white/90">
          Selected via 3D Lasso
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onStartSlideshow}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#38bdf8] hover:bg-[#38bdf8]/90 text-black text-xs font-bold shadow-[0_0_15px_rgba(56,189,248,0.4)] transition-all"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Inspect Selected</span>
        </button>

        <button
          onClick={onExportSelected}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 text-xs font-medium transition-all"
        >
          <Download className="w-3.5 h-3.5 text-white/40" />
          <span className="hidden sm:inline">Export Ledger</span>
        </button>

        <button
          onClick={onClearSelection}
          className="p-1.5 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-colors"
          title="Clear Selection (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
