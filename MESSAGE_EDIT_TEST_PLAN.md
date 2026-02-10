# Message Edit Feature - Test Plan

**Feature**: Edit last user message with proper versioning and invalidation

**Status**: Implementation complete, ready for testing

---

## Test Scenarios

### Scenario 1: Basic Edit (Before Agent Response)

**Setup**:
1. Start fresh session
2. Type a user message: "Show me all clients"
3. **Before the agent responds**, click Edit button

**Expected**:
- ✓ Edit button appears on hover over the user message
- ✓ Click opens textarea with current message text
- ✓ Can modify text (e.g., change to "Show me active clients")
- ✓ Save calls backend `/api/agent/edit`
- ✓ Message shows "(edited)" badge
- ✓ Agent starts processing edited message
- ✓ New agent response appears

**Verify Backend**:
- Check console logs for `[Edit] Message edited successfully`
- Original message marked as `supersededBy` in transcript
- New message has `previousVersion` and `editedAt` fields

---

### Scenario 2: Edit After Agent Response

**Setup**:
1. Start fresh session
2. Type: "Show me all dossiers"
3. **Wait for agent response** (artifact appears)
4. Click Edit on user message

**Expected**:
- ✓ Edit button appears on hover
- ✓ Click opens textarea
- ✓ Modify text (e.g., "Show me urgent dossiers")
- ✓ Save removes the old agent response immediately
- ✓ New agent request starts
- ✓ New agent response replaces the old one

**Critical Check**:
- The old agent response must be **removed from UI** before new one appears
- No stale data should remain visible

---

### Scenario 3: Edit Multiple Times

**Setup**:
1. Send message: "List clients"
2. Wait for response
3. Edit to "List active clients"
4. Wait for new response
5. Edit again to "List inactive clients"

**Expected**:
- ✓ Each edit creates a new version
- ✓ Only the most recent message shows edit button
- ✓ Previous versions are preserved in backend but not editable
- ✓ Each edit triggers fresh agent processing

**Verify Backend**:
- Check transcript store has chain: original → edit1 → edit2
- Each has `supersededBy` or `previousVersion` correctly set

---

### Scenario 4: Edit During Agent Streaming

**Setup**:
1. Send a complex message that takes time to process
2. **While agent is streaming**, try to click Edit

**Expected**:
- ✓ Edit button is **disabled** (grayed out, cursor-not-allowed)
- ✓ Tooltip shows "Editing disabled while loading"
- ✓ Cannot open edit textarea during streaming

**Critical Safety**:
- Must not allow editing during active agent processing
- Prevents race conditions and corrupted state

---

### Scenario 5: Edit with Attachments (if supported)

**Setup**:
1. Send message with image attachment
2. Wait for response
3. Try to edit

**Expected**:
- ✓ Edit button appears
- ✓ Can edit text portion
- ✓ Attachments remain attached
- OR: Define behavior for attachment handling

**Note**: Current implementation may not handle attachment re-upload. Document expected behavior.

---

### Scenario 6: Edit Older Messages (Should Fail)

**Setup**:
1. Send message 1: "Show clients"
2. Wait for response
3. Send message 2: "Show dossiers"
4. Try to edit message 1

**Expected**:
- ✓ Edit button **does NOT appear** on message 1
- ✓ Only message 2 (last user message) has edit button
- ✓ Hovering over message 1 shows no edit affordance

**Critical Requirement**:
- Only the **last** user message can be edited
- Older messages are locked

---

### Scenario 7: Edit After Proposal (V3 - if applicable)

**Setup**:
1. Trigger action proposal (e.g., "Create task...")
2. Agent generates proposal artifact
3. **Before confirming**, edit the original message

**Expected**:
- ✓ Can edit the message
- ✓ Proposal should be invalidated/removed
- ✓ New agent processing starts fresh
- ✓ No orphaned proposal remains

**Note**: Backend has TODO for proposal cancellation. Test current behavior.

---

### Scenario 8: Cancel Edit

**Setup**:
1. Send message: "Show all clients"
2. Click Edit
3. Change text to something else
4. Click Cancel

**Expected**:
- ✓ Text reverts to original "Show all clients"
- ✓ No backend call made
- ✓ Edit mode closes
- ✓ No "(edited)" badge appears

---

### Scenario 9: Edit to Empty or Whitespace

**Setup**:
1. Send message: "Show clients"
2. Click Edit
3. Delete all text or enter only spaces
4. Try to Save

**Expected**:
- ✓ Backend rejects with `MESSAGE_REQUIRED` error
- ✓ UI shows error (or prevents save)
- ✓ Edit mode remains open
- ✓ Can correct and retry

**Verify**:
- Check browser console for error: `[Edit] Failed to edit message`
- No corrupt state

---

### Scenario 10: Session Persistence

**Setup**:
1. Send message: "Show clients"
2. Edit to "Show active clients"
3. Refresh browser
4. Return to same session

**Expected**:
- ✓ Last message shows edited version
- ✓ "(edited)" badge appears
- ✓ Agent response matches edited message
- ✓ Can edit again (still last message)

**Verify**:
- Session state correctly persists across refresh

---

## Backend Verification Checklist

### Database/Storage Checks

1. **Transcript Turn Structure**:
   ```javascript
   {
     turnId: "turn:conv:default:GLOBAL:123",
     userMessage: "Show active clients",
     previousVersion: "turn:conv:default:GLOBAL:122", // Points to original
     editedAt: "2026-02-10T12:34:56.789Z",
     supersededBy: null // This is the latest version
   }
   ```

2. **Original Turn Marked**:
   ```javascript
   {
     turnId: "turn:conv:default:GLOBAL:122",
     userMessage: "Show clients",
     supersededBy: "turn:conv:default:GLOBAL:123", // Points to edited version
     editedAt: null
   }
   ```

3. **Audit Trail**:
   - Both versions stored
   - Chain preserved: original → edited
   - No data loss

### API Endpoint Checks

1. **POST /api/agent/edit** returns:
   ```json
   {
     "status": "ok",
     "editedTurn": {
       "turnId": "turn:...:123",
       "message": "Show active clients",
       "editedAt": "2026-02-10T...",
       "previousVersion": "turn:...:122"
     },
     "originalTurn": {
       "turnId": "turn:...:122",
       "message": "Show clients"
     }
   }
   ```

2. **Error Cases**:
   - Empty message → `MESSAGE_REQUIRED` (400)
   - No session → `SESSION_REQUIRED` (400)
   - No message to edit → `NO_MESSAGE_TO_EDIT` (400)

---

## Frontend Verification Checklist

### UI/UX Checks

1. **Edit Button Visibility**:
   - ✓ Only on last user message
   - ✓ Only on hover (opacity-0 → opacity-100)
   - ✓ Disabled during streaming
   - ✓ Smooth transition

2. **Edit Mode**:
   - ✓ Textarea replaces message bubble
   - ✓ Current text pre-filled
   - ✓ Auto-focus on textarea
   - ✓ Save + Cancel buttons visible
   - ✓ Proper styling (matches design system)

3. **Edit Badge**:
   - ✓ "(edited)" appears after timestamp
   - ✓ Subtle color (not intrusive)
   - ✓ Persists across refresh

4. **Response Invalidation**:
   - ✓ Old agent message removed from UI
   - ✓ Loading state shown
   - ✓ New response replaces cleanly
   - ✓ No flicker or double-render

### State Management Checks

1. **Session Updates**:
   - ✓ `updateSessionMessages()` called correctly
   - ✓ Message marked as `edited: true`
   - ✓ Stale agent response removed

2. **Agent Stream Trigger**:
   - ✓ `startAgentStream()` called with edited message
   - ✓ Includes sessionId in options
   - ✓ Fresh intent classification (not reused)

---

## Performance Checks

1. **Edit Latency**:
   - Backend responds < 100ms
   - UI update feels instant
   - No noticeable delay

2. **Stream Trigger**:
   - Agent starts processing immediately after edit
   - No blocking or freezing

3. **Memory**:
   - Old agent responses properly garbage collected
   - No memory leaks after multiple edits

---

## Regression Checks

Test that existing functionality still works:

1. **New Messages** (non-edit):
   - ✓ Send new message normally
   - ✓ Agent responds correctly
   - ✓ No interference from edit feature

2. **Follow-ups**:
   - ✓ Click follow-up suggestion
   - ✓ Agent processes correctly
   - ✓ Follow-up message not editable (unless it's last)

3. **Slash Commands**:
   - ✓ `/clients`, `/dossiers` work
   - ✓ Can edit slash command message
   - ✓ Re-executes command on edit

4. **Copy/Retry** (agent messages):
   - ✓ Copy still works
   - ✓ Retry still works
   - ✓ No interference with edit

---

## Known Limitations / TODOs

1. **Proposal Cancellation**:
   - Backend has TODO for canceling proposals on edit
   - Current behavior: Proposal may remain orphaned
   - **Action**: Test and document, or implement cancellation

2. **Auth Context**:
   - Frontend uses `userId: 'default'` (hardcoded)
   - **Action**: Update when auth system is integrated

3. **Error Handling**:
   - Edit errors logged to console
   - No user-facing error messages yet
   - **Action**: Add toast/modal for edit failures

4. **Attachment Re-upload**:
   - Behavior undefined for messages with attachments
   - **Action**: Define and implement attachment handling

---

## Success Criteria

Feature is **ready for production** when:

✅ All 10 test scenarios pass
✅ Backend audit trail verified
✅ Frontend state correctly updated
✅ No regressions in existing features
✅ Performance acceptable (< 100ms edit latency)
✅ Error cases handled gracefully
✅ Known limitations documented

---

## Testing Instructions

### Manual Testing (Local Dev)

1. Start backend: `cd lawyer-app/backend && npm start`
2. Start frontend: `cd lawyer-app/frontend && npm run dev`
3. Open browser: `http://localhost:5173` (or configured port)
4. Follow each scenario above
5. Check browser console for logs
6. Check backend logs for audit trail

### Automated Testing (Future)

Consider adding:
- E2E tests with Playwright/Cypress
- Backend unit tests for transcript versioning
- Frontend component tests for edit UI

---

## Rollout Plan

1. **Stage 1**: Internal testing (dev team)
2. **Stage 2**: Beta users (selected lawyers)
3. **Stage 3**: Full production rollout
4. **Monitor**: Track edit usage, error rates, performance

---

**Last Updated**: 2026-02-10
**Status**: Ready for testing
**Assigned**: QA Team / Dev Team
