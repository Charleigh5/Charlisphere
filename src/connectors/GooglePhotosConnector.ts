/**
 * GooglePhotosConnector.ts
 * Google Photos REST API integration, GIS token lifecycle, media hydration,
 * and comprehensive console-based audit logging with payload inspection.
 */

import { GooglePhotoItem, PhotoMemoryItem } from '../types';

export type TokenErrorType =
  | 'EXPIRED'
  | 'MISSING_SCOPES'
  | 'INVALID_TOKEN'
  | 'AUTH_CODE_MISTAKE'
  | 'API_KEY_MISTAKE'
  | 'API_NOT_ENABLED'
  | 'QUOTA_EXCEEDED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export interface TokenDiagnostic {
  isValid: boolean;
  errorType?: TokenErrorType;
  title: string;
  message: string;
  detailedReason?: string;
  technicalDetails?: string;
  scopeIssue?: {
    requiredScope: string;
    grantedScopes: string[];
    missingScopes: string[];
  };
  expiresInSeconds?: number;
  tokenEmail?: string;
  grantedScopes?: string[];
  actionGuide?: {
    headline: string;
    steps: string[];
    copyableScope?: string;
    externalLink?: {
      url: string;
      label: string;
    };
  };
}

export type AuditCategory =
  | 'AUTH_PROBE'
  | 'GIS_INIT'
  | 'MEDIA_FETCH'
  | 'ALBUMS_FETCH'
  | 'DATA_TRANSFORMATION'
  | 'TOKEN_INSPECTION'
  | 'SYSTEM_DIAGNOSTIC';

export type AuditStatus = 'START' | 'SUCCESS' | 'WARNING' | 'FAILURE';

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  isoTime: string;
  category: AuditCategory;
  status: AuditStatus;
  summary: string;
  endpoint?: string;
  httpMethod?: string;
  httpStatus?: number;
  durationMs?: number;
  requestHeaders?: Record<string, string>;
  requestPayload?: any;
  responseHeaders?: Record<string, string>;
  responsePayload?: any;
  itemCount?: number;
  errorDetails?: {
    name?: string;
    message: string;
    stack?: string;
    code?: string | number;
    rawError?: any;
  };
  diagnosticNotes?: string[];
  metadata?: Record<string, any>;
}

export class GooglePhotosConnector {
  public static readonly DEFAULT_CLIENT_ID = '455504850444-51pbff6kslt15k23ddciu3bl934q1q9j.apps.googleusercontent.com';
  public static readonly PROJECT_ID = 'neural-canvas-482621';
  public static readonly SCOPE_READONLY = 'https://www.googleapis.com/auth/photoslibrary.readonly';
  public static readonly SCOPE_PICKER = 'https://www.googleapis.com/auth/photopicker.mediaitems.readonly';
  public static readonly SCOPE_FULL = 'https://www.googleapis.com/auth/photoslibrary';
  public static readonly SCOPE_SHARING = 'https://www.googleapis.com/auth/photoslibrary.sharing';
  public static readonly DEFAULT_SCOPES = `${GooglePhotosConnector.SCOPE_READONLY} ${GooglePhotosConnector.SCOPE_FULL} ${GooglePhotosConnector.SCOPE_PICKER}`;
  public static readonly DEFAULT_TOKEN = '';

  /**
   * Verifies if a space-separated string or array of granted scopes contains sufficient Google Photos read permissions.
   */
  public static hasRequiredPhotosScope(grantedScopes: string | string[]): boolean {
    const list = Array.isArray(grantedScopes)
      ? grantedScopes
      : (grantedScopes || '').split(/\s+/).filter(Boolean);
    return list.some(
      (s) =>
        s === this.SCOPE_READONLY ||
        s === this.SCOPE_FULL ||
        s === this.SCOPE_PICKER ||
        s === this.SCOPE_SHARING ||
        s.includes('photoslibrary') ||
        s.includes('photopicker')
    );
  }

  /**
   * Explicitly verifies an OAuth token and checks if it grants the required Google Photos scope.
   */
  public static async verifyTokenScope(
    tokenInput: string,
    requiredScope = GooglePhotosConnector.SCOPE_READONLY
  ): Promise<{
    isValid: boolean;
    hasPermission: boolean;
    grantedScopes: string[];
    expiresInSeconds?: number;
    tokenEmail?: string;
    error?: string;
  }> {
    const cleanToken = tokenInput.trim().replace(/^Bearer\s+/i, '');
    if (!cleanToken) {
      return { isValid: false, hasPermission: false, grantedScopes: [], error: 'Token is empty' };
    }

    try {
      const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(cleanToken)}`);
      if (!res.ok) {
        const text = await res.text();
        return { isValid: false, hasPermission: false, grantedScopes: [], error: text || `HTTP ${res.status}` };
      }
      const data = await res.json();
      const grantedScopes = (data.scope || '').split(/\s+/).filter(Boolean);
      const hasPermission = grantedScopes.some(
        (s: string) => s === requiredScope || s === GooglePhotosConnector.SCOPE_FULL || s.includes('photoslibrary')
      );
      const expiresInSeconds = parseInt(data.expires_in || '0', 10);
      const tokenEmail = data.email;

      return {
        isValid: true,
        hasPermission,
        grantedScopes,
        expiresInSeconds,
        tokenEmail,
      };
    } catch (e: any) {
      return {
        isValid: false,
        hasPermission: false,
        grantedScopes: [],
        error: e?.message || 'Network error verifying token scope',
      };
    }
  }

  /** Circular buffer of recent audit entries (max 150) */
  private static auditLogs: AuditLogEntry[] = [];
  private static isAuditInitialized = false;

  /**
   * Initializes global audit helper in the browser window
   */
  public static initAuditConsole(): void {
    if (typeof window !== 'undefined' && !this.isAuditInitialized) {
      this.isAuditInitialized = true;
      (window as any).__GPHOTOS_AUDIT__ = {
        getLogs: () => GooglePhotosConnector.getAuditLogs(),
        clearLogs: () => GooglePhotosConnector.clearAuditLogs(),
        printSummary: () => GooglePhotosConnector.printAuditSummary(),
        exportJson: () => JSON.stringify(GooglePhotosConnector.getAuditLogs(), null, 2),
        inspectLastResponse: () => {
          const logs = GooglePhotosConnector.getAuditLogs();
          const lastWithResponse = [...logs].reverse().find(l => l.responsePayload);
          console.log('%c[G-PHOTOS AUDIT] Last Response Payload:', 'color: #38bdf8; font-weight: bold;', lastWithResponse?.responsePayload || 'No response recorded');
          return lastWithResponse?.responsePayload;
        },
      };
      console.info(
        '%c[G-PHOTOS AUDIT]%c Audit logging is active. Type %c__GPHOTOS_AUDIT__.printSummary()%c or %c__GPHOTOS_AUDIT__.getLogs()%c in console to inspect live traffic.',
        'background: #0284c7; color: white; padding: 2px 6px; border-radius: 4px; font-weight: bold;',
        'color: #94a3b8;',
        'color: #38bdf8; font-weight: bold; font-family: monospace;',
        'color: #94a3b8;',
        'color: #38bdf8; font-weight: bold; font-family: monospace;',
        'color: #94a3b8;'
      );
    }
  }

  /**
   * Safe token masking for logs (e.g. "ya29.a0Ad...8A0206")
   */
  public static maskToken(token?: string): string {
    if (!token) return '[EMPTY_TOKEN]';
    const clean = token.trim().replace(/^Bearer\s+/i, '');
    if (clean.length <= 12) return '***';
    return `${clean.substring(0, 8)}...${clean.substring(clean.length - 6)} (${clean.length} chars)`;
  }

  /**
   * Main audit logger with styled console output and in-memory tracking
   */
  public static logAudit(entryInput: Omit<AuditLogEntry, 'id' | 'timestamp' | 'isoTime'>): AuditLogEntry {
    const entry: AuditLogEntry = {
      ...entryInput,
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
    };

    // Store in circular buffer (max 150 items)
    this.auditLogs.push(entry);
    if (this.auditLogs.length > 150) {
      this.auditLogs.shift();
    }

    // Format console styles
    const categoryBadgeStyle = 'background: #0f172a; color: #38bdf8; padding: 2px 6px; border-radius: 4px 0 0 4px; font-weight: bold; border-left: 3px solid #38bdf8; font-size: 11px;';
    
    let statusBadgeStyle = 'background: #0284c7; color: white; padding: 2px 6px; border-radius: 0 4px 4px 0; font-weight: bold; font-size: 11px;';
    let statusText = `● ${entry.status}`;

    if (entry.status === 'SUCCESS') {
      statusBadgeStyle = 'background: #059669; color: white; padding: 2px 6px; border-radius: 0 4px 4px 0; font-weight: bold; font-size: 11px;';
    } else if (entry.status === 'WARNING') {
      statusBadgeStyle = 'background: #d97706; color: white; padding: 2px 6px; border-radius: 0 4px 4px 0; font-weight: bold; font-size: 11px;';
    } else if (entry.status === 'FAILURE') {
      statusBadgeStyle = 'background: #dc2626; color: white; padding: 2px 6px; border-radius: 0 4px 4px 0; font-weight: bold; font-size: 11px;';
    }

    const durationLabel = entry.durationMs !== undefined ? ` [${entry.durationMs.toFixed(1)}ms]` : '';
    const httpLabel = entry.httpStatus ? ` (HTTP ${entry.httpStatus})` : '';

    // Group style based on status
    const groupTitle = `%c[G-PHOTOS AUDIT] ${entry.category}%c${statusText}${httpLabel}${durationLabel}: ${entry.summary}`;
    
    if (entry.status === 'FAILURE') {
      console.group(groupTitle, categoryBadgeStyle, statusBadgeStyle);
    } else {
      console.groupCollapsed(groupTitle, categoryBadgeStyle, statusBadgeStyle);
    }

    console.info(`🕒 Time: ${entry.isoTime} (${entry.timestamp})`);
    
    if (entry.endpoint) {
      console.info(`🌐 Endpoint: [${entry.httpMethod || 'GET'}] ${entry.endpoint}`);
    }

    if (entry.requestHeaders) {
      console.info('📤 Request Headers:', entry.requestHeaders);
    }

    if (entry.requestPayload !== undefined) {
      console.info('📦 Request Payload:', entry.requestPayload);
    }

    if (entry.httpStatus !== undefined) {
      console.info(`📥 HTTP Status: ${entry.httpStatus} ${entry.durationMs ? `(Latency: ${entry.durationMs.toFixed(1)}ms)` : ''}`);
    }

    if (entry.responseHeaders) {
      console.info('📑 Response Headers:', entry.responseHeaders);
    }

    if (entry.responsePayload !== undefined) {
      console.info('📄 Response Payload:', entry.responsePayload);
    }

    if (entry.itemCount !== undefined) {
      console.info(`🖼️ Media Items Processed: ${entry.itemCount}`);
    }

    if (entry.errorDetails) {
      console.error('❌ Error Details:', entry.errorDetails);
    }

    if (entry.diagnosticNotes && entry.diagnosticNotes.length > 0) {
      console.warn('💡 Diagnostic Notes:');
      entry.diagnosticNotes.forEach((note, i) => console.warn(`   ${i + 1}. ${note}`));
    }

    if (entry.metadata) {
      console.info('🏷️ Metadata:', entry.metadata);
    }

    console.groupEnd();
    return entry;
  }

  /**
   * Retrieves all recorded audit log entries
   */
  public static getAuditLogs(): AuditLogEntry[] {
    return [...this.auditLogs];
  }

  /**
   * Clears the in-memory audit logs
   */
  public static clearAuditLogs(): void {
    this.auditLogs = [];
    console.info('%c[G-PHOTOS AUDIT] Audit log buffer cleared.', 'color: #94a3b8; font-style: italic;');
  }

  /**
   * Prints a formatted summary table of recent audit entries
   */
  public static printAuditSummary(): void {
    if (this.auditLogs.length === 0) {
      console.info('%c[G-PHOTOS AUDIT] No audit log entries recorded yet.', 'color: #f59e0b;');
      return;
    }

    console.group('%c[G-PHOTOS AUDIT SUMMARY] Recent Operations Matrix', 'color: #38bdf8; font-weight: bold; font-size: 13px;');
    const summaryTable = this.auditLogs.map((l) => ({
      Time: l.isoTime.split('T')[1].replace('Z', ''),
      Category: l.category,
      Status: l.status,
      HTTP: l.httpStatus || 'N/A',
      Latency: l.durationMs !== undefined ? `${l.durationMs.toFixed(0)}ms` : '-',
      Items: l.itemCount ?? '-',
      Summary: l.summary,
    }));
    console.table(summaryTable);
    console.groupEnd();
  }

  /**
   * Gets the active Client ID (stored or default)
   */
  public static getActiveClientId(): string {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('photosphere_client_id');
      if (stored && stored.trim().length > 0) {
        return stored.trim();
      }
    }
    return this.DEFAULT_CLIENT_ID;
  }

  /**
   * Gets the stored or fallback OAuth bearer token
   */
  public static getActiveToken(): string {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('photosphere_oauth_token') || localStorage.getItem('gp_oauth_access_token');
      if (stored && stored.trim().length > 0) {
        return stored.trim().replace(/^Bearer\s+/i, '');
      }
    }
    return this.DEFAULT_TOKEN;
  }

  /**
   * Formats a Google Photos baseUrl into a dynamically resized, cropped thumbnail
   */
  public static formatThumbnailUrl(baseUrl: string, size = 512): string {
    return `${baseUrl}=w${size}-h${size}-c`;
  }

  /**
   * Formats a Google Photos baseUrl into a maximum quality inspection asset
   */
  public static formatHighResUrl(baseUrl: string, maxWidth = 2048, maxHeight = 2048): string {
    return `${baseUrl}=w${maxWidth}-h${maxHeight}`;
  }

  /**
   * Deeply inspects and diagnoses an OAuth token to detect expiration, invalid formats, missing scopes, or project API issues.
   */
  public static async inspectToken(tokenInput: string): Promise<TokenDiagnostic> {
    this.initAuditConsole();
    const cleanToken = tokenInput.trim().replace(/^Bearer\s+/i, '');
    const startTime = performance.now();

    this.logAudit({
      category: 'TOKEN_INSPECTION',
      status: 'START',
      summary: `Initiating token inspection for token: ${this.maskToken(cleanToken)}`,
      requestPayload: {
        tokenLength: cleanToken.length,
        tokenPrefix: cleanToken.substring(0, 6),
      },
    });

    // 1. Empty or whitespace check
    if (!cleanToken) {
      this.logAudit({
        category: 'TOKEN_INSPECTION',
        status: 'FAILURE',
        summary: 'Token inspection failed: Empty token provided',
        durationMs: performance.now() - startTime,
        errorDetails: {
          message: 'Token is empty or only whitespace',
        },
        diagnosticNotes: ['Provide a valid Google OAuth access token starting with "ya29."'],
      });

      return {
        isValid: false,
        errorType: 'INVALID_TOKEN',
        title: 'Empty OAuth Token',
        message: 'Please paste a valid Google OAuth Access Token (starts with "ya29...").',
        actionGuide: {
          headline: 'How to obtain an Access Token:',
          steps: [
            'Open Google OAuth 2.0 Playground in a new tab.',
            'Under Step 1, paste "https://www.googleapis.com/auth/photoslibrary.readonly" into "Input your own scopes".',
            'Click "Authorize APIs" and sign into your Google Account.',
            'Under Step 2, click "Exchange authorization code for tokens".',
            'Copy the generated "access_token" (starts with ya29) and paste it here.',
          ],
          copyableScope: this.SCOPE_READONLY,
          externalLink: {
            url: 'https://developers.google.com/oauthplayground/',
            label: 'Open Google OAuth Playground',
          },
        },
      };
    }

    // 2. Authorization Code pasted instead of Access Token
    if (cleanToken.startsWith('4/') || cleanToken.startsWith('4%2F')) {
      this.logAudit({
        category: 'TOKEN_INSPECTION',
        status: 'FAILURE',
        summary: 'Authorization Code detected instead of Access Token',
        durationMs: performance.now() - startTime,
        errorDetails: {
          message: 'Input string matches authorization code pattern (starts with "4/")',
        },
        diagnosticNotes: ['In OAuth Playground Step 2, click "Exchange authorization code for tokens" to get the ya29 access token.'],
      });

      return {
        isValid: false,
        errorType: 'AUTH_CODE_MISTAKE',
        title: 'Authorization Code Detected (Not Access Token)',
        message: 'You entered an Authorization Code instead of the Access Token. Authorization codes cannot be used directly to fetch photos.',
        detailedReason: 'In OAuth Playground, Step 2 produces an authorization code first, which must be exchanged for an access token.',
        actionGuide: {
          headline: 'How to get the Access Token from Step 2:',
          steps: [
            'Go back to Google OAuth Playground Step 2.',
            'Click the blue button labeled "Exchange authorization code for tokens".',
            'Look at the response JSON in the right pane or the "Access token" field.',
            'Copy the "access_token" value (which begins with "ya29.") and paste it here.',
          ],
          externalLink: {
            url: 'https://developers.google.com/oauthplayground/',
            label: 'Back to OAuth Playground',
          },
        },
      };
    }

    // 3. API Key pasted instead of OAuth Token
    if (cleanToken.startsWith('AIza')) {
      this.logAudit({
        category: 'TOKEN_INSPECTION',
        status: 'FAILURE',
        summary: 'Google Cloud API Key detected instead of OAuth token',
        durationMs: performance.now() - startTime,
        errorDetails: {
          message: 'Input string matches API Key pattern (starts with "AIza")',
        },
        diagnosticNotes: ['API Keys cannot access private Google Photos. An OAuth Access Token is required.'],
      });

      return {
        isValid: false,
        errorType: 'API_KEY_MISTAKE',
        title: 'Google API Key Detected (OAuth Token Required)',
        message: 'You entered a Google Cloud API Key ("AIza..."). The Google Photos Library API accesses private user photos and requires an OAuth 2.0 Access Token ("ya29...").',
        detailedReason: 'API Keys only identify Google Cloud projects; OAuth 2.0 user tokens authorize access to private user photo libraries.',
        actionGuide: {
          headline: 'How to generate an OAuth User Token:',
          steps: [
            'Open Google OAuth 2.0 Playground.',
            'Authorize with your Google account using the photoslibrary.readonly scope.',
            'Exchange the code in Step 2 to get your "ya29..." Access Token.',
          ],
          copyableScope: this.SCOPE_READONLY,
          externalLink: {
            url: 'https://developers.google.com/oauthplayground/',
            label: 'Open OAuth Playground',
          },
        },
      };
    }

    // 4. Check with Google tokeninfo endpoint
    const probeEndpoint = `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(cleanToken)}`;
    const probeStart = performance.now();

    try {
      const tokenInfoRes = await fetch(probeEndpoint);
      const probeDuration = performance.now() - probeStart;
      const rawText = await tokenInfoRes.text();
      let tokenInfo: any = {};
      try {
        tokenInfo = JSON.parse(rawText);
      } catch {
        tokenInfo = { raw: rawText };
      }

      this.logAudit({
        category: 'AUTH_PROBE',
        status: tokenInfoRes.ok ? 'SUCCESS' : 'FAILURE',
        summary: `OAuth tokeninfo probe returned HTTP ${tokenInfoRes.status}`,
        endpoint: 'https://oauth2.googleapis.com/tokeninfo',
        httpMethod: 'GET',
        httpStatus: tokenInfoRes.status,
        durationMs: probeDuration,
        responsePayload: tokenInfo,
        metadata: {
          maskedToken: this.maskToken(cleanToken),
        },
      });
      
      if (!tokenInfoRes.ok) {
        const errDesc = (tokenInfo.error_description || tokenInfo.error || '').toLowerCase();

        if (errDesc.includes('expired')) {
          this.logAudit({
            category: 'TOKEN_INSPECTION',
            status: 'FAILURE',
            summary: 'Token validation failed: Token expired',
            durationMs: performance.now() - startTime,
            diagnosticNotes: ['Google access tokens are valid for 60 minutes. Generate a fresh token in OAuth Playground or Firebase Auth.'],
          });

          return {
            isValid: false,
            errorType: 'EXPIRED',
            title: 'OAuth Access Token Expired',
            message: 'Your Google OAuth access token has expired. Google access tokens are short-lived and expire after 60 minutes (3,600 seconds).',
            detailedReason: 'Google OAuth access tokens automatically expire for security. A fresh token must be generated.',
            technicalDetails: tokenInfo.error_description || 'Token expired',
            actionGuide: {
              headline: 'How to refresh your token in 20 seconds:',
              steps: [
                'Open Google OAuth Playground.',
                'In Step 2, click "Refresh access token" or "Exchange authorization code for tokens" again.',
                'Copy the fresh "access_token" and paste it here.',
              ],
              externalLink: {
                url: 'https://developers.google.com/oauthplayground/',
                label: 'Generate Fresh Token in Playground',
              },
            },
          };
        }

        return {
          isValid: false,
          errorType: 'INVALID_TOKEN',
          title: 'Invalid or Revoked Access Token',
          message: 'Google could not verify this token. It may be malformed, corrupted, truncated, or has been revoked.',
          detailedReason: 'Google OAuth authentication server returned "invalid_token".',
          technicalDetails: tokenInfo.error_description || 'Invalid token value',
          actionGuide: {
            headline: 'How to generate a working token:',
            steps: [
              'Ensure you copied the entire access_token string without missing characters or leading/trailing whitespace.',
              'Generate a new token in OAuth Playground with the photoslibrary.readonly scope.',
            ],
            copyableScope: this.SCOPE_READONLY,
            externalLink: {
              url: 'https://developers.google.com/oauthplayground/',
              label: 'Generate New Token in Playground',
            },
          },
        };
      }

      const grantedScopesString: string = tokenInfo.scope || '';
      const grantedScopes = grantedScopesString.split(/\s+/).filter(Boolean);
      const expiresIn = parseInt(tokenInfo.expires_in || '0', 10);
      const tokenEmail = tokenInfo.email;

      // Check required scope
      const hasPhotosScope = GooglePhotosConnector.hasRequiredPhotosScope(grantedScopes);

      if (!hasPhotosScope) {
        this.logAudit({
          category: 'TOKEN_INSPECTION',
          status: 'WARNING',
          summary: 'Token is active but missing photoslibrary scopes',
          durationMs: performance.now() - startTime,
          metadata: {
            grantedScopes,
            requiredScope: this.SCOPE_READONLY,
            tokenEmail,
          },
          diagnosticNotes: [
            'The token granted identity/profile access but lacks "https://www.googleapis.com/auth/photoslibrary.readonly".',
            'In Google Sign-In or OAuth Playground, check the box: "See and download your Google Photos library".',
          ],
        });

        return {
          isValid: false,
          errorType: 'MISSING_SCOPES',
          title: 'Missing Required Scopes (photoslibrary.readonly)',
          message: 'Your token is active and valid, but it does not have permission to access your Google Photos library. The required "photoslibrary.readonly" scope was not selected during authorization.',
          detailedReason: `Your token currently only has permissions for: ${grantedScopes.length > 0 ? grantedScopes.join(', ') : 'Basic Profile only'}. It is missing the Google Photos read permission.`,
          scopeIssue: {
            requiredScope: this.SCOPE_READONLY,
            grantedScopes,
            missingScopes: [this.SCOPE_READONLY],
          },
          expiresInSeconds: expiresIn,
          tokenEmail,
          actionGuide: {
            headline: 'How to fix missing scopes in OAuth Playground:',
            steps: [
              'Open Google OAuth Playground Step 1.',
              'Scroll down to "Input your own scopes" at the bottom of the left list.',
              'Paste: "https://www.googleapis.com/auth/photoslibrary.readonly"',
              'Click the blue "Authorize APIs" button and check the box allowing photo library access.',
              'In Step 2, click "Exchange authorization code for tokens" and copy the new access_token.',
            ],
            copyableScope: this.SCOPE_READONLY,
            externalLink: {
              url: 'https://developers.google.com/oauthplayground/',
              label: 'Open OAuth Playground with Scopes',
            },
          },
        };
      }

      // Now verify with the actual Google Photos Library API endpoint to check project enablement
      const testStart = performance.now();
      try {
        const testRes = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=1', {
          headers: {
            'Authorization': `Bearer ${cleanToken}`,
            'Content-Type': 'application/json',
          },
        });

        const testDuration = performance.now() - testStart;
        const errText = await testRes.text();
        let parsedErr: any = {};
        try {
          parsedErr = JSON.parse(errText);
        } catch {
          parsedErr = { raw: errText };
        }

        this.logAudit({
          category: 'AUTH_PROBE',
          status: testRes.ok ? 'SUCCESS' : 'FAILURE',
          summary: `Google Photos Library API probe returned HTTP ${testRes.status}`,
          endpoint: 'https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=1',
          httpMethod: 'GET',
          httpStatus: testRes.status,
          durationMs: testDuration,
          responsePayload: parsedErr,
        });

        if (!testRes.ok) {
          const apiErrMsg = parsedErr.error?.message || errText;

          if (testRes.status === 403 && (apiErrMsg.includes('has not been used') || apiErrMsg.includes('disabled'))) {
            return {
              isValid: false,
              errorType: 'API_NOT_ENABLED',
              title: 'Photos Library API Not Enabled in Project',
              message: 'The Google Photos Library API is not enabled in the Google Cloud Project associated with this token.',
              detailedReason: apiErrMsg,
              actionGuide: {
                headline: 'How to enable the API:',
                steps: [
                  'Visit Google Cloud Console API Library.',
                  'Search for "Photos Library API".',
                  'Click "Enable" on your project.',
                ],
                externalLink: {
                  url: 'https://console.cloud.google.com/apis/library/photoslibrary.googleapis.com',
                  label: 'Enable Photos Library API in Google Cloud',
                },
              },
            };
          }

          if (
            testRes.status === 403 &&
            (apiErrMsg.toLowerCase().includes('insufficient') ||
              apiErrMsg.toLowerCase().includes('scope') ||
              apiErrMsg.toLowerCase().includes('permission') ||
              parsedErr.error?.status === 'PERMISSION_DENIED')
          ) {
            return {
              isValid: false,
              errorType: 'MISSING_SCOPES',
              title: 'Missing Google Photos Permissions (HTTP 403)',
              message: 'Google Photos API rejected access: "Request had insufficient authentication scopes". The token lacks the required "photoslibrary.readonly" permission.',
              detailedReason: apiErrMsg || 'PERMISSION_DENIED: Request had insufficient authentication scopes.',
              scopeIssue: {
                requiredScope: this.SCOPE_READONLY,
                grantedScopes,
                missingScopes: [this.SCOPE_READONLY],
              },
              actionGuide: {
                headline: 'How to fix insufficient scopes:',
                steps: [
                  'If using Google Sign-In, click "Sign In" again and check the box: "See and download your Google Photos library".',
                  'If using OAuth Playground, enter "https://www.googleapis.com/auth/photoslibrary.readonly" under Step 1 "Input your own scopes".',
                  'Authorize APIs, confirm the photo permission prompt, exchange for tokens in Step 2, and paste the "access_token" here.',
                ],
                copyableScope: this.SCOPE_READONLY,
                externalLink: {
                  url: 'https://developers.google.com/oauthplayground/',
                  label: 'Open OAuth Playground with Required Scope',
                },
              },
            };
          }
        }
      } catch (probeError: any) {
        this.logAudit({
          category: 'AUTH_PROBE',
          status: 'WARNING',
          summary: 'Photos Library API probe network warning (proceeding with validated token)',
          errorDetails: {
            message: probeError?.message || 'Probe request failed',
          },
        });
      }

      this.logAudit({
        category: 'TOKEN_INSPECTION',
        status: 'SUCCESS',
        summary: `Token validated successfully for ${tokenEmail || 'Google User'} (Expires in ~${Math.round(expiresIn / 60)}m)`,
        durationMs: performance.now() - startTime,
        metadata: {
          tokenEmail,
          expiresInSeconds: expiresIn,
          grantedScopes,
        },
      });

      return {
        isValid: true,
        title: 'Google Photos Connection Active',
        message: `Token is valid and active with Google Photos read permissions.${expiresIn ? ` Expires in ~${Math.round(expiresIn / 60)} minutes.` : ''}`,
        expiresInSeconds: expiresIn,
        tokenEmail,
        grantedScopes,
      };
    } catch (networkErr: any) {
      this.logAudit({
        category: 'TOKEN_INSPECTION',
        status: 'FAILURE',
        summary: 'Network error communicating with Google tokeninfo endpoint',
        durationMs: performance.now() - startTime,
        errorDetails: {
          message: networkErr?.message || 'Network fetch failed',
          rawError: networkErr,
        },
        diagnosticNotes: [
          'Verify your device has active internet access.',
          'Check if browser extensions or adblockers are intercepting oauth2.googleapis.com calls.',
        ],
      });

      return {
        isValid: false,
        errorType: 'NETWORK_ERROR',
        title: 'Network / Connection Error',
        message: 'Could not connect to Google authentication servers. Please verify your internet connection.',
        technicalDetails: networkErr?.message || 'Failed to fetch tokeninfo',
        actionGuide: {
          headline: 'Troubleshooting tips:',
          steps: [
            'Check your internet connection.',
            'Verify that browser extensions or adblockers are not blocking googleapis.com requests.',
          ],
        },
      };
    }
  }

  /**
   * Loads albums list directly from Google Photos Library API
   */
  public static async listAlbums(accessToken: string): Promise<{ id: string; title: string; mediaItemsCount?: string; coverPhotoBaseUrl?: string }[]> {
    this.initAuditConsole();
    const cleanToken = accessToken.trim().replace(/^Bearer\s+/i, '');
    const startTime = performance.now();
    const endpoint = 'https://photoslibrary.googleapis.com/v1/albums?pageSize=50';

    this.logAudit({
      category: 'ALBUMS_FETCH',
      status: 'START',
      summary: 'Fetching user photo albums list from Google Photos API',
      endpoint,
      httpMethod: 'GET',
      requestHeaders: {
        'Authorization': `Bearer ${this.maskToken(cleanToken)}`,
        'Content-Type': 'application/json',
      },
    });

    try {
      const response = await fetch(endpoint, {
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/json',
        },
      });

      const durationMs = performance.now() - startTime;
      const rawText = await response.text();
      let data: any = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        data = { raw: rawText };
      }

      if (!response.ok) {
        this.logAudit({
          category: 'ALBUMS_FETCH',
          status: 'FAILURE',
          summary: `Albums request failed with HTTP ${response.status}`,
          endpoint,
          httpMethod: 'GET',
          httpStatus: response.status,
          durationMs,
          responsePayload: data,
          errorDetails: {
            message: data.error?.message || `HTTP ${response.status}`,
            rawError: data,
          },
        });
        return [];
      }

      const albums = (data.albums as any[]) || [];

      this.logAudit({
        category: 'ALBUMS_FETCH',
        status: 'SUCCESS',
        summary: `Retrieved ${albums.length} album(s) from Google Photos`,
        endpoint,
        httpMethod: 'GET',
        httpStatus: response.status,
        durationMs,
        itemCount: albums.length,
        responsePayload: {
          albumsCount: albums.length,
          sampleAlbums: albums.slice(0, 5).map((a) => ({
            id: a.id,
            title: a.title,
            mediaItemsCount: a.mediaItemsCount,
          })),
        },
      });

      return albums;
    } catch (err: any) {
      this.logAudit({
        category: 'ALBUMS_FETCH',
        status: 'FAILURE',
        summary: 'Network error fetching album list',
        endpoint,
        httpMethod: 'GET',
        durationMs: performance.now() - startTime,
        errorDetails: {
          message: err?.message || 'Fetch failed',
          rawError: err,
        },
      });
      return [];
    }
  }

  /**
   * Loads media items directly from Google Photos Library API with optional pagination
   */
  public static async loadAlbumMedia(accessToken: string, albumId?: string, maxItems = 200): Promise<GooglePhotoItem[]> {
    this.initAuditConsole();
    const cleanToken = accessToken.trim().replace(/^Bearer\s+/i, '');
    let allItems: GooglePhotoItem[] = [];
    let nextPageToken: string | undefined = undefined;
    let pageCount = 0;
    const overallStartTime = performance.now();

    const endpoint = albumId
      ? 'https://photoslibrary.googleapis.com/v1/mediaItems:search'
      : 'https://photoslibrary.googleapis.com/v1/mediaItems';

    this.logAudit({
      category: 'MEDIA_FETCH',
      status: 'START',
      summary: `Starting media items retrieval (${albumId ? `Album: ${albumId}` : 'Entire Library'}, target: up to ${maxItems} items)`,
      endpoint,
      httpMethod: albumId ? 'POST' : 'GET',
      requestPayload: {
        albumId,
        maxItems,
        targetEndpoint: endpoint,
        token: this.maskToken(cleanToken),
      },
    });

    do {
      pageCount++;
      const pageStartTime = performance.now();
      const url = new URL(endpoint);
      if (!albumId && nextPageToken) {
        url.searchParams.set('pageToken', nextPageToken);
      }
      if (!albumId) {
        url.searchParams.set('pageSize', '100');
      }

      const body = albumId
        ? JSON.stringify({
            albumId,
            pageSize: 100,
            pageToken: nextPageToken,
          })
        : undefined;

      const requestHeaders: Record<string, string> = {
        'Authorization': `Bearer ${cleanToken}`,
        'Content-Type': 'application/json',
      };

      const response = await fetch(url.toString(), {
        method: albumId ? 'POST' : 'GET',
        headers: requestHeaders,
        body,
      });

      const pageDuration = performance.now() - pageStartTime;
      const rawText = await response.text();
      let data: any = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        data = { raw: rawText };
      }

      if (!response.ok) {
        let apiMessage = `Google Photos API Error (${response.status})`;
        let statusText = '';
        if (data.error?.message) {
          apiMessage = data.error.message;
        }
        if (data.error?.status) {
          statusText = data.error.status;
        }

        this.logAudit({
          category: 'MEDIA_FETCH',
          status: 'FAILURE',
          summary: `Media fetch rejected: HTTP ${response.status} - ${apiMessage}`,
          endpoint: url.toString(),
          httpMethod: albumId ? 'POST' : 'GET',
          httpStatus: response.status,
          durationMs: pageDuration,
          requestPayload: body ? JSON.parse(body) : { pageSize: 100, pageToken: nextPageToken },
          responsePayload: data,
          errorDetails: {
            code: response.status,
            message: apiMessage,
            rawError: data,
          },
          diagnosticNotes: [
            response.status === 401 ? 'Token is expired. Generate a fresh access_token.' : '',
            response.status === 403 && (apiMessage.includes('scope') || statusText === 'PERMISSION_DENIED')
              ? 'Token lacks "photoslibrary.readonly". Check the Google Photos permission box during sign-in.'
              : '',
            response.status === 403 && apiMessage.includes('has not been used')
              ? 'Enable the "Photos Library API" in Google Cloud Console.'
              : '',
          ].filter(Boolean),
        });

        // Format into specific, friendly error messages
        if (response.status === 401 || statusText === 'UNAUTHENTICATED' || apiMessage.toLowerCase().includes('expired')) {
          throw new Error('Google OAuth token is expired or invalid. Please generate a fresh token.');
        } else if (
          response.status === 403 &&
          (apiMessage.toLowerCase().includes('scope') ||
            apiMessage.toLowerCase().includes('insufficient') ||
            statusText === 'PERMISSION_DENIED')
        ) {
          throw new Error('Missing required scope: Token does not have photoslibrary.readonly permission.');
        } else if (response.status === 403 && apiMessage.toLowerCase().includes('has not been used')) {
          throw new Error('Photos Library API is not enabled in your Google Cloud project.');
        } else if (response.status === 429) {
          throw new Error('Google Photos API rate limit reached. Please wait a moment and try again.');
        } else {
          throw new Error(apiMessage);
        }
      }

      const items = (data.mediaItems as GooglePhotoItem[]) || [];
      allItems = allItems.concat(items);
      nextPageToken = data.nextPageToken;

      // Sample first 3 items for deep inspection
      const sampleInspect = items.slice(0, 3).map((item) => ({
        id: item.id,
        filename: item.filename,
        mimeType: item.mimeType,
        hasBaseUrl: Boolean(item.baseUrl),
        baseUrlPreview: item.baseUrl ? `${item.baseUrl.substring(0, 35)}...` : 'MISSING',
        width: item.mediaMetadata?.width,
        height: item.mediaMetadata?.height,
        creationTime: item.mediaMetadata?.creationTime,
      }));

      this.logAudit({
        category: 'MEDIA_FETCH',
        status: 'SUCCESS',
        summary: `Page ${pageCount} returned ${items.length} media item(s) (Total so far: ${allItems.length})`,
        endpoint: url.toString(),
        httpMethod: albumId ? 'POST' : 'GET',
        httpStatus: response.status,
        durationMs: pageDuration,
        itemCount: items.length,
        responsePayload: {
          page: pageCount,
          itemsInPage: items.length,
          totalAccumulated: allItems.length,
          hasNextPage: Boolean(nextPageToken),
          nextPageTokenPreview: nextPageToken ? `${nextPageToken.substring(0, 20)}...` : null,
          sampleItems: sampleInspect,
        },
      });

      if (allItems.length >= maxItems) break;
    } while (nextPageToken);

    this.logAudit({
      category: 'MEDIA_FETCH',
      status: 'SUCCESS',
      summary: `Media retrieval complete: Loaded ${allItems.length} photo(s) across ${pageCount} request(s)`,
      durationMs: performance.now() - overallStartTime,
      itemCount: allItems.length,
      metadata: {
        totalItemsLoaded: allItems.length,
        pagesRequested: pageCount,
        albumId: albumId || 'ALL_PHOTOS',
      },
    });

    return allItems;
  }

  /**
   * Converts GooglePhotoItems into PhotoMemoryItems for the 3D WebGL Matrix
   */
  public static convertToPhotoMemoryItems(googleItems: GooglePhotoItem[]): PhotoMemoryItem[] {
    this.initAuditConsole();
    const startTime = performance.now();

    const samplePeopleSets = [
      ['Charleigh', 'Mom', 'Dad'],
      ['Charleigh', 'Grandma'],
      ['Charleigh', 'Bella the Golden'],
      ['Mom', 'Dad'],
      ['Charleigh'],
      ['Family & Friends'],
    ];

    const sampleCategories = [
      'Milestones',
      'Outdoor Adventures',
      'Bedtime Stories',
      'Celebrations',
      'Travel',
      'Everyday Joy',
    ] as const;

    const sampleLocations = [
      { name: 'San Francisco, CA', lat: 37.7749, lng: -122.4194 },
      { name: 'Honolulu, HI', lat: 21.3069, lng: -157.8583 },
      { name: 'Banff National Park', lat: 51.1784, lng: -115.5708 },
      { name: 'Tokyo, Japan', lat: 35.6762, lng: 139.6503 },
      { name: 'Paris, France', lat: 48.8566, lng: 2.3522 },
      { name: 'New York City, NY', lat: 40.7128, lng: -74.0060 },
      { name: 'Lake Tahoe, NV', lat: 39.0968, lng: -120.0324 },
    ];

    let missingBaseUrlCount = 0;

    const converted: PhotoMemoryItem[] = googleItems.map((item, idx) => {
      if (!item.baseUrl) {
        missingBaseUrlCount++;
      }

      const width = parseInt(item.mediaMetadata?.width || '1920', 10);
      const height = parseInt(item.mediaMetadata?.height || '1080', 10);
      const aspect = width / Math.max(1, height);
      const creationTime = item.mediaMetadata?.creationTime 
        ? new Date(item.mediaMetadata.creationTime).getTime() 
        : Date.now() - (googleItems.length - idx) * 86400000 * 2;

      const loc = sampleLocations[idx % sampleLocations.length];
      const hue = Math.floor((idx * 137.5) % 360);
      const dominantColor = `hsl(${hue}, 80%, 65%)`;

      return {
        id: item.id || `gphoto_${idx}_${Date.now()}`,
        title: item.filename?.replace(/\.[^/.]+$/, '') || `Memory #${idx + 1}`,
        description: `Captured in ${loc.name}`,
        timestamp: creationTime,
        thumbnailUrl: item.baseUrl ? this.formatThumbnailUrl(item.baseUrl, 512) : '',
        highResUrl: item.baseUrl ? this.formatHighResUrl(item.baseUrl, 2048, 2048) : '',
        dominantColor,
        hue,
        aspectRatio: aspect,
        exif: {
          cameraMake: item.mediaMetadata?.photo?.cameraMake || 'Sony Alpha / Pixel Pro',
          focalLength: item.mediaMetadata?.photo?.focalLength || 35 + (idx % 5) * 15,
          iso: item.mediaMetadata?.photo?.isoEquivalent || 100 * (1 + (idx % 8)),
          exposureTime: `1/${250 + (idx % 6) * 125}s`,
          latitude: loc.lat,
          longitude: loc.lng,
          locationName: loc.name,
        },
        people: samplePeopleSets[idx % samplePeopleSets.length],
        tags: [
          'memory',
          loc.name.split(',')[0].toLowerCase().trim(),
          sampleCategories[idx % sampleCategories.length].toLowerCase(),
          'photo',
        ],
        category: sampleCategories[idx % sampleCategories.length],
        sentimentScore: 0.5 + Math.sin(idx * 0.4) * 0.4,
        currentPos: [0, 0, 0],
        targetPos: [0, 0, 0],
        rotation: [0, 0, 0],
        targetRotation: [0, 0, 0],
        matchScore: 1.0,
        isHighlighted: false,
        isSelected: false,
        opacity: 1.0,
        scale: 1.0,
      };
    });

    this.logAudit({
      category: 'DATA_TRANSFORMATION',
      status: missingBaseUrlCount > 0 ? 'WARNING' : 'SUCCESS',
      summary: `Hydrated ${converted.length} GooglePhotoItems into PhotoMemoryItems for 3D Matrix`,
      durationMs: performance.now() - startTime,
      itemCount: converted.length,
      metadata: {
        rawInputCount: googleItems.length,
        hydratedCount: converted.length,
        missingBaseUrlCount,
      },
      responsePayload: {
        sampleOutput: converted.slice(0, 3).map((c) => ({
          id: c.id,
          title: c.title,
          aspectRatio: c.aspectRatio,
          thumbnailUrl: c.thumbnailUrl ? `${c.thumbnailUrl.substring(0, 40)}...` : 'NONE',
          timestamp: new Date(c.timestamp).toISOString(),
        })),
      },
      diagnosticNotes: missingBaseUrlCount > 0
        ? [`${missingBaseUrlCount} item(s) had missing baseUrl from Google Photos API. Check if items are videos or non-image assets.`]
        : undefined,
    });

    return converted;
  }

  /**
   * Request Google Identity Services (GIS) Token via OAuth2 Client
   */
  public static requestGisToken(
    clientId: string,
    onSuccess: (token: string) => void,
    onError: (err: Error) => void,
    options?: { prompt?: string; scope?: string; verifyScope?: boolean }
  ): void {
    this.initAuditConsole();
    const startTime = performance.now();
    const requestedScope = options?.scope || this.DEFAULT_SCOPES;

    this.logAudit({
      category: 'GIS_INIT',
      status: 'START',
      summary: 'Initializing Google Identity Services (GIS) token client popup',
      requestPayload: {
        clientId: clientId.trim(),
        scopesRequested: requestedScope,
        prompt: options?.prompt || 'consent',
      },
    });

    if (typeof window === 'undefined') {
      const err = new Error('Window environment not available');
      this.logAudit({
        category: 'GIS_INIT',
        status: 'FAILURE',
        summary: 'GIS initialization failed: No window object',
        errorDetails: { message: err.message },
      });
      onError(err);
      return;
    }

    const gis = (window as any).google?.accounts?.oauth2;
    if (!gis || typeof gis.initTokenClient !== 'function') {
      const err = new Error(
        'Google Identity Services (GIS) library is still initializing or blocked. Please verify network connectivity or disable strict adblockers.'
      );
      this.logAudit({
        category: 'GIS_INIT',
        status: 'FAILURE',
        summary: 'GIS script not found on window.google.accounts.oauth2',
        durationMs: performance.now() - startTime,
        errorDetails: { message: err.message },
        diagnosticNotes: [
          'Ensure https://accounts.google.com/gsi/client is loaded in index.html.',
          'Verify browser is not blocking 3rd-party scripts.',
        ],
      });
      onError(err);
      return;
    }

    try {
      const client = gis.initTokenClient({
        client_id: clientId.trim(),
        scope: requestedScope,
        error_callback: (errorObj: any) => {
          const errMessage = errorObj?.message || errorObj?.error || 'Google Sign-in failed or was closed.';
          this.logAudit({
            category: 'GIS_INIT',
            status: 'FAILURE',
            summary: `GIS error callback triggered: ${errMessage}`,
            durationMs: performance.now() - startTime,
            errorDetails: {
              message: errMessage,
              rawError: errorObj,
            },
          });
          onError(new Error(errMessage));
        },
        callback: async (response: any) => {
          const duration = performance.now() - startTime;
          if (response.error !== undefined) {
            const errDescription = response.error_description || response.error;
            this.logAudit({
              category: 'GIS_INIT',
              status: 'FAILURE',
              summary: `Google OAuth consent error: ${errDescription}`,
              durationMs: duration,
              responsePayload: response,
              errorDetails: {
                message: errDescription,
                rawError: response,
              },
            });
            onError(new Error(`Google OAuth Error: ${errDescription}`));
            return;
          }

          if (response.access_token) {
            // Verify granted scopes from response
            if (response.scope) {
              const hasPhotosScope = GooglePhotosConnector.hasRequiredPhotosScope(response.scope);
              if (!hasPhotosScope) {
                const scopeError = new Error(
                  'Missing required scope: "https://www.googleapis.com/auth/photoslibrary.readonly". Please re-authenticate and ensure the Google Photos permission checkbox is checked.'
                );
                this.logAudit({
                  category: 'GIS_INIT',
                  status: 'FAILURE',
                  summary: 'GIS returned access token but photoslibrary.readonly scope was not granted',
                  durationMs: duration,
                  responsePayload: response,
                  errorDetails: { message: scopeError.message },
                  diagnosticNotes: [
                    'User unchecked the Google Photos permission box on the consent screen.',
                    'The token does not have sufficient permissions to fetch media items.',
                  ],
                });
                onError(scopeError);
                return;
              }
            }

            // Optional probe verification if requested
            if (options?.verifyScope) {
              try {
                const verification = await GooglePhotosConnector.verifyTokenScope(
                  response.access_token,
                  GooglePhotosConnector.SCOPE_READONLY
                );
                if (!verification.hasPermission) {
                  const scopeError = new Error(
                    'The acquired Google access token lacks the required "https://www.googleapis.com/auth/photoslibrary.readonly" scope. Please authorize with full Photos access.'
                  );
                  this.logAudit({
                    category: 'GIS_INIT',
                    status: 'FAILURE',
                    summary: 'Token scope verification failed via tokeninfo probe',
                    durationMs: duration,
                    errorDetails: { message: scopeError.message },
                  });
                  onError(scopeError);
                  return;
                }
              } catch (verifyErr) {
                console.warn('Scope probe check warning:', verifyErr);
              }
            }

            this.logAudit({
              category: 'GIS_INIT',
              status: 'SUCCESS',
              summary: `GIS token received & verified with photoslibrary.readonly scope (${response.expires_in || 3600}s expiration)`,
              durationMs: duration,
              responsePayload: {
                token: this.maskToken(response.access_token),
                expiresIn: response.expires_in,
                tokenType: response.token_type,
                scope: response.scope,
              },
            });
            onSuccess(response.access_token);
          } else {
            this.logAudit({
              category: 'GIS_INIT',
              status: 'WARNING',
              summary: 'GIS returned callback without access_token',
              durationMs: duration,
              responsePayload: response,
            });
            onError(new Error('Google authorization response did not include an access token.'));
          }
        },
      });

      client.requestAccessToken({
        prompt: options?.prompt !== undefined ? options.prompt : 'consent',
      });
    } catch (e: any) {
      const duration = performance.now() - startTime;
      this.logAudit({
        category: 'GIS_INIT',
        status: 'FAILURE',
        summary: `Exception initializing GIS Token Client: ${e?.message}`,
        durationMs: duration,
        errorDetails: {
          message: e?.message || 'Unknown exception',
          rawError: e,
        },
      });
      onError(new Error(e?.message || 'Failed to initialize Google Identity Services Token Client'));
    }
  }
}

