/**
 * App.tsx
 * PhotoSphere 3D Memory Matrix - Main Application Entrypoint
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { PhotoSphereCanvas, XRControllerHandle } from './components/PhotoSphereCanvas';
import { GlassmorphicHUD } from './components/GlassmorphicHUD';
import { DeepInspectionModal } from './components/DeepInspectionModal';
import { GooglePhotosModal } from './components/GooglePhotosModal';
import { LocalUploadModal } from './components/LocalUploadModal';
import { VRImmersionModal } from './components/VRImmersionModal';
import { BatchActionBar } from './components/BatchActionBar';
import { FocusModeDock } from './components/FocusModeDock';
import { PhotoMemoryItem, Layout3DMode, SpatialSortMode, EngineStats } from './types';
import { generateSampleAlbum } from './data/sampleMemories';
import { VectorNlpEngine } from './engine/VectorNlpEngine';
import { AudioSynthesizer } from './engine/AudioSynthesizer';
import { SpatialLayoutEngine } from './math/SpatialLayoutEngine';
import { GooglePhotosConnector } from './connectors/GooglePhotosConnector';
import { useGooglePhotosSync } from './hooks/useGooglePhotosSync';
import { useBackgroundThemeAnalyzer } from './hooks/useBackgroundThemeAnalyzer';
import { FocusTrailEngine } from './engine/FocusTrailEngine';

export default function App() {
  // Core Memory State
  const [items, setItems] = useState<PhotoMemoryItem[]>(() => generateSampleAlbum(120));
  const [activeSourceName, setActiveSourceName] = useState<string>("Charleigh Rae's Memory Matrix (Sample)");
  const [layoutMode, setLayoutMode] = useState<Layout3DMode>('FIBONACCI_SPHERE');
  const [sortMode, setSortMode] = useState<SpatialSortMode>('CHRONOLOGICAL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inspectedItem, setInspectedItem] = useState<PhotoMemoryItem | null>(null);
  const [focusedItem, setFocusedItem] = useState<PhotoMemoryItem | null>(null);
  const [showClusterLabels, setShowClusterLabels] = useState<boolean>(true);
  const [showFocusTrail, setShowFocusTrail] = useState<boolean>(true);
  const [trailCount, setTrailCount] = useState<number>(0);

  const handleToggleFocusTrail = useCallback(() => {
    setShowFocusTrail((prev) => !prev);
    AudioSynthesizer.playSearchFilter();
  }, []);

  const handleClearTrail = useCallback(() => {
    FocusTrailEngine.getInstance().clear();
    setTrailCount(0);
    AudioSynthesizer.playSearchFilter();
  }, []);

  // Automated Background Image & Metadata Theme Extraction Hook
  const handleItemEnriched = useCallback((enrichedItem: PhotoMemoryItem) => {
    setItems((prevItems) => {
      const idx = prevItems.findIndex((item) => item.id === enrichedItem.id);
      if (idx === -1) return prevItems;
      const currentTags = prevItems[idx].tags;
      if (
        currentTags.length === enrichedItem.tags.length &&
        currentTags.every((t, i) => t === enrichedItem.tags[i])
      ) {
        return prevItems;
      }
      const next = [...prevItems];
      next[idx] = { ...next[idx], tags: enrichedItem.tags };
      return next;
    });
  }, []);

  const {
    progress: themeProgress,
    topThemes,
    triggerReanalysis,
    getReportForItem,
  } = useBackgroundThemeAnalyzer({
    items,
    autoStart: true,
    onItemEnriched: handleItemEnriched,
  });

  // WebXR VR Immersion States
  const [isVrModalOpen, setIsVrModalOpen] = useState(false);
  const [isVrActive, setIsVrActive] = useState(false);
  const [vrPerformanceMode, setVrPerformanceMode] = useState<boolean>(true);
  const [vrGestureSensitivity, setVrGestureSensitivity] = useState<number>(1.0);
  const xrControlRef = useRef<XRControllerHandle | null>(null);

  // Modal Dialog States
  const [isGooglePhotosOpen, setIsGooglePhotosOpen] = useState(false);
  const [isLocalUploadOpen, setIsLocalUploadOpen] = useState(false);

  // Background Google Photos Sync Hook (Paused/Disabled in favor of local device batches)
  const handleSyncSuccess = useCallback((syncedItems: PhotoMemoryItem[]) => {
    if (syncedItems && syncedItems.length > 0) {
      setItems(syncedItems);
      setActiveSourceName(`Google Photos (${syncedItems.length} photos)`);
      setStats((prev) => ({
        ...prev,
        photoCount: syncedItems.length,
        sphereRadius: Math.round(SpatialLayoutEngine.computeDynamicRadius(syncedItems.length)),
      }));
      AudioSynthesizer.playLayoutSwoosh(0);
    }
  }, []);

  const {
    isSyncing,
    triggerSync,
    setToken: setSyncToken,
  } = useGooglePhotosSync({
    intervalMs: 5 * 60 * 1000,
    enabled: false, // Paused in favor of local device uploads
    initialFetch: false,
    onSyncSuccess: handleSyncSuccess,
    onSyncError: (err) => {
      console.warn('Google Photos sync:', err.message);
    },
  });

  // Telemetry Stats
  const [stats, setStats] = useState<EngineStats>({
    photoCount: 120,
    sphereRadius: 620,
    cameraDistance: 1400,
    fps: 60,
    drawCalls: 1,
    searchLatencyMs: 0.8,
    activeLayout: 'FIBONACCI_SPHERE',
    activeSort: 'CHRONOLOGICAL',
    autoRotationStatus: 'ACTIVE',
  });

  // Ambient Auto-Rotation State & Controls
  const [autoRotateEnabled, setAutoRotateEnabled] = useState<boolean>(true);

  const handleToggleAutoRotate = useCallback(() => {
    setAutoRotateEnabled((prev) => !prev);
    AudioSynthesizer.playSearchFilter();
  }, []);

  // Zero-dependency Client-Side Vector NLP Engine
  const nlpEngine = useMemo(() => new VectorNlpEngine(), []);

  // Index items whenever memory list changes
  useEffect(() => {
    nlpEngine.indexItems(items);
  }, [items, nlpEngine]);

  // Execute sub-5ms vector search when search query updates
  useEffect(() => {
    const { results, latencyMs } = nlpEngine.search(searchQuery, items);

    const scoreMap = new Map<string, number>();
    for (const res of results) {
      scoreMap.set(res.itemId, res.score);
    }

    setItems((prevItems) =>
      prevItems.map((item) => {
        const score = scoreMap.get(item.id) ?? 1.0;
        return {
          ...item,
          matchScore: score,
        };
      })
    );

    setStats((prev) => ({
      ...prev,
      searchLatencyMs: latencyMs,
    }));

    if (searchQuery.trim().length > 0) {
      AudioSynthesizer.playSearchFilter();
    }
  }, [searchQuery, nlpEngine]);

  // Layout Mode Change with Harmonic Audio Swoosh
  const handleLayoutChange = useCallback(
    (mode: Layout3DMode) => {
      const modeIdx = ['FIBONACCI_SPHERE', 'DNA_HELIX', 'GALAXY_CONSTELLATION', 'CUBIC_MATRIX'].indexOf(mode);
      AudioSynthesizer.playLayoutSwoosh(modeIdx >= 0 ? modeIdx : 0);
      setLayoutMode(mode);
      setStats((prev) => ({ ...prev, activeLayout: mode }));
    },
    []
  );

  // Sort Mode Change
  const handleSortChange = useCallback((mode: SpatialSortMode) => {
    AudioSynthesizer.playLayoutSwoosh(1);
    setSortMode(mode);
    setStats((prev) => ({ ...prev, activeSort: mode }));
  }, []);

  // Ingest external or demo photos into 3D space
  const handleIngestPhotos = useCallback((newItems: PhotoMemoryItem[], albumName: string) => {
    setItems(newItems);
    setActiveSourceName(albumName);
    setSelectedIds(new Set());
    setSearchQuery('');
    setStats((prev) => ({
      ...prev,
      photoCount: newItems.length,
      sphereRadius: Math.round(SpatialLayoutEngine.computeDynamicRadius(newItems.length)),
    }));
    const currentToken = GooglePhotosConnector.getActiveToken();
    if (currentToken && albumName.includes('Google Photos')) {
      setSyncToken(currentToken);
    }
  }, [setSyncToken]);

  // Add or Replace local uploaded photo items & batches
  const handleAddLocalItems = useCallback(
    (uploaded: PhotoMemoryItem[], replaceMode = false, batchName?: string) => {
      const sourceTitle = batchName || `Device Batch (${uploaded.length} photos)`;
      if (replaceMode) {
        setItems(uploaded);
        setActiveSourceName(sourceTitle);
        setSelectedIds(new Set());
        setSearchQuery('');
        setStats((prev) => ({
          ...prev,
          photoCount: uploaded.length,
          sphereRadius: Math.round(SpatialLayoutEngine.computeDynamicRadius(uploaded.length)),
        }));
      } else {
        setItems((prev) => [...uploaded, ...prev]);
        setActiveSourceName(`${sourceTitle} (+${uploaded.length})`);
        setStats((prev) => ({
          ...prev,
          photoCount: prev.photoCount + uploaded.length,
          sphereRadius: Math.round(
            SpatialLayoutEngine.computeDynamicRadius(prev.photoCount + uploaded.length)
          ),
        }));
      }
    },
    []
  );

  // Next / Prev & Matching Items
  const activeMatchingItems = useMemo(() => {
    if (selectedIds.size > 0) {
      return items.filter((i) => selectedIds.has(i.id));
    }
    if (searchQuery.trim().length > 0) {
      return items.filter((i) => i.matchScore > 0.15);
    }
    return items;
  }, [items, selectedIds, searchQuery]);

  // Batch Selection Helpers
  const handleSelectAll = useCallback(() => {
    const allMatching = activeMatchingItems.map((i) => i.id);
    setSelectedIds(new Set(allMatching));
    AudioSynthesizer.playCardSelect(180);
  }, [activeMatchingItems]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBatchDelete = useCallback((idsToDelete: string[]) => {
    const deleteSet = new Set(idsToDelete);
    setItems((prev) => {
      const next = prev.filter((item) => !deleteSet.has(item.id));
      setStats((s) => ({
        ...s,
        photoCount: next.length,
        sphereRadius: Math.round(SpatialLayoutEngine.computeDynamicRadius(next.length)),
      }));
      return next;
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      idsToDelete.forEach((id) => next.delete(id));
      return next;
    });
    if (focusedItem && deleteSet.has(focusedItem.id)) {
      setFocusedItem(null);
    }
    if (inspectedItem && deleteSet.has(inspectedItem.id)) {
      setInspectedItem(null);
    }
    AudioSynthesizer.playLayoutSwoosh(3);
  }, [focusedItem, inspectedItem]);

  const handleBatchAddTag = useCallback((idsToTag: string[], newTag: string) => {
    const tagSet = new Set(idsToTag);
    setItems((prev) =>
      prev.map((item) => {
        if (tagSet.has(item.id)) {
          return {
            ...item,
            tags: Array.from(new Set([...item.tags, newTag])),
          };
        }
        return item;
      })
    );
    AudioSynthesizer.playSearchFilter();
  }, []);

  // Quick Preset Count Switcher
  const handlePresetCountChange = useCallback((count: number) => {
    const newAlbum = generateSampleAlbum(count);
    setItems(newAlbum);
    setActiveSourceName(`Synthetic Matrix (${count} items)`);
    setSelectedIds(new Set());
    setSearchQuery('');
  }, []);

  // Lasso Multi-selection Handler
  const handleLassoSelect = useCallback((selected: string[]) => {
    setSelectedIds(new Set(selected));
  }, []);

  const handleToggleSelectId = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleFocusNext = useCallback(() => {
    if (!focusedItem || activeMatchingItems.length === 0) return;
    const currentIndex = activeMatchingItems.findIndex((i) => i.id === focusedItem.id);
    const nextIndex = (currentIndex + 1) % activeMatchingItems.length;
    const nextItem = activeMatchingItems[nextIndex];
    AudioSynthesizer.playCardSelect(nextItem.hue);
    setFocusedItem(nextItem);
  }, [focusedItem, activeMatchingItems]);

  const handleFocusPrev = useCallback(() => {
    if (!focusedItem || activeMatchingItems.length === 0) return;
    const currentIndex = activeMatchingItems.findIndex((i) => i.id === focusedItem.id);
    const prevIndex = (currentIndex - 1 + activeMatchingItems.length) % activeMatchingItems.length;
    const prevItem = activeMatchingItems[prevIndex];
    AudioSynthesizer.playCardSelect(prevItem.hue);
    setFocusedItem(prevItem);
  }, [focusedItem, activeMatchingItems]);

  const handleSelectNext = useCallback(() => {
    if (!inspectedItem || activeMatchingItems.length === 0) return;
    const currentIndex = activeMatchingItems.findIndex((i) => i.id === inspectedItem.id);
    const nextIndex = (currentIndex + 1) % activeMatchingItems.length;
    const nextItem = activeMatchingItems[nextIndex];
    AudioSynthesizer.playCardSelect(nextItem.hue);
    setInspectedItem(nextItem);
    setFocusedItem(nextItem);
  }, [inspectedItem, activeMatchingItems]);

  const handleSelectPrev = useCallback(() => {
    if (!inspectedItem || activeMatchingItems.length === 0) return;
    const currentIndex = activeMatchingItems.findIndex((i) => i.id === inspectedItem.id);
    const prevIndex = (currentIndex - 1 + activeMatchingItems.length) % activeMatchingItems.length;
    const prevItem = activeMatchingItems[prevIndex];
    AudioSynthesizer.playCardSelect(prevItem.hue);
    setInspectedItem(prevItem);
    setFocusedItem(prevItem);
  }, [inspectedItem, activeMatchingItems]);

  // WebXR VR Immersion Controls
  const handleToggleVR = useCallback(() => {
    if (isVrActive) {
      xrControlRef.current?.endVR();
      setIsVrActive(false);
    } else {
      setIsVrModalOpen(true);
      AudioSynthesizer.playModalOpen();
    }
  }, [isVrActive]);

  const handleEnterVR = useCallback(async (customPerfMode?: boolean, customSensitivity?: number) => {
    if (xrControlRef.current) {
      const mode = customPerfMode !== undefined ? customPerfMode : vrPerformanceMode;
      const sensitivity = customSensitivity !== undefined ? customSensitivity : vrGestureSensitivity;
      await xrControlRef.current.startVR(mode, sensitivity);
      setIsVrActive(true);
    }
  }, [vrPerformanceMode, vrGestureSensitivity]);

  const handleExitVR = useCallback(async () => {
    if (xrControlRef.current) {
      await xrControlRef.current.endVR();
      setIsVrActive(false);
    }
  }, []);

  // Export Selected JSON Ledger
  const handleExportSelected = () => {
    const selectedItems = items.filter((i) => selectedIds.has(i.id));
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(selectedItems, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `photosphere_selection_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#050507] text-[#e2e8f0] select-none font-sans flex flex-col">
      {/* Immersive UI Background Lighting Atmosphere & Orbital Geometry */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-[#1e40af] opacity-20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#7e22ce] opacity-10 blur-[150px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full border border-white/[0.03]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-white/[0.05]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border border-white/[0.02]" />
      </div>

      {/* 3D WebGL Three.js Spatial Canvas */}
      <div className="absolute inset-0 w-full h-full z-0">
        <PhotoSphereCanvas
          items={items}
          layoutMode={layoutMode}
          sortMode={sortMode}
          searchQuery={searchQuery}
          selectedIds={selectedIds}
          focusedItem={focusedItem}
          showClusterLabels={showClusterLabels}
          onSelectCard={(item) => setInspectedItem(item)}
          onFocusItem={(item) => setFocusedItem(item)}
          onLassoSelect={handleLassoSelect}
          onToggleSelectId={handleToggleSelectId}
          onLayoutChange={handleLayoutChange}
          onSearchChange={setSearchQuery}
          onToggleClusterLabels={() => setShowClusterLabels((prev) => !prev)}
          onXRReady={(xr) => {
            xrControlRef.current = xr;
          }}
          onVRStateChange={setIsVrActive}
          vrPerformanceMode={vrPerformanceMode}
          vrGestureSensitivity={vrGestureSensitivity}
          showFocusTrail={showFocusTrail}
          onToggleFocusTrail={handleToggleFocusTrail}
          onTrailCountChange={setTrailCount}
          autoRotateEnabled={autoRotateEnabled}
          onToggleAutoRotate={handleToggleAutoRotate}
          onStatsUpdate={(newStats) => {
            setStats((prev) => ({
              ...prev,
              ...newStats,
            }));
          }}
        />
      </div>

      {/* Floating Zero-Occlusion Glassmorphic HUD */}
      <GlassmorphicHUD
        layoutMode={layoutMode}
        sortMode={sortMode}
        searchQuery={searchQuery}
        stats={stats}
        selectedCount={selectedIds.size}
        activeSourceName={activeSourceName}
        showClusterLabels={showClusterLabels}
        showFocusTrail={showFocusTrail}
        trailCount={trailCount}
        onToggleFocusTrail={handleToggleFocusTrail}
        onClearTrail={handleClearTrail}
        isVrActive={isVrActive}
        autoRotateEnabled={autoRotateEnabled}
        onToggleAutoRotate={handleToggleAutoRotate}
        themeProgress={themeProgress}
        topThemes={topThemes}
        onTriggerReanalysis={triggerReanalysis}
        onToggleClusterLabels={() => {
          setShowClusterLabels((prev) => !prev);
          AudioSynthesizer.playSearchFilter();
        }}
        onToggleVR={handleToggleVR}
        onLayoutChange={handleLayoutChange}
        onSortChange={handleSortChange}
        onSearchChange={setSearchQuery}
        onOpenGooglePhotos={() => setIsGooglePhotosOpen(true)}
        onOpenLocalUpload={() => setIsLocalUploadOpen(true)}
        onPresetCountChange={handlePresetCountChange}
        onResetCamera={() => setFocusedItem(null)}
        onSelectAll={handleSelectAll}
        onClearSelection={handleClearSelection}
      />

      {/* Focus Mode 3D Close-Up Orbit Dock */}
      {!inspectedItem && (
        <FocusModeDock
          focusedItem={focusedItem}
          items={activeMatchingItems}
          trailCount={trailCount}
          onExitFocus={() => setFocusedItem(null)}
          onSelectNext={handleFocusNext}
          onSelectPrev={handleFocusPrev}
          onOpenDeepInspect={(item) => setInspectedItem(item)}
        />
      )}

      {/* 3D Screen Lasso & Batch Operations Dock */}
      <BatchActionBar
        selectedIds={selectedIds}
        items={items}
        onClearSelection={handleClearSelection}
        onStartSlideshow={() => {
          const firstSelected = items.find((i) => selectedIds.has(i.id));
          if (firstSelected) {
            setFocusedItem(firstSelected);
            setInspectedItem(firstSelected);
          }
        }}
        onExportSelected={handleExportSelected}
        onBatchDelete={handleBatchDelete}
        onBatchAddTag={handleBatchAddTag}
        onSelectAllMatching={handleSelectAll}
      />

      {/* WebXR VR Immersion Launch & Device Modal */}
      <VRImmersionModal
        isOpen={isVrModalOpen}
        isVrActive={isVrActive}
        performanceMode={vrPerformanceMode}
        onTogglePerformanceMode={setVrPerformanceMode}
        gestureSensitivity={vrGestureSensitivity}
        onGestureSensitivityChange={setVrGestureSensitivity}
        onClose={() => setIsVrModalOpen(false)}
        onEnterVR={handleEnterVR}
        onExitVR={handleExitVR}
      />

      {/* 2.5D Parallax Deep Inspection Modal */}
      <DeepInspectionModal
        item={inspectedItem}
        allMatchingItems={activeMatchingItems}
        report={inspectedItem ? getReportForItem(inspectedItem.id) : undefined}
        onClose={() => setInspectedItem(null)}
        onSelectNext={handleSelectNext}
        onSelectPrev={handleSelectPrev}
      />

      {/* Google Photos GIS OAuth Ingestion Modal (Optional / Secondary) */}
      <GooglePhotosModal
        isOpen={isGooglePhotosOpen}
        onClose={() => setIsGooglePhotosOpen(false)}
        onIngestPhotos={handleIngestPhotos}
      />

      {/* Comprehensive Device Batch Photo Ingestion Studio */}
      <LocalUploadModal
        isOpen={isLocalUploadOpen}
        onClose={() => setIsLocalUploadOpen(false)}
        onAddLocalItems={handleAddLocalItems}
      />
    </main>
  );
}
