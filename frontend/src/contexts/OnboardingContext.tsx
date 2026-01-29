/**
 * OnboardingContext.tsx
 *
 * Manages the onboarding tutorial state for Ordinay.
 * Handles first-launch detection, tutorial progress, and completion tracking.
 *
 * Features:
 * - First launch detection via localStorage
 * - Step-by-step progress tracking
 * - Skip, pause, and replay functionality
 * - Persistent state across sessions
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

// Storage key for onboarding state
const ONBOARDING_STORAGE_KEY = "ordinay_onboarding";

// Tutorial phases and their steps
export const TUTORIAL_PHASES = {
  WELCOME: "welcome",
  DASHBOARD: "dashboard",
  WORKFLOW: "workflow",
  FINANCIAL: "financial",
  PREFERENCES: "preferences",
  COMPLETION: "completion",
} as const;

export type TutorialPhase =
  (typeof TUTORIAL_PHASES)[keyof typeof TUTORIAL_PHASES];

// Steps within the workflow phase (the most important one)
export const WORKFLOW_STEPS = {
  CLIENTS: "clients",
  DOSSIERS: "dossiers",
  TASKS: "tasks",
  MISSIONS: "missions",
} as const;

export type WorkflowStep = (typeof WORKFLOW_STEPS)[keyof typeof WORKFLOW_STEPS];

// Order of phases for navigation
export const PHASE_ORDER: TutorialPhase[] = [
  TUTORIAL_PHASES.WELCOME,
  TUTORIAL_PHASES.DASHBOARD,
  TUTORIAL_PHASES.WORKFLOW,
  TUTORIAL_PHASES.FINANCIAL,
  TUTORIAL_PHASES.PREFERENCES,
  TUTORIAL_PHASES.COMPLETION,
];

interface OnboardingState {
  hasCompletedOnboarding: boolean;
  hasSkippedOnboarding: boolean;
  currentPhase: TutorialPhase;
  currentWorkflowStep: WorkflowStep;
  isActive: boolean;
  showWelcomeModal: boolean;
}

interface OnboardingContextValue extends OnboardingState {
  // Actions
  startTutorial: () => void;
  skipTutorial: () => void;
  nextStep: () => void;
  previousStep: () => void;
  goToPhase: (phase: TutorialPhase) => void;
  completeTutorial: () => void;
  replayTutorial: () => void;
  exitTutorial: () => void;
  dismissWelcomeModal: () => void;

  // Computed
  currentPhaseIndex: number;
  totalPhases: number;
  isFirstPhase: boolean;
  isLastPhase: boolean;
  progressPercentage: number;
}

const defaultState: OnboardingState = {
  hasCompletedOnboarding: false,
  hasSkippedOnboarding: false,
  currentPhase: TUTORIAL_PHASES.WELCOME,
  currentWorkflowStep: WORKFLOW_STEPS.CLIENTS,
  isActive: false,
  showWelcomeModal: false,
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function useOnboarding(): OnboardingContextValue {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return context;
}

interface OnboardingProviderProps {
  children: ReactNode;
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  // Initialize state from localStorage
  const [state, setState] = useState<OnboardingState>(() => {
    if (typeof window === "undefined") return defaultState;

    try {
      const stored = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...defaultState,
          hasCompletedOnboarding: parsed.hasCompletedOnboarding ?? false,
          hasSkippedOnboarding: parsed.hasSkippedOnboarding ?? false,
          // Always start fresh on reload, but check if we should show welcome
          showWelcomeModal:
            !parsed.hasCompletedOnboarding && !parsed.hasSkippedOnboarding,
        };
      }
      // First time ever - show welcome modal
      return {
        ...defaultState,
        showWelcomeModal: true,
      };
    } catch (error) {
      console.warn("[Onboarding] Failed to load state from storage:", error);
      return {
        ...defaultState,
        showWelcomeModal: true,
      };
    }
  });

  // Persist critical state to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(
        ONBOARDING_STORAGE_KEY,
        JSON.stringify({
          hasCompletedOnboarding: state.hasCompletedOnboarding,
          hasSkippedOnboarding: state.hasSkippedOnboarding,
        })
      );
    } catch (error) {
      console.warn("[Onboarding] Failed to persist state:", error);
    }
  }, [state.hasCompletedOnboarding, state.hasSkippedOnboarding]);

  // Start the tutorial
  const startTutorial = useCallback(() => {
    setState((prev) => ({
      ...prev,
      showWelcomeModal: false,
      isActive: true,
      currentPhase: TUTORIAL_PHASES.DASHBOARD,
      currentWorkflowStep: WORKFLOW_STEPS.CLIENTS,
    }));
  }, []);

  // Skip the tutorial (won't show again automatically)
  const skipTutorial = useCallback(() => {
    setState((prev) => ({
      ...prev,
      showWelcomeModal: false,
      isActive: false,
      hasSkippedOnboarding: true,
    }));
  }, []);

  // Dismiss welcome modal (same as skip for now)
  const dismissWelcomeModal = useCallback(() => {
    setState((prev) => ({
      ...prev,
      showWelcomeModal: false,
    }));
  }, []);

  // Navigate to next step
  const nextStep = useCallback(() => {
    setState((prev) => {
      // Handle workflow sub-steps
      if (prev.currentPhase === TUTORIAL_PHASES.WORKFLOW) {
        const workflowOrder = Object.values(WORKFLOW_STEPS);
        const currentIndex = workflowOrder.indexOf(prev.currentWorkflowStep);

        if (currentIndex < workflowOrder.length - 1) {
          return {
            ...prev,
            currentWorkflowStep: workflowOrder[currentIndex + 1],
          };
        }
      }

      // Move to next phase
      const currentIndex = PHASE_ORDER.indexOf(prev.currentPhase);
      if (currentIndex < PHASE_ORDER.length - 1) {
        const nextPhase = PHASE_ORDER[currentIndex + 1];
        return {
          ...prev,
          currentPhase: nextPhase,
          currentWorkflowStep: WORKFLOW_STEPS.CLIENTS, // Reset workflow step
        };
      }

      return prev;
    });
  }, []);

  // Navigate to previous step
  const previousStep = useCallback(() => {
    setState((prev) => {
      // Handle workflow sub-steps
      if (prev.currentPhase === TUTORIAL_PHASES.WORKFLOW) {
        const workflowOrder = Object.values(WORKFLOW_STEPS);
        const currentIndex = workflowOrder.indexOf(prev.currentWorkflowStep);

        if (currentIndex > 0) {
          return {
            ...prev,
            currentWorkflowStep: workflowOrder[currentIndex - 1],
          };
        }
      }

      // Move to previous phase
      const currentIndex = PHASE_ORDER.indexOf(prev.currentPhase);
      if (currentIndex > 0) {
        const prevPhase = PHASE_ORDER[currentIndex - 1];
        // If going back to workflow, go to last workflow step
        if (prevPhase === TUTORIAL_PHASES.WORKFLOW) {
          return {
            ...prev,
            currentPhase: prevPhase,
            currentWorkflowStep: WORKFLOW_STEPS.MISSIONS,
          };
        }
        return {
          ...prev,
          currentPhase: prevPhase,
        };
      }

      return prev;
    });
  }, []);

  // Jump to specific phase
  const goToPhase = useCallback((phase: TutorialPhase) => {
    setState((prev) => ({
      ...prev,
      currentPhase: phase,
      currentWorkflowStep: WORKFLOW_STEPS.CLIENTS,
    }));
  }, []);

  // Complete the tutorial
  const completeTutorial = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isActive: false,
      hasCompletedOnboarding: true,
      hasSkippedOnboarding: false,
    }));
  }, []);

  // Replay the tutorial (from Settings)
  const replayTutorial = useCallback(() => {
    setState((prev) => ({
      ...prev,
      showWelcomeModal: true,
      isActive: false,
      currentPhase: TUTORIAL_PHASES.WELCOME,
      currentWorkflowStep: WORKFLOW_STEPS.CLIENTS,
    }));
  }, []);

  // Exit tutorial mid-way
  const exitTutorial = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isActive: false,
      hasSkippedOnboarding: true,
    }));
  }, []);

  // Computed values
  const currentPhaseIndex = PHASE_ORDER.indexOf(state.currentPhase);
  const totalPhases = PHASE_ORDER.length;
  const isFirstPhase =
    currentPhaseIndex === 0 ||
    (state.currentPhase === TUTORIAL_PHASES.WORKFLOW &&
      state.currentWorkflowStep === WORKFLOW_STEPS.CLIENTS &&
      currentPhaseIndex === PHASE_ORDER.indexOf(TUTORIAL_PHASES.WORKFLOW));
  const isLastPhase = state.currentPhase === TUTORIAL_PHASES.COMPLETION;

  // Calculate progress including workflow sub-steps
  const progressPercentage = useMemo(() => {
    const workflowStepCount = Object.keys(WORKFLOW_STEPS).length;
    const baseSteps = PHASE_ORDER.length - 1 + workflowStepCount - 1; // Total steps minus overlaps

    let completedSteps = 0;

    // Add completed phases before workflow
    const workflowIndex = PHASE_ORDER.indexOf(TUTORIAL_PHASES.WORKFLOW);
    if (currentPhaseIndex < workflowIndex) {
      completedSteps = currentPhaseIndex;
    } else if (currentPhaseIndex === workflowIndex) {
      completedSteps = workflowIndex;
      // Add workflow sub-step progress
      const workflowOrder = Object.values(WORKFLOW_STEPS);
      completedSteps += workflowOrder.indexOf(state.currentWorkflowStep);
    } else {
      // Past workflow
      completedSteps = workflowIndex + workflowStepCount;
      completedSteps += currentPhaseIndex - workflowIndex - 1;
    }

    return Math.round((completedSteps / baseSteps) * 100);
  }, [currentPhaseIndex, state.currentWorkflowStep]);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      ...state,
      startTutorial,
      skipTutorial,
      nextStep,
      previousStep,
      goToPhase,
      completeTutorial,
      replayTutorial,
      exitTutorial,
      dismissWelcomeModal,
      currentPhaseIndex,
      totalPhases,
      isFirstPhase,
      isLastPhase,
      progressPercentage,
    }),
    [
      state,
      startTutorial,
      skipTutorial,
      nextStep,
      previousStep,
      goToPhase,
      completeTutorial,
      replayTutorial,
      exitTutorial,
      dismissWelcomeModal,
      currentPhaseIndex,
      totalPhases,
      isFirstPhase,
      isLastPhase,
      progressPercentage,
    ]
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export default OnboardingContext;
