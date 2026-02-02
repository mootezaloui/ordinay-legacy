# IPC Migration Regression Test Plan

## What Changed

The local Express backend no longer listens on a TCP port. Instead it listens
on a **Windows named pipe** (`\\.\pipe\ordinay-backend-<pid>`) or **Unix
socket** on macOS/Linux. The renderer process communicates with the backend
exclusively through **Electron IPC** (`window.electronAPI.apiRequest`), which
the main process proxies to the backend over the named pipe.

### Files Modified

| File | Change |
|------|--------|
| `backend/src/server.js` | Supports `ORDINAY_PIPE` env var for named-pipe listening |
| `frontend/electron/main.cjs` | Generates pipe path, adds `api-request` IPC handler + `proxyApiRequest`, updates CSP, adds startup guardrail log |
| `frontend/electron/preload.cjs` | Exposes `apiRequest(method, url, body)` bridge |
| `frontend/src/services/api/client.ts` | Routes through IPC in Electron, HTTP fallback for web |
| `frontend/src/lib/apiConfig.ts` | Detects IPC mode from `useIPC` flag |
| `frontend/src/types/electron.d.ts` | Added `apiRequest` and `ApiResponse` types |
| `frontend/src/lib/ipcChannels.ts` | New file: single source of truth for IPC channel names |

### Endpoint → IPC Mapping

All endpoints previously accessed via `fetch("http://localhost:<port>/api/...")` are now
routed through:

```
renderer  →  window.electronAPI.apiRequest(method, path, body)
          →  ipcRenderer.invoke('api-request', ...)
          →  ipcMain.handle('api-request', ...)
          →  http.request({ socketPath: pipePath, ... })
          →  Express backend (on named pipe)
```

---

## Manual Regression Checklist

### 1. App Launch
- [ ] App launches without crash
- [ ] No Windows Firewall "allow access" prompt appears
- [ ] DevTools console shows `[Electron] Backend transport: named pipe (no TCP port opened)`
- [ ] DevTools console shows `[API Config] Initialized from Electron: ipc://backend/api (IPC transport)`
- [ ] DevTools Network tab shows NO requests to `localhost:<port>` (all API calls go through IPC)

### 2. Clients
- [ ] Clients list loads
- [ ] Create a new client
- [ ] Edit client name and save
- [ ] Delete a client
- [ ] Verify notes on client detail are saved and loaded

### 3. Dossiers
- [ ] Dossiers list loads
- [ ] Create a new dossier linked to a client
- [ ] Edit dossier and save
- [ ] Delete a dossier

### 4. Lawsuits
- [ ] Lawsuits list loads
- [ ] Create / edit / delete a lawsuit

### 5. Tasks
- [ ] Tasks list loads
- [ ] Create a task linked to a dossier
- [ ] Mark a task as complete
- [ ] Delete a task

### 6. Personal Tasks
- [ ] Personal tasks list loads
- [ ] Create / complete / delete a personal task

### 7. Sessions (Hearings)
- [ ] Sessions list loads
- [ ] Create / edit / delete a session

### 8. Missions
- [ ] Missions list loads
- [ ] Create / edit / delete a mission
- [ ] Verify "delete impact" check works (before deleting a mission with linked financials)

### 9. Officers
- [ ] Officers list loads
- [ ] Create / edit / delete an officer

### 10. Financial Entries
- [ ] Financial entries list loads
- [ ] Create a financial entry (revenue and expense)
- [ ] Verify totals/balance calculations are correct
- [ ] Cancel a financial entry
- [ ] Delete a financial entry

### 11. Documents
- [ ] Documents tab loads on entity detail views
- [ ] Create / delete a document record

### 12. Notifications
- [ ] Notifications page loads
- [ ] Dismiss a notification
- [ ] Clear all notifications
- [ ] Verify dismissed state persists after page reload

### 13. History
- [ ] History events are recorded when creating/updating entities
- [ ] History tab on entity detail view loads correctly

### 14. Dashboard
- [ ] Dashboard page loads with correct summary data

### 15. Profile / Operator
- [ ] Profile stats load
- [ ] Operator profile can be viewed and updated

### 16. Imports (if used)
- [ ] Import queue loads
- [ ] Auto-import and manual import work
- [ ] Normalize / validate imported records

### 17. Activation / Deep Links
- [ ] `ordinay://` deep link still handled (test by navigating to a protocol URL)
- [ ] Activation flow still works (if license flow is testable)

### 18. Updates
- [ ] Update check still works (Settings → Check for Updates)
- [ ] Download and install flow still works (outbound HTTPS, not affected by this change)

### 19. Reset App Data
- [ ] Settings → Reset app data works (backend restarts on pipe, data cleared)

### 20. Window Controls
- [ ] Minimize, maximize, close buttons work
- [ ] Window state restoration works

---

## Verification: No TCP Port Open

After the app is running, verify no TCP port is opened by the backend:

**Windows (PowerShell):**
```powershell
Get-NetTCPConnection -OwningProcess (Get-Process -Name node).Id 2>$null
# Should return empty or only outbound connections
```

**Or use Task Manager → Resource Monitor → Network → Listening Ports**
- There should be NO listening port from `node.exe` (the backend child process)

---

## Rollback

If the IPC migration causes issues, set the `ORDINAY_PIPE` environment variable
to empty to fall back to TCP mode:

```
set ORDINAY_PIPE=
```

The backend `server.js` will then listen on a TCP port as before.
