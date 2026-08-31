/**
 * useGooglePhotosSync.ts
 * React hook implementing background polling with setInterval to periodically
 * fetch and refresh data from the Google Photos API every 5 minutes (300,000ms),
 * keeping the 3D PhotoSphere matrix synchronized.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { GooglePhotosConnector } from '../connectors/GooglePhotosConnector';
import { GooglePhotoItem, PhotoMemoryItem } from '../types';

export const DEFAULT_GOOGLE_PHOTOS_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export interface UseGooglePhotosSyncOptions {
  /** Explicit token or fallback to GooglePhotosConnector.getActiveToken() */
  token?: string;
  /** Optional Google Photos Album ID to filter synchronization */
  albumId?: string;
  /** Polling interval in milliseconds (defaults to 5 minutes: 300,000ms) */
  intervalMs?: number;
  /** Enable or pause background synchronization */
  enabled?: boolean;
  /** Maximum number of media items to retrieve per sync cycle (default: 200) */
  maxItems?: number;
  /** Whether to execute an immediate fetch upon mount / token load (default: true) */
  initialFetch?: boolean;
  /** Callback fired when a sync cycle successfully completes */
  onSyncSuccess?: (items: PhotoMemoryItem[], rawItems: GooglePhotoItem[]) => void;
  /** Callback fired when a sync cycle encounters an error */
  onSyncError?: (error: Error) => void;
}

export interface UseGooglePhotosSyncReturn {
  /** True while a sync network request is actively in flight */
  isSyncing: boolean;
  /** True when the background setInterval polling timer is actively running */
  isPolling: boolean;
  /** Timestamp of the most recent successful sync */
  lastSyncTime: Date | null;
  /** Total number of successful sync cycles completed in this session */
  syncCount: number;
  /** Error object from the last failed sync attempt, or null */
  error: Error | null;
  /** Human-readable error message, or null */
  errorMessage: string | null;
  /** Synced PhotoMemoryItems converted for the 3D PhotoSphere engine */
  items: PhotoMemoryItem[];
  /** Manually trigger an immediate sync cycle and reset the interval timer */
  triggerSync: (overrideToken?: string) => Promise<PhotoMemoryItem[] | null>;
  /** Start or resume background polling */
  startPolling: () => void;
  /** Stop or pause background polling */
  stopPolling: () => void;
  /** Update the active OAuth token */
  setToken: (token: string) => void;
  /** Current active token being used */
  activeToken: string;
}

export function useGooglePhotosSync(
  options: UseGooglePhotosSyncOptions = {}
): UseGooglePhotosSyncReturn {
  const {
    token: propToken,
    albumId,
    intervalMs = DEFAULT_GOOGLE_PHOTOS_SYNC_INTERVAL_MS,
    enabled = true,
    maxItems = 200,
    initialFetch = true,
    onSyncSuccess,
    onSyncError,
  } = options;

  // Active OAuth Bearer token state
  const [activeToken, setActiveTokenState] = useState<string>(() => {
    return propToken || GooglePhotosConnector.getActiveToken();
  });

  // Keep activeToken in sync if prop changes
  useEffect(() => {
    if (propToken && propToken !== activeToken) {
      setActiveTokenState(propToken);
    }
  }, [propToken]);

  // Hook state
  const [items, setItems] = useState<PhotoMemoryItem[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isPolling, setIsPolling] = useState<boolean>(enabled);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncCount, setSyncCount] = useState<number>(0);
  const [error, setError] = useState<Error | null>(null);

  // References to prevent race conditions & stale closures
  const isSyncingRef = useRef<boolean>(false);
  const onSyncSuccessRef = useRef(onSyncSuccess);
  const onSyncErrorRef = useRef(onSyncError);
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    onSyncSuccessRef.current = onSyncSuccess;
  }, [onSyncSuccess]);

  useEffect(() => {
    onSyncErrorRef.current = onSyncError;
  }, [onSyncError]);

  // Set active token and persist to storage
  const setToken = useCallback((newToken: string) => {
    const cleanToken = newToken.trim().replace(/^Bearer\s+/i, '');
    setActiveTokenState(cleanToken);
    if (typeof window !== 'undefined' && cleanToken) {
      localStorage.setItem('photosphere_oauth_token', cleanToken);
    }
  }, []);

  const startPolling = useCallback(() => {
    setIsPolling(true);
  }, []);

  const stopPolling = useCallback(() => {
    setIsPolling(false);
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
  }, []);

  /**
   * Performs the Google Photos API fetch and transforms the data into 3D items
   */
  const performSync = useCallback(
    async (tokenToUse?: string): Promise<PhotoMemoryItem[] | null> => {
      const token = (tokenToUse || activeToken || GooglePhotosConnector.getActiveToken() || '').trim();

      if (!token) {
        // No active token configured yet (idle state)
        return null;
      }

      // Prevent overlapping concurrent sync requests
      if (isSyncingRef.current) {
        return null;
      }

      isSyncingRef.current = true;
      setIsSyncing(true);
      setError(null);

      try {
        const rawPhotos: GooglePhotoItem[] = await GooglePhotosConnector.loadAlbumMedia(
          token,
          albumId,
          maxItems
        );

        if (!rawPhotos || rawPhotos.length === 0) {
          throw new Error('Google Photos API returned an empty media library.');
        }

        const convertedItems = GooglePhotosConnector.convertToPhotoMemoryItems(rawPhotos);

        // Preserve runtime interactive state (such as selections) across background poll updates
        setItems((prevItems) => {
          if (prevItems.length === 0) return convertedItems;
          const prevMap = new Map<string, PhotoMemoryItem>(prevItems.map((item) => [item.id, item]));

          return convertedItems.map((newItem) => {
            const existing = prevMap.get(newItem.id);
            if (existing) {
              return {
                ...newItem,
                currentPos: existing.currentPos,
                targetPos: existing.targetPos,
                rotation: existing.rotation,
                targetRotation: existing.targetRotation,
                isSelected: existing.isSelected,
                isHighlighted: existing.isHighlighted,
                matchScore: existing.matchScore,
              };
            }
            return newItem;
          });
        });

        const now = new Date();
        setLastSyncTime(now);
        setSyncCount((prev) => prev + 1);
        setError(null);

        GooglePhotosConnector.logAudit({
          category: 'SYSTEM_DIAGNOSTIC',
          status: 'SUCCESS',
          summary: `Background sync cycle #${syncCount + 1} completed (${convertedItems.length} photos refreshed)`,
          itemCount: convertedItems.length,
          metadata: {
            albumId: albumId || 'ALL_PHOTOS',
            syncCount: syncCount + 1,
          },
        });

        onSyncSuccessRef.current?.(convertedItems, rawPhotos);
        return convertedItems;
      } catch (err: any) {
        const errorObj = err instanceof Error ? err : new Error(String(err));
        const isAuthError =
          errorObj.message.includes('expired') ||
          errorObj.message.includes('invalid') ||
          errorObj.message.includes('401') ||
          errorObj.message.includes('403') ||
          errorObj.message.includes('UNAUTHENTICATED') ||
          errorObj.message.includes('PERMISSION_DENIED') ||
          errorObj.message.includes('insufficient') ||
          errorObj.message.includes('Missing required scope') ||
          errorObj.message.includes('scope');

        if (isAuthError) {
          // Pause automatic polling and clean stored expired/unauthorized token
          stopPolling();
          setActiveTokenState('');
          if (typeof window !== 'undefined') {
            localStorage.removeItem('photosphere_oauth_token');
            localStorage.removeItem('gp_oauth_access_token');
          }
        }

        GooglePhotosConnector.logAudit({
          category: 'SYSTEM_DIAGNOSTIC',
          status: 'FAILURE',
          summary: `Background sync cycle failed: ${errorObj.message}`,
          errorDetails: {
            message: errorObj.message,
            stack: errorObj.stack,
          },
          diagnosticNotes: isAuthError
            ? ['Stored token expired, invalid, or missing photoslibrary.readonly scope. Automatic polling paused until re-authenticated.']
            : undefined,
        });
        setError(errorObj);
        onSyncErrorRef.current?.(errorObj);
        return null;
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    },
    [activeToken, albumId, maxItems, syncCount, stopPolling]
  );

  /**
   * Manually trigger an immediate sync and restart the interval timer
   */
  const triggerSync = useCallback(
    async (overrideToken?: string): Promise<PhotoMemoryItem[] | null> => {
      const result = await performSync(overrideToken);
      // If polling is active, reset the interval timer so the next poll happens after a full intervalMs
      if (isPolling && intervalMs > 0) {
        if (intervalIdRef.current) {
          clearInterval(intervalIdRef.current);
        }
        intervalIdRef.current = setInterval(() => {
          performSync();
        }, intervalMs);
      }
      return result;
    },
    [performSync, isPolling, intervalMs]
  );

  // Update polling state when enabled prop changes
  useEffect(() => {
    setIsPolling(enabled);
  }, [enabled]);

  // Background Polling Engine using setInterval (every intervalMs, default 5 mins)
  useEffect(() => {
    if (!isPolling || intervalMs <= 0 || !activeToken) {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
      return;
    }

    // Execute initial sync if configured and token is present
    if (initialFetch && activeToken) {
      performSync();
    }

    // Setup periodic polling timer
    intervalIdRef.current = setInterval(() => {
      performSync();
    }, intervalMs);

    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    };
  }, [isPolling, intervalMs, activeToken, albumId, initialFetch, performSync]);

  return {
    isSyncing,
    isPolling,
    lastSyncTime,
    syncCount,
    error,
    errorMessage: error ? error.message : null,
    items,
    triggerSync,
    startPolling,
    stopPolling,
    setToken,
    activeToken,
  };
}
