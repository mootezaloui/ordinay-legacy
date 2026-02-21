/**
 * IPC Channel Constants
 *
 * Single source of truth for all Electron IPC channel names.
 * Used by both preload.cjs (via require) and renderer TypeScript code.
 *
 * Migration note: The 'api-request' channel replaces all direct HTTP fetch()
 * calls from the renderer to the local backend. Instead of:
 *   fetch(`http://localhost:${port}/api/clients`)
 * the renderer now does:
 *   window.electronAPI.apiRequest('GET', '/clients')
 * which routes through IPC → main process → named pipe → Express backend.
 *
 * Endpoint → IPC mapping (all go through 'api-request'):
 *   GET    /clients                        → apiRequest('GET', '/clients')
 *   POST   /clients                        → apiRequest('POST', '/clients', body)
 *   GET    /clients/:id                    → apiRequest('GET', '/clients/123')
 *   PUT    /clients/:id                    → apiRequest('PUT', '/clients/123', body)
 *   DELETE /clients/:id                    → apiRequest('DELETE', '/clients/123')
 *   (same pattern for: dossiers, lawsuits, tasks, personal-tasks, sessions,
 *    officers, documents, missions, financial, notifications, history,
 *    notes, operators, profile, dashboard, imports, email, agent)
 *
 * Special endpoints also routed through 'api-request':
 *   POST   /financial/:id/cancel           → apiRequest('POST', '/financial/123/cancel', body)
 *   GET    /financial/client/:id/balance   → apiRequest('GET', '/financial/client/123/balance')
 *   GET    /financial/check/:type/:id      → apiRequest('GET', '/financial/check/dossier/1')
 *   GET    /missions/:id/delete-impact     → apiRequest('GET', '/missions/123/delete-impact')
 *   POST   /notifications/dismiss          → apiRequest('POST', '/notifications/dismiss', body)
 *   GET    /notifications/dismissed        → apiRequest('GET', '/notifications/dismissed?...')
 *   DELETE /notifications                  → apiRequest('DELETE', '/notifications?...')
 *   DELETE /history/entity                 → apiRequest('DELETE', '/history/entity?...')
 *   GET    /dashboard/summary              → apiRequest('GET', '/dashboard/summary')
 *   GET    /profile/stats                  → apiRequest('GET', '/profile/stats')
 *   GET    /operators/current              → apiRequest('GET', '/operators/current')
 *   POST   /imports/auto                   → apiRequest('POST', '/imports/auto', body)
 *   POST   /imports/raw                    → apiRequest('POST', '/imports/raw', body)
 *   POST   /imports/:id/normalize          → apiRequest('POST', '/imports/1/normalize', body)
 *   POST   /imports/:id/validate           → apiRequest('POST', '/imports/1/validate', body)
 *   GET    /imports/aliases                → apiRequest('GET', '/imports/aliases')
 *   POST   /email/send                     → apiRequest('POST', '/email/send', body)
 *   GET    /email/status                   → apiRequest('GET', '/email/status')
 *   POST   /notes/bulk-save               → apiRequest('POST', '/notes/bulk-save', body)
 *   PATCH  /notes/:id                      → apiRequest('PATCH', '/notes/123', body)
 */

// Generic API request channel — replaces all HTTP fetch calls to the backend
export const API_REQUEST = 'api-request';

// Existing IPC channels (unchanged)
export const GET_BACKEND_CONFIG = 'get-backend-config';
export const GET_APP_PATHS = 'get-app-paths';
export const IS_PACKAGED = 'is-packaged';
export const READ_LICENSE_FILE = 'read-license-file';
export const WRITE_LICENSE_FILE = 'write-license-file';
export const READ_DEVICE_ID = 'read-device-id';
export const WRITE_DEVICE_ID = 'write-device-id';
export const OPEN_EXTERNAL_WEB_URL = 'open-external-web-url';
export const OPEN_EXTERNAL_MAILTO = 'open-external-mailto';
export const OPEN_EXTERNAL_URL = 'open-external-url';
export const RESET_APP_DATA = 'reset-app-data';
export const UPDATES_GET_STATUS = 'updates-get-status';
export const UPDATES_CHECK = 'updates-check';
export const UPDATES_DOWNLOAD = 'updates-download';
export const UPDATES_INSTALL = 'updates-install';
export const WINDOW_MINIMIZE = 'window-minimize';
export const WINDOW_MAXIMIZE = 'window-maximize';
export const WINDOW_CLOSE = 'window-close';
export const WINDOW_IS_MAXIMIZED = 'window-is-maximized';
export const ACTIVATION_URL = 'activation-url';
export const UPDATE_STATUS = 'update-status';
