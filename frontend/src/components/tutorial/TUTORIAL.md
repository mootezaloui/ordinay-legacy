# Interactive Tutorial System

This document describes the interactive guided tutorial feature in Ordinay.

## Overview

The tutorial system provides an overlay-based, step-by-step guided experience that:
- Highlights specific UI elements with a spotlight effect
- Dims the rest of the app
- Shows contextual tooltips
- Guides users through real actions (learning-by-doing)
- Persists progress to localStorage

## Architecture

### Files

| File | Purpose |
|------|---------|
| `TutorialContext.tsx` | State management, step definitions, persistence |
| `TutorialOverlay.tsx` | Spotlight overlay, tooltip rendering, click blocking |
| `i18n/locales/*/tutorial.json` | Translations for all tutorial text |

### Key Concepts

1. **Steps**: Defined in `TUTORIAL_STEPS` array in `TutorialContext.tsx`
2. **Targeting**: Elements are targeted via `data-tutorial="element-id"` attributes
3. **Persistence**: State is saved to `localStorage` under key `ordinay_tutorial`

## How to Add New Steps

### 1. Define the Step

Add to `TUTORIAL_STEPS` in `TutorialContext.tsx`:

```typescript
{
  id: "my-new-step",
  target: "my-element",      // data-tutorial attribute value
  route: "/my-page",         // Route to navigate to (optional)
  allowInteraction: false,   // Allow clicking the target element
  requiresAction: false,     // Step requires user action to complete
  position: "bottom",        // Tooltip position: top | bottom | left | right | auto
}
```

### 2. Add the Target Attribute

In your component JSX:

```jsx
<button data-tutorial="my-element">
  Click me
</button>
```

### 3. Add Translations

In each locale's `tutorial.json`:

```json
{
  "steps": {
    "my-new-step": {
      "title": "Step Title",
      "description": "What this step teaches.",
      "action": "What the user should do (optional)"
    }
  }
}
```

## Step Types

### Information Step
Just shows information, user clicks "Next" to continue.

```typescript
{
  id: "info-step",
  target: "some-element",
  position: "bottom",
}
```

### Action-Required Step
User must perform an action to advance.

```typescript
{
  id: "action-step",
  target: "button-to-click",
  allowInteraction: true,
  requiresAction: true,
  position: "bottom",
}
```

To advance the step when the action is completed, call:

```typescript
const tutorial = useTutorialSafe();
tutorial?.notifyActionComplete("action-step");
```

## API Reference

### useTutorial()

Throws error if used outside provider. Use for required access.

### useTutorialSafe()

Returns `null` if outside provider. Use for optional access.

### Context Methods

| Method | Description |
|--------|-------------|
| `startTutorial()` | Begin tutorial from step 0 |
| `exitTutorial()` | Pause tutorial (can resume) |
| `resumeTutorial()` | Resume from current step |
| `restartTutorial()` | Start over from beginning |
| `nextStep()` | Advance to next step |
| `previousStep()` | Go back one step |
| `skipCurrentStep()` | Skip current step, move to next |
| `notifyActionComplete(stepId)` | External trigger for action-required steps |
| `setCreatedClient(clientId)` | Alias for notifying create-client step completion |

### Context State

| Property | Type | Description |
|----------|------|-------------|
| `isActive` | boolean | Tutorial is currently showing |
| `currentStepIndex` | number | Index of current step |
| `currentStep` | TutorialStep | Current step object |
| `totalSteps` | number | Total number of steps |
| `hasStartedTutorial` | boolean | User has started tutorial at least once |
| `hasCompletedTutorial` | boolean | User completed all steps |
| `completedSteps` | string[] | IDs of completed steps |
| `skippedSteps` | string[] | IDs of skipped steps |
| `canGoBack` | boolean | Can go to previous step |
| `canGoForward` | boolean | Can go to next step |
| `isFirstStep` | boolean | Currently on first step |
| `isLastStep` | boolean | Currently on last step |

## Styling

The overlay uses:
- SVG mask for spotlight cutout effect
- Tailwind CSS for tooltip styling
- Dark mode compatible
- RTL-aware (Arabic support)

## Keyboard Navigation

| Key | Action |
|-----|--------|
| `Escape` | Exit tutorial |
| `→` or `Enter` | Next step (if allowed) |
| `←` | Previous step |

## Integration Points

### main.tsx
- `TutorialProvider` wraps the app
- `TutorialOverlay` renders the spotlight

### Settings.jsx
- Shows tutorial status
- Start/resume/restart buttons

### Clients.jsx
- Calls `setCreatedClient()` on client creation
- Has `data-tutorial="add-client-button"` on Add Client button

### Dashboard.jsx
- Has `data-tutorial="dashboard-stats"` on stats grid
- Has `data-tutorial="dashboard-urgent-tasks"` on urgent tasks section
- Has `data-tutorial="dashboard-upcoming-events"` on upcoming events section

### TutorialPhases.tsx (Onboarding)
- CompletionPhase offers "Start Guided Tutorial" button
- Links to interactive tutorial from onboarding flow

## Future Phases

Phase 2+ steps (not yet implemented):
- Create first dossier
- Add a task to dossier
- Financial tracking overview
- Document upload

## localStorage Structure

Key: `ordinay_tutorial`

```json
{
  "currentStepIndex": 0,
  "completedSteps": ["dashboard-intro"],
  "skippedSteps": [],
  "hasCompletedTutorial": false,
  "hasStartedTutorial": true
}
```

## Troubleshooting

### Element not found
- Check that `data-tutorial` attribute exactly matches step target
- Verify the element is rendered when the step is active
- Check the route is correct for the step

### Tooltip in wrong position
- Adjust `position` property on the step
- Overlay auto-adjusts to keep tooltip on screen

### Step not advancing
- For action-required steps, ensure `notifyActionComplete()` is called
- Check step ID matches in the notification call
