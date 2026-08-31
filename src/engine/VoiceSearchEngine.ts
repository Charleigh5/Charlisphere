/**
 * VoiceSearchEngine.ts
 * Web Speech API integration engine for voice-activated vector NLP search and spatial matrix voice commands.
 */

import { AudioSynthesizer } from './AudioSynthesizer';
import { Layout3DMode, SpatialSortMode } from '../types';

export interface VoiceCommandMatch {
  type: 'SEARCH' | 'LAYOUT_CHANGE' | 'SORT_CHANGE' | 'RESET_CAMERA' | 'CLEAR_SEARCH' | 'TOGGLE_THEMES' | 'TOGGLE_VR';
  payload?: string | Layout3DMode | SpatialSortMode;
  rawTranscript: string;
}

export type VoiceStatus = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'ERROR' | 'UNSUPPORTED';

export interface VoiceSearchListenerCallbacks {
  onStatusChange?: (status: VoiceStatus, errorMsg?: string) => void;
  onInterimTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onCommandMatch?: (command: VoiceCommandMatch) => void;
}

// Window type augmentation for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export class VoiceSearchEngine {
  private static recognition: any = null;
  private static isListening = false;
  private static callbacks: VoiceSearchListenerCallbacks = {};

  /**
   * Checks if the Web Speech API (SpeechRecognition / webkitSpeechRecognition) is supported
   */
  public static isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /**
   * Cleans spoken natural language query by removing common filler prefixes
   */
  public static sanitizeVoiceQuery(raw: string): string {
    if (!raw) return '';
    let cleaned = raw.trim();

    // Strip leading conversational phrases
    const leadingPrefixes = [
      /^find\s+(all\s+)?(photos\s+of\s+|pictures\s+of\s+|images\s+of\s+|memories\s+of\s+|me\s+)?/i,
      /^search\s+(for\s+)?(all\s+)?(photos\s+of\s+|pictures\s+of\s+|images\s+of\s+|memories\s+of\s+|me\s+)?/i,
      /^show\s+(me\s+)?(all\s+)?(photos\s+of\s+|pictures\s+of\s+|images\s+of\s+|memories\s+of\s+)?/i,
      /^look\s+for\s+/i,
      /^filter\s+(by\s+)?/i,
      /^display\s+(all\s+)?/i,
    ];

    for (const prefix of leadingPrefixes) {
      cleaned = cleaned.replace(prefix, '');
    }

    return cleaned.trim();
  }

  /**
   * Parses voice transcript to determine if it is a structural navigation command or a semantic vector search
   */
  public static parseVoiceTranscript(rawTranscript: string): VoiceCommandMatch {
    const lower = rawTranscript.toLowerCase().trim();

    // Clear search command
    if (
      lower === 'clear search' ||
      lower === 'clear query' ||
      lower === 'reset search' ||
      lower === 'clear filter' ||
      lower === 'clear'
    ) {
      return { type: 'CLEAR_SEARCH', rawTranscript };
    }

    // Reset camera command
    if (
      lower.includes('reset camera') ||
      lower.includes('recenter camera') ||
      lower.includes('center view') ||
      lower.includes('recenter view') ||
      lower === 'reset'
    ) {
      return { type: 'RESET_CAMERA', rawTranscript };
    }

    // Layout commands
    if (lower.includes('dna') || lower.includes('helix') || lower.includes('double helix')) {
      return { type: 'LAYOUT_CHANGE', payload: 'DNA_HELIX', rawTranscript };
    }
    if (lower.includes('sphere') || lower.includes('fibonacci') || lower.includes('globe layout') || lower.includes('ball')) {
      return { type: 'LAYOUT_CHANGE', payload: 'FIBONACCI_SPHERE', rawTranscript };
    }
    if (lower.includes('galaxy') || lower.includes('constellation') || lower.includes('stars layout')) {
      return { type: 'LAYOUT_CHANGE', payload: 'GALAXY_CONSTELLATION', rawTranscript };
    }
    if (lower.includes('cubic') || lower.includes('matrix') || lower.includes('grid layout') || lower.includes('cube')) {
      return { type: 'LAYOUT_CHANGE', payload: 'CUBIC_MATRIX', rawTranscript };
    }

    // Sort mode commands
    if (lower.includes('timeline') || lower.includes('chronological') || lower.includes('sort by date') || lower.includes('sort by time')) {
      return { type: 'SORT_CHANGE', payload: 'CHRONOLOGICAL', rawTranscript };
    }
    if (lower.includes('geographic') || lower.includes('sort by location') || lower.includes('sort by place') || lower.includes('world sort')) {
      return { type: 'SORT_CHANGE', payload: 'GEOGRAPHIC', rawTranscript };
    }
    if (lower.includes('chromatic') || lower.includes('color hue') || lower.includes('sort by color') || lower.includes('rainbow sort')) {
      return { type: 'SORT_CHANGE', payload: 'CHROMATIC', rawTranscript };
    }
    if (lower.includes('relational') || lower.includes('people sort') || lower.includes('sort by people') || lower.includes('sort by faces')) {
      return { type: 'SORT_CHANGE', payload: 'RELATIONAL', rawTranscript };
    }
    if (lower.includes('narrative') || lower.includes('semantic sort') || lower.includes('sort by narrative') || lower.includes('theme sort')) {
      return { type: 'SORT_CHANGE', payload: 'SEMANTIC', rawTranscript };
    }

    // Toggle 3D Theme Labels
    if (lower.includes('theme labels') || lower.includes('toggle labels') || lower.includes('cluster labels')) {
      return { type: 'TOGGLE_THEMES', rawTranscript };
    }

    // Toggle VR
    if (lower.includes('virtual reality') || lower.includes('enter vr') || lower.includes('toggle vr') || lower.includes('headset')) {
      return { type: 'TOGGLE_VR', rawTranscript };
    }

    // Default: Vector NLP Search query
    const cleanedQuery = this.sanitizeVoiceQuery(rawTranscript);
    return {
      type: 'SEARCH',
      payload: cleanedQuery || rawTranscript.trim(),
      rawTranscript,
    };
  }

  /**
   * Starts speech recognition session with Web Speech API
   */
  public static startListening(callbacks: VoiceSearchListenerCallbacks): boolean {
    if (!this.isSupported()) {
      callbacks.onStatusChange?.('UNSUPPORTED', 'Web Speech API is not supported in this browser environment.');
      return false;
    }

    this.stopListening();
    this.callbacks = callbacks;

    try {
      const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognitionClass();

      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        this.isListening = true;
        this.callbacks.onStatusChange?.('LISTENING');
        try {
          AudioSynthesizer.playLayoutSwoosh(2);
        } catch {}
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            finalTranscript += item[0].transcript;
          } else {
            interimTranscript += item[0].transcript;
          }
        }

        if (interimTranscript && this.callbacks.onInterimTranscript) {
          this.callbacks.onInterimTranscript(interimTranscript);
        }

        if (finalTranscript) {
          this.callbacks.onFinalTranscript?.(finalTranscript);
          const commandMatch = this.parseVoiceTranscript(finalTranscript);
          this.callbacks.onCommandMatch?.(commandMatch);
          this.callbacks.onStatusChange?.('PROCESSING');
          try {
            AudioSynthesizer.playSearchFilter();
          } catch {}
        }
      };

      recognition.onerror = (event: any) => {
        const errorType = event.error || 'unknown';
        let humanMessage = 'Speech recognition encountered an issue.';

        if (errorType === 'not-allowed' || errorType === 'service-not-allowed') {
          humanMessage = 'Microphone permission denied. Please allow microphone access in your browser settings.';
        } else if (errorType === 'no-speech') {
          humanMessage = 'No speech detected. Please speak clearly into your microphone.';
        } else if (errorType === 'network') {
          humanMessage = 'Network connection required for voice recognition.';
        } else if (errorType === 'audio-capture') {
          humanMessage = 'No microphone hardware found or input audio failed.';
        }

        this.isListening = false;
        this.callbacks.onStatusChange?.('ERROR', humanMessage);
      };

      recognition.onend = () => {
        this.isListening = false;
        this.recognition = null;
        this.callbacks.onStatusChange?.('IDLE');
      };

      this.recognition = recognition;
      recognition.start();
      return true;
    } catch (err: any) {
      this.isListening = false;
      this.callbacks.onStatusChange?.('ERROR', err?.message || 'Failed to start speech recognition.');
      return false;
    }
  }

  /**
   * Stops active speech recognition
   */
  public static stopListening(): void {
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch {}
      this.recognition = null;
    }
    this.isListening = false;
    this.callbacks.onStatusChange?.('IDLE');
  }

  public static getIsListening(): boolean {
    return this.isListening;
  }
}
