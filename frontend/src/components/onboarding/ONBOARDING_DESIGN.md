# Onboarding Tutorial System — Design Document

## Overview

The Ordinay onboarding system provides a guided, interactive tutorial that introduces new users to the application's core workflow and mental model. It is designed to be:

- **Non-intrusive**: Can be skipped, paused, or replayed
- **Human-centered**: Uses conversational language, not documentation tone
- **Progressive**: Teaches concepts step-by-step, not all at once
- **Internationalized**: Supports English, French, and Arabic (RTL)

---

## Architecture

### Files & Components

```
src/
├── contexts/
│   └── OnboardingContext.tsx      # State management, localStorage persistence
├── components/onboarding/
│   ├── index.ts                   # Barrel exports
│   ├── OnboardingTutorial.tsx     # Main orchestrator component
│   ├── WelcomeModal.tsx           # First-launch welcome screen
│   ├── TutorialOverlay.tsx        # Backdrop overlay with blur
│   ├── TutorialCard.tsx           # Content card with navigation
│   ├── TutorialProgress.tsx       # Step indicator
│   ├── TutorialPhases.tsx         # Phase content components
│   └── WorkflowDiagram.tsx        # Visual workflow representation
├── i18n/locales/
│   ├── en/onboarding.json         # English translations
│   ├── fr/onboarding.json         # French translations
│   └── ar/onboarding.json         # Arabic translations
```

### State Management

The `OnboardingContext` manages:

| State | Description |
|-------|-------------|
| `hasCompletedOnboarding` | User finished the tutorial |
| `hasSkippedOnboarding` | User chose to skip |
| `currentPhase` | Current tutorial phase |
| `currentWorkflowStep` | Sub-step within workflow phase |
| `isActive` | Tutorial is currently running |
| `showWelcomeModal` | Show the first-launch modal |

State is persisted to `localStorage` under the key `ordinay_onboarding`.

---

## Tutorial Flow

### Phase 1: Welcome (Modal)
- Triggered on first launch
- Offers "Start" or "Skip for now"
- Reassures that tutorial can be replayed later

### Phase 2: Dashboard Understanding
- Explains the control center concept
- Highlights stats, upcoming events, quick actions
- Key message: "Ordinay surfaces what matters"

### Phase 3: Core Workflow (4 sub-steps)
1. **Clients** — The foundation of everything
2. **Dossiers** — Legal matters attached to clients
3. **Tasks** — Actions to track and complete
4. **Missions** — Scheduled events (hearings, meetings)

Visual diagram shows: `Clients → Dossiers → Tasks/Missions`

### Phase 4: Financial Basics
- Explains fees vs expenses
- Emphasizes user control (no automation)
- Reassures: "Nothing is sent automatically"

### Phase 5: Preferences
- Language selection
- Theme (light/dark/system)
- Notifications toggle
- All optional, can be changed later

### Phase 6: Completion
- Celebratory confirmation
- Quick reminders checklist
- "Replay from Settings" reminder

---

## i18n Keys Structure

```json
{
  "welcome": { "title", "subtitle", "description", "startButton", "skipButton", "skipNote" },
  "navigation": { "next", "back", "skip", "finish", "stepOf" },
  "phases": {
    "dashboard": { "title", "description", "highlights", "tip" },
    "workflow": { "title", "intro", "clients", "dossiers", "tasks", "missions", "summary" },
    "financial": { "title", "description", "points", "reassurance", "tip" },
    "preferences": { "title", "description", "language", "theme", "notifications", "skipNote" },
    "completion": { "title", "description", "encouragement", "tips", "replay", "button" }
  },
  "settings": { "section", "replayTitle", "replayDescription", "replayButton", "completed", "skipped" },
  "tooltips": { "pressEsc" }
}
```

---

## Usage

### Automatic First Launch

The tutorial automatically shows the welcome modal on first launch. No manual triggering needed.

### Replay from Settings

Users can replay the tutorial from `Settings → Tutorial → Replay tutorial`.

### Programmatic Control

```tsx
import { useOnboarding } from '../contexts/OnboardingContext';

function MyComponent() {
  const { 
    replayTutorial,      // Show welcome modal again
    startTutorial,       // Skip welcome, go straight to tutorial
    hasCompletedOnboarding,
    hasSkippedOnboarding,
  } = useOnboarding();
  
  // ...
}
```

---

## Extensibility

### Adding New Phases

1. Add phase constant to `TUTORIAL_PHASES` in `OnboardingContext.tsx`
2. Add phase to `PHASE_ORDER` array
3. Create phase component in `TutorialPhases.tsx`
4. Add rendering lawsuit in `OnboardingTutorial.tsx`
5. Add translations to all locale files

### Adding New Languages

1. Create `src/i18n/locales/{lang}/onboarding.json`
2. Add import to `src/i18n/loaders.ts`
3. Test RTL if applicable

### Feature-Specific Tips (Future)

The system is designed to support contextual tips:

```tsx
// Future API concept
const { showTip } = useOnboarding();

showTip({
  target: '#some-element',
  message: t('tips.firstDossier'),
  position: 'bottom',
});
```

---

## Design Principles

1. **Teach the mental model, not the UI**
   - Focus on "how Ordinay thinks" not "click here"
   
2. **Reduce anxiety**
   - Every screen reassures: safe, reversible, controlled
   
3. **Respect user agency**
   - Always skippable, never locked, replay available
   
4. **Short, human language**
   - No jargon, no documentation tone
   - Sentences < 20 words when possible

5. **Visual hierarchy**
   - One concept per step
   - Clear progress indication
   - Calm, professional design

---

## Acceptance Criteria

✅ New user understands workflow in < 10 minutes  
✅ User knows where to start (clients)  
✅ User knows the hierarchy (clients → dossiers → tasks)  
✅ User knows nothing will break (safe to explore)  
✅ No external documentation needed  
✅ Tutorial feels calm and professional  
✅ Works in EN, FR, AR (including RTL)  
✅ Can skip at any point  
✅ Can replay from Settings  

---

## Changelog

### v1.0.0 (Initial Implementation)
- Welcome modal with start/skip options
- 6-phase tutorial flow
- Workflow diagram visualization
- Settings integration for replay
- Full i18n support (EN/FR/AR)
- localStorage persistence
