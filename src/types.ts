/**
 * PhotoSphere 3D Memory Matrix - Core Type Definitions
 */

export type Layout3DMode = 'FIBONACCI_SPHERE' | 'DNA_HELIX' | 'GALAXY_CONSTELLATION' | 'CUBIC_MATRIX';

export type SpatialSortMode = 
  | 'CHRONOLOGICAL' 
  | 'GEOGRAPHIC' 
  | 'CHROMATIC' 
  | 'RELATIONAL' 
  | 'SEMANTIC';

export interface ExifData {
  cameraMake?: string;
  cameraModel?: string;
  focalLength?: number;
  fNumber?: number;
  iso?: number;
  exposureTime?: string;
  latitude?: number;
  longitude?: number;
  locationName?: string;
}

export interface PhotoMemoryItem {
  id: string;
  title: string;
  description?: string;
  timestamp: number; // UTC Epoch ms
  thumbnailUrl: string;
  highResUrl: string;
  dominantColor: string; // Hex code, e.g. "#38bdf8"
  hue: number; // 0 to 360 deg
  aspectRatio: number; // width / height
  exif: ExifData;
  people: string[]; // e.g. ["Charleigh", "Mom", "Dad"]
  tags: string[]; // e.g. ["birthday", "beach", "sunset", "outdoor"]
  category: 'Milestones' | 'Outdoor Adventures' | 'Bedtime Stories' | 'Celebrations' | 'Travel' | 'Everyday Joy';
  sentimentScore: number; // -1.0 to 1.0 (warmth/joy score)
  
  // Dynamic 3D Spatial Runtime Coordinates
  currentPos: [number, number, number];
  targetPos: [number, number, number];
  rotation: [number, number, number];
  targetRotation: [number, number, number];
  
  // Vector NLP & Highlight state
  matchScore: number; // 0.0 to 1.0
  isHighlighted: boolean;
  isSelected: boolean;
  opacity: number;
  scale: number;
}

export interface GooglePhotoItem {
  id: string;
  baseUrl: string;
  filename: string;
  mimeType?: string;
  productUrl?: string;
  mediaMetadata: {
    creationTime: string;
    width: string;
    height: string;
    photo?: {
      cameraMake?: string;
      cameraModel?: string;
      focalLength?: number;
      isoEquivalent?: number;
      apertureFNumber?: number;
      exposureTime?: string;
    };
  };
}

export interface VectorSearchResult {
  itemId: string;
  score: number;
  matchedTokens: string[];
}

export interface SpatialClusterTheme {
  id: string;
  themeTitle: string;
  themeSubtitle: string;
  category: string;
  topTokens: string[];
  centroid: [number, number, number];
  color: string;
  itemCount: number;
}

export interface EngineStats {
  photoCount: number;
  sphereRadius: number;
  cameraDistance: number;
  fps: number;
  drawCalls: number;
  searchLatencyMs: number;
  activeLayout: Layout3DMode;
  activeSort: SpatialSortMode;
}
