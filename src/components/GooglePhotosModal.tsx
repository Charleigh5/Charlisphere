/**
 * GooglePhotosModal.tsx
 * Google Photos GIS OAuth Ingestion, live album streamer, and curated cloud album previews.
 */

import React, { useState, useEffect } from 'react';
import {
  Camera,
  X,
  Sparkles,
  Cloud,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Key,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  FolderDown,
  Layers,
  ExternalLink,
  Copy,
  Check,
  HelpCircle,
  BookOpen,
  RefreshCw,
  Clock,
  Lock,
  Info,
  LogIn,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { GooglePhotosConnector, TokenDiagnostic, TokenErrorType } from '../connectors/GooglePhotosConnector';
import { PhotoMemoryItem } from '../types';
import { generateSampleAlbum } from '../data/sampleMemories';
import { auth, signInWithGooglePhotos, signOutUser, onAuthStateChanged, User } from '../services/firebase';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onIngestPhotos: (items: PhotoMemoryItem[], albumName: string) => void;
}

export const GooglePhotosModal: React.FC<Props> = ({ isOpen, onClose, onIngestPhotos }) => {
  const [activeTab, setActiveTab] = useState<'firebase' | 'oneclick' | 'playground' | 'oauth' | 'curated'>('firebase');
  const [tokenInput, setTokenInput] = useState(() => localStorage.getItem('gp_oauth_access_token') || localStorage.getItem('photosphere_oauth_token') || GooglePhotosConnector.getActiveToken());
  const [clientIdInput, setClientIdInput] = useState(() => GooglePhotosConnector.getActiveClientId());
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [diagnostic, setDiagnostic] = useState<TokenDiagnostic | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [discoveredAlbums, setDiscoveredAlbums] = useState<{ id: string; title: string; mediaItemsCount?: string; coverPhotoBaseUrl?: string }[]>([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>('all');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<{
    checked: boolean;
    valid: boolean;
    message: string;
    itemCount?: number;
    errorType?: TokenErrorType;
    expiresIn?: number;
    userEmail?: string;
  }>({
    checked: false,
    valid: false,
    message: '',
  });

  // Track Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        const storedToken = localStorage.getItem('gp_oauth_access_token');
        if (storedToken) {
          checkTokenConnection(storedToken);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Auto-verify connection if token exists in storage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('gp_oauth_access_token') || localStorage.getItem('photosphere_oauth_token') || GooglePhotosConnector.getActiveToken();
    if (savedToken && savedToken !== GooglePhotosConnector.DEFAULT_TOKEN) {
      checkTokenConnection(savedToken, true);
    }
  }, []);

  const handleFirebaseAuthSignIn = async () => {
    setIsLoading(true);
    setLoadingStatus('Connecting to Google with Firebase Auth...');
    setErrorMessage('');
    setDiagnostic(null);

    try {
      const { user, accessToken } = await signInWithGooglePhotos();
      setCurrentUser(user);

      if (accessToken) {
        setTokenInput(accessToken);
        setLoadingStatus('Checking Photos permission & fetching library...');
        
        try {
          const rawItems = await GooglePhotosConnector.loadAlbumMedia(accessToken, undefined, 200);
          const albums = await GooglePhotosConnector.listAlbums(accessToken);
          setDiscoveredAlbums(albums);

          if (rawItems.length === 0) {
            setErrorMessage('No media items found in this Google Photos library.');
            setIsLoading(false);
            return;
          }

          const memoryItems = GooglePhotosConnector.convertToPhotoMemoryItems(rawItems);
          GooglePhotosConnector.logAudit({
            category: 'DATA_TRANSFORMATION',
            status: 'SUCCESS',
            summary: `Dispatching ${memoryItems.length} photos from Firebase Google Auth to 3D Sphere Matrix`,
            itemCount: memoryItems.length,
            metadata: {
              source: 'Firebase Auth',
              albumTitle: `Google Photos (${memoryItems.length} photos)`,
            },
          });
          onIngestPhotos(memoryItems, `Google Photos (${memoryItems.length} photos)`);
          onClose();
        } catch (fetchErr: any) {
          console.warn('Photos retrieval error after sign-in:', fetchErr);
          const errMsg = fetchErr?.message || '';
          if (
            errMsg.includes('Missing required scope') ||
            errMsg.includes('photoslibrary.readonly') ||
            errMsg.includes('PERMISSION_DENIED') ||
            errMsg.includes('insufficient') ||
            errMsg.includes('scope')
          ) {
            setDiagnostic({
              isValid: false,
              errorType: 'MISSING_SCOPES',
              title: 'Google Photos Permission Checkbox Required',
              message: 'Google signed you in, but the Photos permission checkbox was left unchecked on Google\'s consent prompt. To view your photos in the 3D Sphere, Google requires you to explicitly check the "See and download your Google Photos library" box.',
              detailedReason: 'Google Identity uses Granular Permissions. When signing in, check the Google Photos box before clicking Continue.',
              scopeIssue: {
                requiredScope: GooglePhotosConnector.SCOPE_READONLY,
                grantedScopes: ['email', 'profile', 'openid'],
                missingScopes: [GooglePhotosConnector.SCOPE_READONLY],
              },
              actionGuide: {
                headline: 'How to grant permission:',
                steps: [
                  'Click "Sign In with Google" again below.',
                  'When Google asks for permissions, check the box: "See and download your Google Photos library".',
                  'Click "Continue". Your photos will load immediately into the 3D Sphere.',
                  'Alternative: Use the "OAuth Playground" tab to paste an access token directly.',
                ],
                copyableScope: GooglePhotosConnector.SCOPE_READONLY,
                externalLink: {
                  url: 'https://developers.google.com/oauthplayground/',
                  label: 'Open OAuth Playground (Instant Token)',
                },
              },
            });
            setErrorMessage('Google Photos permission was not granted during sign-in. Please click "Sign In" again and check the Photos permission box.');
          } else {
            setErrorMessage(errMsg || 'Failed to fetch photos from Google Photos Library.');
          }
        }
      } else {
        // In case Firebase returned user but token is stored separately
        const token = localStorage.getItem('gp_oauth_access_token');
        if (token) {
          const rawItems = await GooglePhotosConnector.loadAlbumMedia(token, undefined, 200);
          const memoryItems = GooglePhotosConnector.convertToPhotoMemoryItems(rawItems);
          onIngestPhotos(memoryItems, `Google Photos (${memoryItems.length} photos)`);
          onClose();
        } else {
          setErrorMessage('Google Authentication succeeded, but Google Photos access token was not returned. Please try the OAuth Playground tab for immediate access.');
        }
      }
    } catch (err: any) {
      console.error('Firebase Sign-In Error:', err);
      let msg = err?.message || 'Authentication failed.';
      if (err?.code === 'auth/popup-blocked') {
        msg = 'Browser popup blocked. Please allow popups or open this app in a new dedicated browser tab.';
      } else if (err?.code === 'auth/cancelled-popup-request' || err?.code === 'auth/popup-closed-by-user') {
        msg = 'Sign-in window was closed before authorization was completed.';
      }
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
      setLoadingStatus('');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutUser();
      setCurrentUser(null);
      setConnectionStatus({
        checked: true,
        valid: false,
        message: 'Signed out of Google account.',
      });
    } catch (e: any) {
      setErrorMessage(e.message || 'Failed to sign out');
    }
  };

  const checkTokenConnection = async (tokenToCheck: string, isInitialCheck = false) => {
    const cleanToken = tokenToCheck.trim().replace(/^Bearer\s+/i, '');
    if (!cleanToken) {
      setDiagnostic(null);
      setConnectionStatus({
        checked: true,
        valid: false,
        message: 'No OAuth token entered. Please paste a token starting with "ya29...".',
        errorType: 'INVALID_TOKEN',
      });
      return;
    }

    setIsLoading(true);
    setLoadingStatus('Inspecting token permissions & Photos API access...');
    setErrorMessage('');

    try {
      const diag = await GooglePhotosConnector.inspectToken(cleanToken);
      setDiagnostic(diag);

      if (!diag.isValid) {
        setConnectionStatus({
          checked: true,
          valid: false,
          message: diag.message,
          errorType: diag.errorType,
        });
        setIsLoading(false);
        setLoadingStatus('');
        return;
      }

      // If token diagnostic passed, test actual album list and media items
      setLoadingStatus('Testing Google Photos library media retrieval...');
      const items = await GooglePhotosConnector.loadAlbumMedia(cleanToken, undefined, 20);
      const albums = await GooglePhotosConnector.listAlbums(cleanToken);
      setDiscoveredAlbums(albums);

      setConnectionStatus({
        checked: true,
        valid: true,
        message: `Connected! Found ${items.length >= 20 ? '20+' : items.length} photos and ${albums.length} albums in your Google Photos library.`,
        itemCount: items.length,
        expiresIn: diag.expiresInSeconds,
        userEmail: diag.tokenEmail,
      });
      setErrorMessage('');
    } catch (e: any) {
      const diag = await GooglePhotosConnector.inspectToken(cleanToken);
      setDiagnostic(diag);
      setConnectionStatus({
        checked: true,
        valid: false,
        message: diag.message || e.message || 'Token verification failed.',
        errorType: diag.errorType || 'UNKNOWN',
      });
    } finally {
      setIsLoading(false);
      setLoadingStatus('');
    }
  };

  if (!isOpen) return null;

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://ais-dev-gfbecdky4ijdg6u5vwqe2x-46558936289.us-east1.run.app';
  const photosScope = GooglePhotosConnector.SCOPE_READONLY;

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleGisConnect = (targetClientId?: string) => {
    setErrorMessage('');
    setDiagnostic(null);
    const clientId = (targetClientId || clientIdInput || GooglePhotosConnector.getActiveClientId()).trim();
    if (!clientId) {
      setErrorMessage('Please enter your Google Cloud OAuth Client ID.');
      return;
    }

    localStorage.setItem('photosphere_client_id', clientId);
    setIsLoading(true);
    setLoadingStatus('Opening Google Sign-In consent popup...');

    GooglePhotosConnector.requestGisToken(
      clientId,
      async (token) => {
        try {
          localStorage.setItem('photosphere_oauth_token', token);
          setTokenInput(token);
          setLoadingStatus('Authorized! Fetching Google Photos library & albums...');

          const albums = await GooglePhotosConnector.listAlbums(token);
          setDiscoveredAlbums(albums);

          const rawItems = await GooglePhotosConnector.loadAlbumMedia(token, undefined, 200);
          if (rawItems.length === 0) {
            setErrorMessage('No media items found in your Google Photos library.');
            setIsLoading(false);
            return;
          }
          const memoryItems = GooglePhotosConnector.convertToPhotoMemoryItems(rawItems);
          GooglePhotosConnector.logAudit({
            category: 'DATA_TRANSFORMATION',
            status: 'SUCCESS',
            summary: `Dispatching ${memoryItems.length} photos from GIS popup to 3D Sphere Matrix`,
            itemCount: memoryItems.length,
            metadata: {
              source: 'Google Identity Services (GIS)',
              albumTitle: `Google Photos (${memoryItems.length} photos)`,
            },
          });
          onIngestPhotos(memoryItems, `Google Photos (${memoryItems.length} photos)`);
          onClose();
        } catch (e: any) {
          const diag = await GooglePhotosConnector.inspectToken(token);
          setDiagnostic(diag);
          setErrorMessage(diag.message || e.message || 'Failed to stream Google Photos media.');
        } finally {
          setIsLoading(false);
          setLoadingStatus('');
        }
      },
      (err) => {
        setErrorMessage(err.message || 'Google Sign-In was cancelled or encountered an error.');
        setIsLoading(false);
        setLoadingStatus('');
      },
      { prompt: 'consent' }
    );
  };

  const handleDirectTokenIngest = async () => {
    const cleanToken = tokenInput.trim().replace(/^Bearer\s+/i, '');
    if (!cleanToken) {
      const diag: TokenDiagnostic = {
        isValid: false,
        errorType: 'INVALID_TOKEN',
        title: 'Missing Token',
        message: 'Please paste a Google OAuth Access Token (starts with "ya29...").',
      };
      setDiagnostic(diag);
      setErrorMessage(diag.message);
      return;
    }

    setIsLoading(true);
    setLoadingStatus('Verifying token and fetching Google Photos media...');
    setErrorMessage('');

    try {
      // First run deep inspection
      const diag = await GooglePhotosConnector.inspectToken(cleanToken);
      setDiagnostic(diag);

      if (!diag.isValid) {
        setErrorMessage(diag.message);
        setConnectionStatus({
          checked: true,
          valid: false,
          message: diag.message,
          errorType: diag.errorType,
        });
        setIsLoading(false);
        setLoadingStatus('');
        return;
      }

      localStorage.setItem('photosphere_oauth_token', cleanToken);
      const albumTarget = selectedAlbumId === 'all' ? undefined : selectedAlbumId;
      const rawItems = await GooglePhotosConnector.loadAlbumMedia(cleanToken, albumTarget, 200);

      if (rawItems.length === 0) {
        setErrorMessage('No media items returned from this Google Photos token.');
        setIsLoading(false);
        setLoadingStatus('');
        return;
      }

      const memoryItems = GooglePhotosConnector.convertToPhotoMemoryItems(rawItems);
      GooglePhotosConnector.logAudit({
        category: 'DATA_TRANSFORMATION',
        status: 'SUCCESS',
        summary: `Dispatching ${memoryItems.length} photos from Direct OAuth Token to 3D Sphere Matrix`,
        itemCount: memoryItems.length,
        metadata: {
          source: 'Direct OAuth Token (Playground/Manual)',
          albumTarget: albumTarget || 'ALL_PHOTOS',
          albumTitle: `Google Photos Library (${memoryItems.length} photos)`,
        },
      });
      onIngestPhotos(memoryItems, `Google Photos Library (${memoryItems.length} photos)`);
      onClose();
    } catch (e: any) {
      const diag = await GooglePhotosConnector.inspectToken(cleanToken);
      setDiagnostic(diag);
      setErrorMessage(diag.message || e.message || 'Failed to fetch items from Google Photos API.');
    } finally {
      setIsLoading(false);
      setLoadingStatus('');
    }
  };

  const handleDemoAlbumLoad = (name: string, count: number) => {
    setIsLoading(true);
    setLoadingStatus(`Synthesizing high-density 3D matrix (${count} items)...`);
    setTimeout(() => {
      const demoItems = generateSampleAlbum(count);
      onIngestPhotos(demoItems, name);
      setIsLoading(false);
      setLoadingStatus('');
      onClose();
    }, 250);
  };

  // Helper detection for inline input warnings
  const isAuthCodePasted = tokenInput.trim().startsWith('4/') || tokenInput.trim().startsWith('4%2F');
  const isApiKeyPasted = tokenInput.trim().startsWith('AIza');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-[#050507]/95 border border-white/15 rounded-3xl p-5 md:p-7 shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden max-h-[92vh] flex flex-col backdrop-blur-2xl text-white/90">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 md:p-3 rounded-2xl bg-gradient-to-br from-amber-400/20 to-sky-400/20 text-amber-400 border border-amber-400/30">
              <Camera className="w-5 h-5 md:w-6 md:h-6" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-bold tracking-tight text-white/95 flex items-center gap-2">
                Google Photos Live Integration
              </h2>
              <p className="text-[11px] md:text-xs text-white/50">
                Stream live library into the 3D Fibonacci Coordinate Matrix
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white transition-colors"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-white/5 border border-white/10 rounded-2xl my-4 shrink-0 overflow-x-auto">
          <button
            onClick={() => { setActiveTab('firebase'); setErrorMessage(''); }}
            className={`flex-1 min-w-[140px] py-2 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'firebase'
                ? 'bg-gradient-to-r from-emerald-400 to-sky-500 text-black shadow-md font-bold'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Firebase Google Auth</span>
          </button>

          <button
            onClick={() => { setActiveTab('oneclick'); setErrorMessage(''); }}
            className={`flex-1 min-w-[120px] py-2 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'oneclick'
                ? 'bg-gradient-to-r from-sky-400 to-indigo-500 text-black shadow-md font-bold'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>1-Click GIS</span>
          </button>

          <button
            onClick={() => { setActiveTab('playground'); setErrorMessage(''); }}
            className={`flex-1 min-w-[130px] py-2 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'playground'
                ? 'bg-[#fbbf24] text-black shadow-md font-bold'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>OAuth Playground</span>
          </button>

          <button
            onClick={() => { setActiveTab('oauth'); setErrorMessage(''); }}
            className={`flex-1 min-w-[110px] py-2 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'oauth'
                ? 'bg-[#4ade80] text-black shadow-md font-bold'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Credentials</span>
          </button>

          <button
            onClick={() => { setActiveTab('curated'); setErrorMessage(''); }}
            className={`flex-1 min-w-[100px] py-2 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'curated'
                ? 'bg-[#38bdf8] text-black shadow-md font-bold'
                : 'text-white/70 hover:text-white hover:bg-white/5'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Demo</span>
          </button>
        </div>

        {/* Diagnostic Status Card (Specific, user-friendly feedback) */}
        {diagnostic && !diagnostic.isValid && (
          <div
            className={`mb-4 p-4 rounded-2xl border shrink-0 space-y-3 transition-all ${
              diagnostic.errorType === 'EXPIRED'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                : diagnostic.errorType === 'MISSING_SCOPES'
                ? 'bg-purple-500/10 border-purple-500/30 text-purple-200'
                : diagnostic.errorType === 'AUTH_CODE_MISTAKE' || diagnostic.errorType === 'API_KEY_MISTAKE'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                : diagnostic.errorType === 'API_NOT_ENABLED'
                ? 'bg-sky-500/10 border-sky-500/30 text-sky-200'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
            }`}
          >
            {/* Header / Error Badge */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                {diagnostic.errorType === 'EXPIRED' ? (
                  <Clock className="w-5 h-5 text-amber-400 shrink-0" />
                ) : diagnostic.errorType === 'MISSING_SCOPES' ? (
                  <ShieldAlert className="w-5 h-5 text-purple-400 shrink-0" />
                ) : diagnostic.errorType === 'AUTH_CODE_MISTAKE' || diagnostic.errorType === 'API_KEY_MISTAKE' ? (
                  <Key className="w-5 h-5 text-amber-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/40 border border-white/10">
                      {diagnostic.errorType === 'EXPIRED' && 'Token Expired'}
                      {diagnostic.errorType === 'MISSING_SCOPES' && 'Missing Permissions'}
                      {diagnostic.errorType === 'AUTH_CODE_MISTAKE' && 'Authorization Code Detected'}
                      {diagnostic.errorType === 'API_KEY_MISTAKE' && 'API Key Detected'}
                      {diagnostic.errorType === 'INVALID_TOKEN' && 'Invalid Token'}
                      {diagnostic.errorType === 'API_NOT_ENABLED' && 'API Disabled'}
                      {diagnostic.errorType === 'NETWORK_ERROR' && 'Network Issue'}
                      {(!diagnostic.errorType || diagnostic.errorType === 'UNKNOWN') && 'Connection Failed'}
                    </span>
                    <h4 className="text-xs font-bold text-white/95">{diagnostic.title}</h4>
                  </div>
                </div>
              </div>
            </div>

            {/* Plain-English Explanation */}
            <p className="text-xs text-white/80 leading-relaxed pl-7">
              {diagnostic.message}
            </p>

            {/* Scope Details (If Missing Scopes) */}
            {diagnostic.scopeIssue && (
              <div className="ml-7 p-3 rounded-xl bg-black/40 border border-white/10 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-white/60 font-mono text-[11px]">Required Scope:</span>
                  <div className="flex items-center gap-1.5">
                    <code className="text-[#38bdf8] font-mono text-[11px] bg-white/5 px-2 py-0.5 rounded">
                      {diagnostic.scopeIssue.requiredScope}
                    </code>
                    <button
                      onClick={() => copyToClipboard(diagnostic.scopeIssue!.requiredScope, 'diag_scope')}
                      className="p-1 hover:bg-white/10 rounded text-white/70 hover:text-white transition-colors"
                      title="Copy required scope"
                    >
                      {copiedField === 'diag_scope' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                {diagnostic.scopeIssue.grantedScopes.length > 0 && (
                  <div className="text-[11px] text-white/50 pt-1 border-t border-white/10">
                    <span className="font-semibold text-white/70">Scopes Currently on Token: </span>
                    <span className="font-mono">{diagnostic.scopeIssue.grantedScopes.join(', ')}</span>
                  </div>
                )}
              </div>
            )}

            {/* Action Guide / Resolution Steps */}
            {diagnostic.actionGuide && (
              <div className="ml-7 pt-2 border-t border-white/10 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-white/70 font-mono flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#fbbf24]" />
                  <span>{diagnostic.actionGuide.headline}</span>
                </div>
                <ul className="space-y-1 text-xs text-white/75 list-decimal list-inside">
                  {diagnostic.actionGuide.steps.map((step, idx) => (
                    <li key={idx} className="leading-snug">
                      <span className="text-white/90">{step}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {diagnostic.actionGuide.externalLink && (
                    <a
                      href={diagnostic.actionGuide.externalLink.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/15 rounded-xl text-xs font-semibold text-white transition-all shadow-sm"
                    >
                      <span>{diagnostic.actionGuide.externalLink.label}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}

                  {diagnostic.actionGuide.copyableScope && (
                    <button
                      onClick={() => copyToClipboard(diagnostic.actionGuide!.copyableScope!, 'action_scope')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#38bdf8]/15 hover:bg-[#38bdf8]/25 border border-[#38bdf8]/30 rounded-xl text-xs font-semibold text-[#38bdf8] transition-all"
                    >
                      {copiedField === 'action_scope' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedField === 'action_scope' ? 'Copied Scope!' : 'Copy Required Scope'}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Successful Connection Diagnostic Banner */}
        {diagnostic?.isValid && (
          <div className="mb-4 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between gap-3 text-xs text-emerald-300 shrink-0">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <div className="font-bold uppercase font-mono tracking-wider text-[11px] text-emerald-300">
                  Google Photos: Connected & Verified
                </div>
                <div className="text-[11px] text-emerald-200/80">
                  {connectionStatus.message || diagnostic.message}
                  {diagnostic.expiresInSeconds ? ` (Expires in ~${Math.round(diagnostic.expiresInSeconds / 60)}m)` : ''}
                </div>
              </div>
            </div>
            <button
              onClick={handleDirectTokenIngest}
              disabled={isLoading}
              className="px-3.5 py-1.5 bg-emerald-400 hover:bg-emerald-300 text-black font-bold text-xs rounded-xl transition-all shadow-sm shrink-0 flex items-center gap-1"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Stream into 3D</span>
            </button>
          </div>
        )}

        {/* Loading Indicator & Status */}
        {isLoading && (
          <div className="mb-4 p-3.5 bg-sky-500/10 border border-sky-500/30 rounded-2xl flex items-center gap-3 text-xs text-sky-400 shrink-0 animate-pulse">
            <div className="w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="font-mono">{loadingStatus || 'Streaming Google Photos data...'}</span>
          </div>
        )}

        {/* Fallback general error banner if diagnostic wasn't triggered */}
        {errorMessage && !diagnostic && (
          <div className="mb-4 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-2.5 text-xs text-rose-300 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Tab Content Body (Scrollable) */}
        <div className="overflow-y-auto pr-1 space-y-4 flex-1">
          {/* TAB 0: FIREBASE GOOGLE AUTHENTICATION */}
          {activeTab === 'firebase' && (
            <div className="space-y-4">
              <div className="p-5 bg-gradient-to-b from-emerald-500/10 via-sky-500/5 to-transparent border border-emerald-500/20 rounded-2xl text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-white/10 border border-emerald-400/30 flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(52,211,153,0.3)]">
                  {currentUser?.photoURL ? (
                    <img
                      src={currentUser.photoURL}
                      alt={currentUser.displayName || 'Google User'}
                      className="w-full h-full rounded-2xl object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <svg className="w-7 h-7" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.97 0 12s.45 3.84 1.25 5.42l4.03-3.15z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                      />
                    </svg>
                  )}
                </div>

                <div>
                  {currentUser ? (
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                        Authenticated
                      </span>
                      <h3 className="text-sm font-bold text-white tracking-wide mt-1.5">
                        {currentUser.displayName || currentUser.email}
                      </h3>
                      <p className="text-xs text-white/60 font-mono mt-0.5">{currentUser.email}</p>
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-sm font-bold text-white tracking-wide">
                        Google Sign-In with Firebase
                      </h3>
                      <p className="text-xs text-white/60 max-w-md mx-auto mt-1 leading-relaxed">
                        Sign in with your Google account to grant Google Photos permissions and automatically persist your photo matrix to Firebase Firestore.
                      </p>
                      <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/25 rounded-xl text-[11px] text-amber-300">
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>Please tick the <strong>"See and download your Google Photos library"</strong> checkbox on Google's sign-in screen.</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                  {!currentUser ? (
                    <button
                      id="btn-firebase-google-auth"
                      onClick={handleFirebaseAuthSignIn}
                      disabled={isLoading}
                      className="w-full sm:w-auto min-w-[260px] px-6 py-3 bg-gradient-to-r from-emerald-400 to-sky-400 text-black font-bold text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-2.5 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path
                          fill="#000"
                          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                        />
                        <path
                          fill="#000"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                        />
                        <path
                          fill="#000"
                          d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.97 0 12s.45 3.84 1.25 5.42l4.03-3.15z"
                        />
                        <path
                          fill="#000"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                        />
                      </svg>
                      <span>Sign In & Load Photos</span>
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        onClick={handleFirebaseAuthSignIn}
                        disabled={isLoading}
                        className="px-5 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-black font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                        <span>Re-Authorize & Sync Photos</span>
                      </button>
                      <button
                        onClick={() => { setActiveTab('token'); setErrorMessage(''); }}
                        className="px-4 py-2.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-semibold text-xs rounded-xl border border-sky-500/30 transition-colors flex items-center gap-1.5"
                      >
                        <Key className="w-3.5 h-3.5" />
                        <span>Paste OAuth Token</span>
                      </button>
                      <button
                        onClick={handleSignOut}
                        className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white font-semibold text-xs rounded-xl border border-white/10 transition-colors flex items-center gap-1.5"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Firebase Cloud Details */}
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-2 text-xs">
                <div className="flex items-center justify-between text-white/60">
                  <span className="font-mono text-[11px]">Firebase Project:</span>
                  <span className="text-emerald-400 font-mono text-[11px]">neural-canvas-482621</span>
                </div>
                <div className="flex items-center justify-between text-white/60 border-t border-white/5 pt-2">
                  <span className="font-mono text-[11px]">Requested Scope:</span>
                  <span className="text-sky-300 font-mono text-[11px]">photoslibrary.readonly</span>
                </div>
                <div className="flex items-center justify-between text-white/60 border-t border-white/5 pt-2">
                  <span className="font-mono text-[11px]">Firestore Persistence:</span>
                  <span className="text-emerald-300 font-mono text-[11px]">Active (Encrypted Rules)</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: 1-CLICK GOOGLE SIGN IN */}
          {activeTab === 'oneclick' && (
            <div className="space-y-4">
              <div className="p-5 bg-gradient-to-b from-sky-500/10 to-transparent border border-sky-500/20 rounded-2xl text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center mx-auto shadow-[0_0_25px_rgba(56,189,248,0.3)]">
                  <svg className="w-6 h-6" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.97 0 12s.45 3.84 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide">
                    Connect Your Google Photos Account
                  </h3>
                  <p className="text-xs text-white/60 max-w-md mx-auto mt-1 leading-relaxed">
                    Authenticate via Google Identity Services to securely stream your photos directly into the 3D WebGL sphere. Background sync will periodically refresh new photos every 5 minutes.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => handleGisConnect()}
                    disabled={isLoading}
                    className="w-full sm:w-auto min-w-[240px] px-6 py-3 bg-white text-neutral-900 hover:bg-neutral-100 font-bold text-xs uppercase tracking-wider rounded-2xl shadow-xl shadow-white/10 transition-all flex items-center justify-center gap-2.5 mx-auto hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.16 0 9.97 0 12s.45 3.84 1.25 5.42l4.03-3.15z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                      />
                    </svg>
                    <span>Sign in with Google Photos</span>
                  </button>
                </div>
              </div>

              {/* Status information */}
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-2 text-xs">
                <div className="flex items-center justify-between text-white/60">
                  <span className="font-mono text-[11px]">Authorized Client ID:</span>
                  <code className="text-sky-300 font-mono text-[11px] truncate max-w-[280px]">
                    {clientIdInput || GooglePhotosConnector.DEFAULT_CLIENT_ID}
                  </code>
                </div>
                <div className="flex items-center justify-between text-white/60 border-t border-white/5 pt-2">
                  <span className="font-mono text-[11px]">GCP Project:</span>
                  <span className="text-white/80 font-mono text-[11px]">neural-canvas-482621</span>
                </div>
                <div className="flex items-center justify-between text-white/60 border-t border-white/5 pt-2">
                  <span className="font-mono text-[11px]">Required Scope:</span>
                  <span className="text-emerald-400 font-mono text-[11px]">photoslibrary.readonly</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: OAUTH PLAYGROUND (DIRECT TOKEN INGEST) */}
          {activeTab === 'playground' && (
            <div className="space-y-4">
              <div className="p-4 bg-[#fbbf24]/10 border border-[#fbbf24]/30 rounded-2xl">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Key className="w-4 h-4 text-[#fbbf24]" />
                    <span className="text-xs font-bold text-white/95 uppercase font-mono">
                      Fast Token Paste (OAuth Playground)
                    </span>
                  </div>
                  <a
                    href="https://developers.google.com/oauthplayground/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-3 py-1 bg-[#fbbf24] text-black text-xs font-bold rounded-lg hover:bg-[#fbbf24]/90 transition-all shadow-sm"
                  >
                    <span>Open OAuth Playground</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="text-xs text-white/70 leading-relaxed">
                  Generate a direct temporary token for your Google account in under 60 seconds with required <code className="text-[#38bdf8]">photoslibrary.readonly</code> permissions:
                </p>
              </div>

              {/* 3 Simple Steps */}
              <div className="space-y-2.5 text-xs">
                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-2">
                  <div className="font-semibold text-white/90 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#fbbf24]/20 text-[#fbbf24] font-mono flex items-center justify-center text-[10px] font-bold">1</span>
                    <span>Paste Photos Scope in Step 1 (Input your own scopes)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-black/50 border border-white/10 rounded-lg text-[11px] font-mono text-[#38bdf8] truncate">
                      {photosScope}
                    </code>
                    <button
                      onClick={() => copyToClipboard(photosScope, 'scope')}
                      className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg text-xs flex items-center gap-1.5 transition-all text-white/80 shrink-0"
                    >
                      {copiedField === 'scope' ? <Check className="w-3.5 h-3.5 text-[#4ade80]" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === 'scope' ? 'Copied!' : 'Copy Scope'}</span>
                    </button>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
                  <div className="font-semibold text-white/90 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#fbbf24]/20 text-[#fbbf24] font-mono flex items-center justify-center text-[10px] font-bold">2</span>
                    <span>Click "Authorize APIs" & grant read-only photo access</span>
                  </div>
                  <p className="text-white/50 text-[11px] pl-7">
                    Sign in with your Google account. In Step 2, click <strong className="text-white/80">"Exchange authorization code for tokens"</strong>.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-2">
                  <div className="font-semibold text-white/90 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#fbbf24]/20 text-[#fbbf24] font-mono flex items-center justify-center text-[10px] font-bold">3</span>
                    <span>Paste the generated Access Token (starts with ya29...) below:</span>
                  </div>

                  {/* Real-time Inline Format Warnings */}
                  {isAuthCodePasted && (
                    <div className="ml-7 p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-[11px] flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>
                        <strong>Authorization Code detected:</strong> In Step 2 of OAuth Playground, click the blue button <em>"Exchange authorization code for tokens"</em> and copy the resulting <code>access_token</code> (starts with <code>ya29.</code>).
                      </span>
                    </div>
                  )}

                  {isApiKeyPasted && (
                    <div className="ml-7 p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-[11px] flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>
                        <strong>API Key detected:</strong> Photos Library requires a user OAuth Access Token (starts with <code>ya29.</code>) rather than a Google Cloud API Key.
                      </span>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2 pl-7">
                    <input
                      type="text"
                      value={tokenInput}
                      onChange={(e) => {
                        setTokenInput(e.target.value);
                        setDiagnostic(null);
                        setConnectionStatus({ checked: false, valid: false, message: '' });
                      }}
                      placeholder="ya29.a0AfH6SM..."
                      className="flex-1 px-3.5 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#fbbf24]/50 font-mono"
                    />
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => checkTokenConnection(tokenInput)}
                        disabled={isLoading || !tokenInput.trim()}
                        className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs transition-colors border border-white/10 flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                        <span>Test Link</span>
                      </button>
                      <button
                        onClick={handleDirectTokenIngest}
                        disabled={isLoading || !tokenInput.trim()}
                        className="px-4 py-2 rounded-xl bg-[#fbbf24] hover:bg-[#fbbf24]/90 text-black font-bold text-xs transition-colors shadow-lg shadow-[#fbbf24]/20 flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Fetch Media</span>
                      </button>
                    </div>
                  </div>

                  {/* Discovered Albums Picker if available */}
                  {discoveredAlbums.length > 0 && (
                    <div className="pl-7 pt-2">
                      <label className="text-[11px] text-white/60 block mb-1">Select Specific Album (Optional):</label>
                      <select
                        value={selectedAlbumId}
                        onChange={(e) => setSelectedAlbumId(e.target.value)}
                        className="w-full px-3 py-1.5 bg-black/50 border border-white/15 rounded-xl text-xs text-white/90 focus:outline-none focus:ring-1 focus:ring-[#fbbf24]"
                      >
                        <option value="all">Entire Google Photos Library (All Media)</option>
                        {discoveredAlbums.map((album) => (
                          <option key={album.id} value={album.id}>
                            {album.title} ({album.mediaItemsCount || '0'} items)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: GOOGLE CLOUD OAUTH CLIENT CONFIG */}
          {activeTab === 'oauth' && (
            <div className="space-y-4">
              <div className="p-4 bg-[#4ade80]/10 border border-[#4ade80]/30 rounded-2xl">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#4ade80]" />
                    <span className="text-xs font-bold text-white/95 uppercase font-mono">
                      Google Cloud OAuth Client Settings
                    </span>
                  </div>
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-3 py-1 bg-[#4ade80] text-black text-xs font-bold rounded-lg hover:bg-[#4ade80]/90 transition-all shadow-sm"
                  >
                    <span>Google Cloud Console</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="text-xs text-white/70 leading-relaxed">
                  Configured credentials for project <strong className="text-white">neural-canvas-482621</strong>.
                </p>
              </div>

              {/* Step by step */}
              <div className="space-y-2.5 text-xs">
                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
                  <div className="font-semibold text-white/90 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#4ade80]/20 text-[#4ade80] font-mono flex items-center justify-center text-[10px] font-bold">1</span>
                      <span>Authorized JavaScript Origin</span>
                    </div>
                  </div>
                  <div className="pl-7 space-y-2">
                    <p className="text-white/50 text-[11px]">
                      Registered in your Google Cloud OAuth Client credentials:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 bg-black/50 border border-white/10 rounded-lg text-[11px] font-mono text-[#4ade80] truncate">
                        {currentOrigin}
                      </code>
                      <button
                        onClick={() => copyToClipboard(currentOrigin, 'origin')}
                        className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg text-xs flex items-center gap-1.5 transition-all text-white/80 shrink-0"
                      >
                        {copiedField === 'origin' ? <Check className="w-3.5 h-3.5 text-[#4ade80]" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedField === 'origin' ? 'Copied!' : 'Copy Origin'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-2">
                  <div className="font-semibold text-white/90 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#4ade80]/20 text-[#4ade80] font-mono flex items-center justify-center text-[10px] font-bold">2</span>
                    <span>Client ID:</span>
                  </div>
                  <div className="flex gap-2 pl-7">
                    <input
                      type="text"
                      value={clientIdInput}
                      onChange={(e) => setClientIdInput(e.target.value)}
                      placeholder="123456789-abc.apps.googleusercontent.com"
                      className="flex-1 px-3.5 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white/90 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#4ade80]/50 font-mono"
                    />
                    <button
                      onClick={() => handleGisConnect(clientIdInput)}
                      disabled={isLoading}
                      className="px-4 py-2 rounded-xl bg-[#4ade80] hover:bg-[#4ade80]/90 text-black font-bold text-xs transition-colors shadow-lg shadow-[#4ade80]/20 flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <span>Authorize</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CURATED INSTANT ALBUMS */}
          {activeTab === 'curated' && (
            <div className="space-y-3">
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-white/40 mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#fbbf24]" />
                <span>Zero-Config Curated High-Resolution Matrices</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    title: "Charleigh Rae's Memory Matrix",
                    desc: 'Milestones, first steps, beach, and family moments with full EXIF',
                    count: 120,
                  },
                  {
                    title: 'Annual Family Chronicle',
                    desc: 'Full 360-day chronological matrix with spherical distribution',
                    count: 360,
                  },
                  {
                    title: 'High-Density Decade Matrix',
                    desc: '1,000 deep memories with GPS, colors & face clusters',
                    count: 1000,
                  },
                  {
                    title: 'Recent Milestones',
                    desc: 'Compact lightweight album for high frame-rate exploration',
                    count: 30,
                  },
                ].map((album) => (
                  <button
                    key={album.title}
                    onClick={() => handleDemoAlbumLoad(album.title, album.count)}
                    disabled={isLoading}
                    className="group text-left p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-[#38bdf8]/50 hover:bg-white/10 transition-all shadow-md flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <h4 className="text-sm font-semibold text-white/90 group-hover:text-[#38bdf8] transition-colors">
                          {album.title}
                        </h4>
                        <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/20">
                          {album.count} photos
                        </span>
                      </div>
                      <p className="text-xs text-white/50">{album.desc}</p>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#38bdf8] group-hover:translate-x-1 transition-transform">
                      <span>Stream into 3D Matrix</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
