/**
 * useBackgroundThemeAnalyzer.ts
 * React hook for orchestrating the automated background theme extraction service.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { PhotoMemoryItem } from '../types';
import {
  BackgroundThemeAnalyzer,
  ThemeAnalyzerProgress,
  PhotoAnalysisReport,
} from '../engine/BackgroundThemeAnalyzer';

interface UseBackgroundThemeAnalyzerOptions {
  items: PhotoMemoryItem[];
  autoStart?: boolean;
  onItemEnriched?: (enrichedItem: PhotoMemoryItem) => void;
  onBatchComplete?: (themeDistribution: Record<string, number>) => void;
}

export function useBackgroundThemeAnalyzer({
  items,
  autoStart = true,
  onItemEnriched,
  onBatchComplete,
}: UseBackgroundThemeAnalyzerOptions) {
  const [progress, setProgress] = useState<ThemeAnalyzerProgress>({
    status: 'IDLE',
    processedCount: 0,
    totalCount: 0,
    percent: 100,
    themeDistribution: {},
    topExtractedThemes: [],
    latencyMs: 1.2,
  });

  const [reports, setReports] = useState<Map<string, PhotoAnalysisReport>>(new Map());
  const analyzerRef = useRef<BackgroundThemeAnalyzer>(BackgroundThemeAnalyzer.getInstance());
  const prevItemsLengthRef = useRef<number>(0);

  // Subscribe to progress and enriched items
  useEffect(() => {
    const analyzer = analyzerRef.current;

    const unsubProgress = analyzer.onProgress((p) => {
      setProgress(p);
      if (p.status === 'IDLE' && p.processedCount > 0 && p.processedCount === p.totalCount) {
        onBatchComplete?.(p.themeDistribution);
      }
    });

    const unsubEnriched = analyzer.onItemEnriched((enrichedItem, report) => {
      setReports((prev) => new Map(prev).set(enrichedItem.id, report));
      onItemEnriched?.(enrichedItem);
    });

    return () => {
      unsubProgress();
      unsubEnriched();
    };
  }, [onItemEnriched, onBatchComplete]);

  // Auto-enqueue items when album updates or new photos are uploaded
  useEffect(() => {
    if (!autoStart || items.length === 0) return;

    if (items.length !== prevItemsLengthRef.current) {
      prevItemsLengthRef.current = items.length;
      analyzerRef.current.enqueueItems(items);
    }
  }, [items, autoStart]);

  const triggerReanalysis = useCallback(() => {
    analyzerRef.current.enqueueItems(items, true);
  }, [items]);

  const getReportForItem = useCallback((itemId: string) => {
    return reports.get(itemId) || analyzerRef.current.getReport(itemId);
  }, [reports]);

  return {
    progress,
    reports,
    isAnalyzing: progress.status === 'ANALYZING',
    topThemes: progress.topExtractedThemes,
    triggerReanalysis,
    getReportForItem,
  };
}
