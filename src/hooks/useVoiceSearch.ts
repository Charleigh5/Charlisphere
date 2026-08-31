/**
 * useVoiceSearch.ts
 * React hook wrapper for the Web Speech API Voice Search Engine.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  VoiceSearchEngine,
  VoiceStatus,
  VoiceCommandMatch,
} from '../engine/VoiceSearchEngine';
import { Layout3DMode, SpatialSortMode } from '../types';

interface UseVoiceSearchProps {
  onSearchQuery: (query: string) => void;
  onLayoutChange?: (mode: Layout3DMode) => void;
  onSortChange?: (mode: SpatialSortMode) => void;
  onResetCamera?: () => void;
  onToggleThemes?: () => void;
  onToggleVR?: () => void;
}

export function useVoiceSearch({
  onSearchQuery,
  onLayoutChange,
  onSortChange,
  onResetCamera,
  onToggleThemes,
  onToggleVR,
}: UseVoiceSearchProps) {
  const [status, setStatus] = useState<VoiceStatus>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [interimText, setInterimText] = useState<string>('');
  const [feedbackBadge, setFeedbackBadge] = useState<string | null>(null);
  const feedbackTimeoutRef = useRef<any>(null);

  const isSupported = VoiceSearchEngine.isSupported();

  const showFeedback = useCallback((msg: string, durationMs = 3000) => {
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }
    setFeedbackBadge(msg);
    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedbackBadge(null);
    }, durationMs);
  }, []);

  const handleCommand = useCallback(
    (command: VoiceCommandMatch) => {
      switch (command.type) {
        case 'CLEAR_SEARCH':
          onSearchQuery('');
          showFeedback('Voice: Cleared Search');
          break;

        case 'RESET_CAMERA':
          onResetCamera?.();
          showFeedback('Voice: Reset Camera Orbit');
          break;

        case 'LAYOUT_CHANGE':
          if (command.payload && onLayoutChange) {
            onLayoutChange(command.payload as Layout3DMode);
            showFeedback(`Voice: Layout → ${command.payload}`);
          }
          break;

        case 'SORT_CHANGE':
          if (command.payload && onSortChange) {
            onSortChange(command.payload as SpatialSortMode);
            showFeedback(`Voice: Sort → ${command.payload}`);
          }
          break;

        case 'TOGGLE_THEMES':
          onToggleThemes?.();
          showFeedback('Voice: Toggled 3D Themes');
          break;

        case 'TOGGLE_VR':
          onToggleVR?.();
          showFeedback('Voice: Toggled VR Immersion');
          break;

        case 'SEARCH':
        default:
          if (typeof command.payload === 'string') {
            onSearchQuery(command.payload);
            showFeedback(`Voice Search: "${command.payload}"`);
          }
          break;
      }
    },
    [onSearchQuery, onLayoutChange, onSortChange, onResetCamera, onToggleThemes, onToggleVR, showFeedback]
  );

  const startListening = useCallback(() => {
    setErrorMessage(null);
    setInterimText('');

    const started = VoiceSearchEngine.startListening({
      onStatusChange: (newStatus, err) => {
        setStatus(newStatus);
        if (err) {
          setErrorMessage(err);
          showFeedback(err, 4000);
        }
      },
      onInterimTranscript: (text) => {
        setInterimText(text);
      },
      onFinalTranscript: (text) => {
        setInterimText(text);
      },
      onCommandMatch: (cmd) => {
        handleCommand(cmd);
      },
    });

    if (!started && !isSupported) {
      setErrorMessage('Speech recognition is not supported in this browser.');
      showFeedback('Voice API unsupported in this browser.', 4000);
    }
  }, [handleCommand, isSupported, showFeedback]);

  const stopListening = useCallback(() => {
    VoiceSearchEngine.stopListening();
    setStatus('IDLE');
  }, []);

  const toggleListening = useCallback(() => {
    if (status === 'LISTENING') {
      stopListening();
    } else {
      startListening();
    }
  }, [status, startListening, stopListening]);

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
      VoiceSearchEngine.stopListening();
    };
  }, []);

  return {
    isSupported,
    isListening: status === 'LISTENING',
    status,
    errorMessage,
    interimText,
    feedbackBadge,
    startListening,
    stopListening,
    toggleListening,
  };
}
