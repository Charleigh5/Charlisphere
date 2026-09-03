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

  // Subscribe to progress and enriched items with throttling to avoid React state churn
  useEffect(() => {
    const analyzer = analyzerRef.current;
    let lastProgressTime = 0;
    let progressTimer: number | null = null;
    let pendingProgress: ThemeAnalyzerProgress | null = null;

    const unsubProgress = analyzer.onProgress((p) => {
      pendingProgress = p;
      const now = performance.now();
      if (p.status === 'IDLE' || now - lastProgressTime > 250) {
        lastProgressTime = now;
        if (progressTimer) clearTimeout(progressTimer);
        progressTimer = null;
        setProgress(p);
        if (p.status === 'IDLE' && p.processedCount > 0 && p.processedCount === p.totalCount) {
          onBatchComplete?.(p.themeDistribution);
        }
      } else if (!progressTimer) {
        progressTimer = window.setTimeout(() => {
          if (pendingProgress) {
            setProgress(pendingProgress);
            if (pendingProgress.status === 'IDLE' && pendingProgress.processedCount > 0 && pendingProgress.processedCount === pendingProgress.totalCount) {
              onBatchComplete?.(pendingProgress.themeDistribution);
            }
          }
          progressTimer = null;
        }, 250);
      }
    });

    let pendingReports: Array<{ item: PhotoMemoryItem; report: PhotoAnalysisReport }> = [];
    let flushEnrichedTimer: number | null = null;

    const flushEnriched = () => {
      if (pendingReports.length === 0) return;
      const batch = pendingReports;
      pendingReports = [];
      setReports((prev) => {
        const next = new Map(prev);
        for (const { item, report } of batch) {
          next.set(item.id, report);
        }
        return next;
      });
      for (const { item } of batch) {
        onItemEnriched?.(item);
      }
    };

    const unsubEnriched = analyzer.onItemEnriched((enrichedItem, report) => {
      pendingReports.push({ item: enrichedItem, report });
      if (!flushEnrichedTimer) {
        flushEnrichedTimer = window.setTimeout(() => {
          flushEnrichedTimer = null;
          flushEnriched();
        }, 200);
      }
    });

    return () => {
      if (progressTimer) clearTimeout(progressTimer);
      if (flushEnrichedTimer) clearTimeout(flushEnrichedTimer);
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
