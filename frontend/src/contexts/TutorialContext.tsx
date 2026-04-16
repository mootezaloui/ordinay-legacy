/**
 * TutorialContext.tsx
 *
 * Lightweight tutorial engine for Ordinay's interactive guided tutorial.
 * Separate from onboarding - this handles the step-by-step overlay system.
 *
 * Features:
 * - Step-by-step tutorial mode
 * - Element targeting via data-tutorial attributes
 * - Persistence to localStorage
 * - Skip, resume, and restart functionality
 */

/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from "react";

// Storage key for tutorial state
const TUTORIAL_STORAGE_KEY = "ordinay_tutorial";

// Tutorial step definitions
export interface TutorialStep {
  id: string;
  target?: string; // data-tutorial attribute value
  route?: string; // Route to navigate to (if needed)
  allowInteraction?: boolean; // Allow clicking the target element
  requiresAction?: boolean; // Step requires user action to complete
  position?: "top" | "bottom" | "left" | "right" | "auto";
}

// Phase 1 steps - Learn Clients
export const PHASE1_STEPS: TutorialStep[] = [
  // Step 1: Dashboard quick intro
  {
    id: "dashboard-intro",
    target: "dashboard-stats",
    route: "/dashboard",
    position: "bottom",
  },
  // Step 2: Navigate to Clients via sidebar
  {
    id: "sidebar-clients",
    target: "sidebar-clients-link",
    route: "/dashboard",
    allowInteraction: true,
    requiresAction: true,
    position: "right",
  },
  // Step 3: Create first client
  {
    id: "create-client",
    target: "add-client-button",
    route: "/clients",
    allowInteraction: true,
    requiresAction: true,
    position: "bottom",
  },
  // Phase 1 Completion
  {
    id: "phase1-complete",
    position: "auto",
  },
];

// Phase 2 steps - Learn Dossiers (Client → Dossier Mental Model)
export const PHASE2_STEPS: TutorialStep[] = [
  // Step 2.1: Explain where we are (Client Detail View)
  {
    id: "client-detail-intro",
    target: "client-detail-header",
    position: "bottom",
  },
  // Step 2.2: Click on Dossiers tab
  {
    id: "client-dossiers-tab",
    target: "client-dossiers-tab",
    allowInteraction: true,
    requiresAction: true,
    position: "bottom",
  },
  // Step 2.3: Create dossier from client (Primary Path)
  {
    id: "create-dossier-from-client",
    target: "add-dossier-from-client-button",
    allowInteraction: true,
    requiresAction: true,
    position: "top",
  },
  // Step 2.4: Client notification explanation - spotlight the notification modal
  {
    id: "client-notification-intro",
    target: "client-notification-modal",
    allowInteraction: true,
    requiresAction: true,
    position: "left",
  },
  // Step 2.5: Navigate to Dossier Detail View (after notification handled)
  {
    id: "dossier-detail-overview",
    target: "dossier-detail-header",
    position: "bottom",
  },
  // Step 2.6: Teach the second path - navigate to global Dossiers
  {
    id: "sidebar-dossiers",
    target: "sidebar-dossiers-link",
    allowInteraction: true,
    requiresAction: true,
    position: "right",
  },
  // Step 2.7: Show existing dossier in list + alternative path
  {
    id: "dossiers-list-overview",
    target: "dossiers-list-container",
    position: "top",
  },
  // Phase 2 Completion
  {
    id: "phase2-complete",
    position: "auto",
  },
];

// Phase 3: Lawsuits — Legal Proceedings
export const PHASE3_STEPS: TutorialStep[] = [
  // Step 3.1: From dossiers list, select a dossier to open its detail view
  {
    id: "select-dossier-for-lawsuits",
    target: "dossiers-list-container",
    allowInteraction: true,
    requiresAction: true,
    position: "top",
  },
  // Step 3.2: Click on Cases/Procès tab
  {
    id: "dossier-lawsuits-tab",
    target: "dossier-lawsuits-tab",
    allowInteraction: true,
    requiresAction: true,
    position: "bottom",
  },
  // Step 3.3: Create a lawsuit from the dossier
  {
    id: "create-lawsuit-from-dossier",
    target: "add-lawsuit-from-dossier-button",
    allowInteraction: true,
    requiresAction: true,
    position: "top",
  },
  // Step 3.4: Client notification for lawsuit creation - spotlight the notification modal
  {
    id: "lawsuit-notification-intro",
    target: "client-notification-modal",
    allowInteraction: true,
    requiresAction: true,
    position: "left",
  },
  // Step 3.5: Lawsuit detail overview (after notification handled)
  {
    id: "lawsuit-detail-overview",
    target: "lawsuit-detail-header",
    position: "bottom",
  },
  // Phase 3 Completion
  {
    id: "phase3-complete",
    position: "auto",
  },
];

// Phase 4: Tasks — The Daily Workflow
export const PHASE4_STEPS: TutorialStep[] = [
  // Step 4.1: Navigate back to dossiers
  {
    id: "sidebar-dossiers-for-tasks",
    target: "sidebar-dossiers-link",
    allowInteraction: true,
    requiresAction: true,
    position: "right",
  },
  // Step 4.2: Select a dossier from the list to open its detail view
  {
    id: "select-dossier-for-tasks",
    target: "dossiers-list-container",
    allowInteraction: true,
    requiresAction: true,
    position: "top",
  },
  // Step 4.3: Navigate to dossier and click Tasks tab
  {
    id: "dossier-tasks-tab",
    target: "dossier-tasks-tab",
    allowInteraction: true,
    requiresAction: true,
    position: "bottom",
  },
  // Step 4.4: Create a task from the dossier
  {
    id: "create-task-from-dossier",
    target: "add-task-from-dossier-button",
    allowInteraction: true,
    requiresAction: true,
    position: "top",
  },
  // Step 4.5: Task detail overview (after creation)
  {
    id: "task-detail-overview",
    target: "task-detail-header",
    position: "bottom",
  },
  // Step 4.6: Explain task status workflow
  {
    id: "task-status-workflow",
    target: "task-status-selector",
    position: "bottom",
  },
  // Step 4.7: Show personal tasks in sidebar
  {
    id: "sidebar-personal-tasks",
    target: "sidebar-personal-tasks-link",
    allowInteraction: true,
    requiresAction: true,
    position: "right",
  },
  // Step 4.8: Personal tasks overview
  {
    id: "personal-tasks-overview",
    target: "personal-tasks-container",
    position: "top",
  },
  // Phase 4 Completion
  {
    id: "phase4-complete",
    position: "auto",
  },
];

// Phase 5: Sessions — Court Appearances & Hearings
export const PHASE5_STEPS: TutorialStep[] = [
  // Step 5.1: Navigate to Sessions in sidebar
  {
    id: "sidebar-sessions",
    target: "sidebar-sessions-link",
    allowInteraction: true,
    requiresAction: true,
    position: "right",
  },
  // Step 5.2: Sessions list overview
  {
    id: "sessions-list-overview",
    target: "sessions-list-container",
    position: "top",
  },
  // Step 5.3: Create a session
  {
    id: "create-session",
    target: "add-session-button",
    allowInteraction: true,
    requiresAction: true,
    position: "bottom",
  },
  // Step 5.4: Session detail overview
  {
    id: "session-detail-overview",
    target: "session-detail-header",
    position: "bottom",
  },
  // Phase 5 Completion
  {
    id: "phase5-complete",
    position: "auto",
  },
];

// Phase 6: Officers & Missions — The Execution Network
// Note: Missions require officers, so we teach officers first as a prerequisite
export const PHASE6_STEPS: TutorialStep[] = [
  // Step 6.1: Navigate to Officers in sidebar
  {
    id: "sidebar-officers",
    target: "sidebar-officers-link",
    allowInteraction: true,
    requiresAction: true,
    position: "right",
  },
  // Step 6.2: Officers list overview - explain what officers/huissiers are
  {
    id: "officers-list-overview",
    target: "officers-list-container",
    position: "top",
  },
  // Step 6.3: Explain the mission workflow (educational - no creation needed)
  {
    id: "missions-workflow-explained",
    target: "officers-list-container",
    position: "top",
  },
  // Phase 6 Completion
  {
    id: "phase6-complete",
    position: "auto",
  },
];

// Phase 7: Financial — The Complete Picture
export const PHASE7_STEPS: TutorialStep[] = [
  // Step 7.1: Navigate to Accounting
  {
    id: "sidebar-accounting",
    target: "sidebar-accounting-link",
    allowInteraction: true,
    requiresAction: true,
    position: "right",
  },
  // Step 7.2: Financial dashboard overview
  {
    id: "financial-overview",
    target: "financial-dashboard-container",
    position: "top",
  },
  // Step 7.3: Understanding financial entries
  {
    id: "financial-entries-explained",
    target: "financial-entries-section",
    position: "top",
  },
  // Phase 7 Completion
  {
    id: "phase7-complete",
    position: "auto",
  },
];

// Phase 8: Documents / Notes / History (Explain Only)
export const PHASE8_STEPS: TutorialStep[] = [
  // Step 8.1: Navigate back to dossiers to show document management features
  {
    id: "sidebar-dossiers-for-documents",
    target: "sidebar-dossiers-link",
    allowInteraction: true,
    requiresAction: true,
    position: "right",
  },
  // Step 8.2: Select a dossier to open its detail view
  {
    id: "select-dossier-for-documents",
    target: "dossiers-list-container",
    allowInteraction: true,
    requiresAction: true,
    position: "top",
  },
  // Step 8.3: Explain Documents tab in dossier detail (click to advance)
  {
    id: "dossier-documents-tab",
    target: "dossier-documents-tab",
    allowInteraction: true,
    requiresAction: true,
    position: "bottom",
  },
  // Step 8.4: Documents overview (after tab click)
  {
    id: "documents-overview",
    target: "dossier-documents-section",
    position: "top",
  },
  // Explain Notes tab in dossier detail (click to advance)
  {
    id: "dossier-notes-tab",
    target: "dossier-notes-tab",
    allowInteraction: true,
    requiresAction: true,
    position: "bottom",
  },
  // Notes overview (after tab click)
  {
    id: "notes-overview",
    target: "dossier-notes-section",
    position: "top",
  },
  // Explain History tab in dossier detail (click to advance)
  {
    id: "dossier-history-tab",
    target: "dossier-history-tab",
    allowInteraction: true,
    requiresAction: true,
    position: "bottom",
  },
  // History overview (after tab click)
  {
    id: "history-overview",
    target: "dossier-history-section",
    position: "top",
  },
  // Navigate back to dashboard to complete the tour
  {
    id: "return-to-dashboard",
    target: "sidebar-dashboard-link",
    allowInteraction: true,
    requiresAction: true,
    position: "right",
  },
  // Phase 8 Completion
  {
    id: "phase8-complete",
    position: "auto",
  },
];

// Phase 9: Tutorial Complete
export const PHASE9_STEPS: TutorialStep[] = [
  // Final celebration and summary
  {
    id: "tutorial-complete",
    position: "auto",
  },
];

// Combined tutorial steps
export const TUTORIAL_STEPS: TutorialStep[] = [
  ...PHASE1_STEPS,
  ...PHASE2_STEPS,
  ...PHASE3_STEPS,
  ...PHASE4_STEPS,
  ...PHASE5_STEPS,
  ...PHASE6_STEPS,
  ...PHASE7_STEPS,
  ...PHASE8_STEPS,
  ...PHASE9_STEPS,
];

interface TutorialState {
  isActive: boolean;
  isWaitingForAction: boolean; // Overlay hidden while waiting for user action (e.g., modal open)
  currentStepIndex: number;
  completedSteps: string[];
  skippedSteps: string[];
  hasCompletedTutorial: boolean;
  hasStartedTutorial: boolean;
}

interface TutorialContextValue extends TutorialState {
  // Current step info
  currentStep: TutorialStep | null;
  totalSteps: number;

  // Actions
  startTutorial: () => void;
  exitTutorial: () => void;
  nextStep: () => void;
  previousStep: () => void;
  skipCurrentStep: () => void;
  completeCurrentStep: () => void;
  restartTutorial: () => void;
  resumeTutorial: () => void;

  // For external triggers (e.g., client created)
  notifyActionComplete: (stepId: string) => void;

  // Compatibility alias for Clients.jsx
  setCreatedClient: (clientId: string) => void;

  // Compatibility alias for AggregatedRelatedTab (dossier creation)
  setCreatedDossier: (dossierId: number | string) => void;

  // Compatibility alias for AggregatedRelatedTab (lawsuit creation)
  setCreatedLawsuit: (lawsuitId: number | string) => void;

  // Compatibility alias for AggregatedRelatedTab (task creation)
  setCreatedTask: (taskId: number | string) => void;

  // Compatibility alias for Sessions (session creation)
  setCreatedSession: (sessionId: number | string) => void;

  // Compatibility alias for AggregatedRelatedTab (mission creation)
  setCreatedMission: (missionId: number | string) => void;

  // For hiding overlay while action is in progress
  setWaitingForAction: (waiting: boolean) => void;

  // Computed
  canGoBack: boolean;
  canGoForward: boolean;
  isLastStep: boolean;
  isFirstStep: boolean;
}

const defaultState: TutorialState = {
  isActive: false,
  isWaitingForAction: false,
  currentStepIndex: 0,
  completedSteps: [],
  skippedSteps: [],
  hasCompletedTutorial: false,
  hasStartedTutorial: false,
};

const TutorialContext = createContext<TutorialContextValue | null>(null);

export function useTutorial(): TutorialContextValue {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error("useTutorial must be used within TutorialProvider");
  }
  return context;
}

// Safe hook that doesn't throw if outside provider
export function useTutorialSafe(): TutorialContextValue | null {
  return useContext(TutorialContext);
}

interface TutorialProviderProps {
  children: ReactNode;
}

export function TutorialProvider({ children }: TutorialProviderProps) {
  // Initialize state from localStorage
  const [state, setState] = useState<TutorialState>(() => {
    if (typeof window === "undefined") return defaultState;

    try {
      const stored = window.localStorage.getItem(TUTORIAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...defaultState,
          ...parsed,
          // Never resume in active state on page load
          isActive: false,
        };
      }
    } catch (error) {
      console.warn("[Tutorial] Failed to load state:", error);
    }
    return defaultState;
  });

  // Persist state to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(
        TUTORIAL_STORAGE_KEY,
        JSON.stringify({
          currentStepIndex: state.currentStepIndex,
          completedSteps: state.completedSteps,
          skippedSteps: state.skippedSteps,
          hasCompletedTutorial: state.hasCompletedTutorial,
          hasStartedTutorial: state.hasStartedTutorial,
        }),
      );
    } catch (error) {
      console.warn("[Tutorial] Failed to persist state:", error);
    }
  }, [state]);

  // Start the tutorial
  const startTutorial = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isActive: true,
      currentStepIndex: 0,
      hasStartedTutorial: true,
    }));
  }, []);

  // Resume from where user left off
  const resumeTutorial = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isActive: true,
    }));
  }, []);

  // Exit tutorial (marks as completed so activation can proceed)
  const exitTutorial = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isActive: false,
      hasCompletedTutorial: true,
    }));
  }, []);

  // Restart from beginning
  const restartTutorial = useCallback(() => {
    setState({
      ...defaultState,
      isActive: true,
      hasStartedTutorial: true,
    });
  }, []);

  // Go to next step
  const nextStep = useCallback(() => {
    setState((prev) => {
      const nextIndex = prev.currentStepIndex + 1;

      // Check if tutorial is complete
      if (nextIndex >= TUTORIAL_STEPS.length) {
        return {
          ...prev,
          isActive: false,
          hasCompletedTutorial: true,
          currentStepIndex: TUTORIAL_STEPS.length - 1,
        };
      }

      return {
        ...prev,
        currentStepIndex: nextIndex,
      };
    });
  }, []);

  // Go to previous step
  const previousStep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStepIndex: Math.max(0, prev.currentStepIndex - 1),
    }));
  }, []);

  // Skip current step
  const skipCurrentStep = useCallback(() => {
    setState((prev) => {
      const currentStep = TUTORIAL_STEPS[prev.currentStepIndex];
      const nextIndex = prev.currentStepIndex + 1;

      // Check if tutorial is complete
      if (nextIndex >= TUTORIAL_STEPS.length) {
        return {
          ...prev,
          isActive: false,
          hasCompletedTutorial: true,
          skippedSteps: [...prev.skippedSteps, currentStep.id],
        };
      }

      return {
        ...prev,
        currentStepIndex: nextIndex,
        skippedSteps: [...prev.skippedSteps, currentStep.id],
      };
    });
  }, []);

  // Mark current step as complete
  const completeCurrentStep = useCallback(() => {
    setState((prev) => {
      const currentStep = TUTORIAL_STEPS[prev.currentStepIndex];
      return {
        ...prev,
        completedSteps: [...prev.completedSteps, currentStep.id],
      };
    });
  }, []);

  // Notify that an action was completed (for requiresAction steps)
  const notifyActionComplete = useCallback((stepId: string) => {
    setState((prev) => {
      // Ignore external triggers when tutorial is not active
      if (!prev.isActive) return prev;

      const currentStep = TUTORIAL_STEPS[prev.currentStepIndex];

      // Only process if we're on the matching step
      if (currentStep?.id !== stepId) return prev;

      const nextIndex = prev.currentStepIndex + 1;

      // Check if tutorial is complete
      if (nextIndex >= TUTORIAL_STEPS.length) {
        return {
          ...prev,
          isActive: false,
          isWaitingForAction: false,
          hasCompletedTutorial: true,
          completedSteps: [...prev.completedSteps, stepId],
        };
      }

      return {
        ...prev,
        isWaitingForAction: false,
        currentStepIndex: nextIndex,
        completedSteps: [...prev.completedSteps, stepId],
      };
    });
  }, []);

  // Compatibility function for Clients.jsx - triggers create-client step completion
  const setCreatedClient = useCallback(
    (clientId: string) => {
      notifyActionComplete("create-client");
    },
    [notifyActionComplete],
  );

  // Compatibility function for AggregatedRelatedTab - triggers create-dossier-from-client step completion
  const setCreatedDossier = useCallback(
    (dossierId: number | string) => {
      notifyActionComplete("create-dossier-from-client");
    },
    [notifyActionComplete],
  );

  // Compatibility function for AggregatedRelatedTab - triggers create-lawsuit-from-dossier step completion
  const setCreatedLawsuit = useCallback(
    (lawsuitId: number | string) => {
      notifyActionComplete("create-lawsuit-from-dossier");
    },
    [notifyActionComplete],
  );

  // Compatibility function for AggregatedRelatedTab - triggers create-task-from-dossier step completion
  const setCreatedTask = useCallback(
    (taskId: number | string) => {
      notifyActionComplete("create-task-from-dossier");
    },
    [notifyActionComplete],
  );

  // Compatibility function for Sessions - triggers create-session step completion
  const setCreatedSession = useCallback(
    (sessionId: number | string) => {
      notifyActionComplete("create-session");
    },
    [notifyActionComplete],
  );

  // Compatibility function for AggregatedRelatedTab - triggers create-mission-from-dossier step completion
  const setCreatedMission = useCallback(
    (missionId: number | string) => {
      notifyActionComplete("create-mission-from-dossier");
    },
    [notifyActionComplete],
  );

  // Set waiting state (hides overlay while user completes action)
  const setWaitingForAction = useCallback((waiting: boolean) => {
    setState((prev) => ({
      ...prev,
      isWaitingForAction: waiting,
    }));
  }, []);

  // Computed values
  const currentStep = TUTORIAL_STEPS[state.currentStepIndex] || null;
  const totalSteps = TUTORIAL_STEPS.length;
  const canGoBack = state.currentStepIndex > 0;
  const canGoForward = !currentStep?.requiresAction;
  const isFirstStep = state.currentStepIndex === 0;
  const isLastStep = state.currentStepIndex === TUTORIAL_STEPS.length - 1;

  const value = useMemo<TutorialContextValue>(
    () => ({
      ...state,
      currentStep,
      totalSteps,
      startTutorial,
      exitTutorial,
      nextStep,
      previousStep,
      skipCurrentStep,
      completeCurrentStep,
      restartTutorial,
      resumeTutorial,
      notifyActionComplete,
      setCreatedClient,
      setCreatedDossier,
      setCreatedLawsuit,
      setCreatedTask,
      setCreatedSession,
      setCreatedMission,
      setWaitingForAction,
      canGoBack,
      canGoForward,
      isFirstStep,
      isLastStep,
    }),
    [
      state,
      currentStep,
      totalSteps,
      startTutorial,
      exitTutorial,
      nextStep,
      previousStep,
      skipCurrentStep,
      completeCurrentStep,
      restartTutorial,
      resumeTutorial,
      notifyActionComplete,
      setCreatedClient,
      setCreatedDossier,
      setCreatedLawsuit,
      setCreatedTask,
      setCreatedSession,
      setCreatedMission,
      setWaitingForAction,
      canGoBack,
      canGoForward,
      isFirstStep,
      isLastStep,
    ],
  );

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
}

export default TutorialContext;
