/**
 * OnboardingTutorial.tsx
 *
 * The main orchestrator component for the onboarding tutorial.
 * Manages the flow between phases and renders the appropriate content.
 *
 * This component is the entry point for the entire onboarding experience.
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  useOnboarding,
  TUTORIAL_PHASES,
  PHASE_ORDER,
  WORKFLOW_STEPS,
} from "../../contexts/OnboardingContext";
import { useSettings } from "../../contexts/SettingsContext";
import { useTheme } from "../../contexts/ThemeProvider";
import { LANGUAGE_REGISTRY } from "../../i18n/config";
import TutorialOverlay from "./TutorialOverlay";
import TutorialCard from "./TutorialCard";
import WelcomeModal from "./WelcomeModal";
import {
  DashboardPhase,
  WorkflowPhase,
  FinancialPhase,
  PreferencesPhase,
  CompletionPhase,
} from "./TutorialPhases";

/**
 * OnboardingTutorial
 *
 * Renders the appropriate tutorial content based on current state.
 * Handles both the welcome modal and the step-by-step tutorial.
 */
export default function OnboardingTutorial() {
  const {
    showWelcomeModal,
    isActive,
    currentPhase,
    currentWorkflowStep,
    startTutorial,
    skipTutorial,
    nextStep,
    exitTutorial,
    completeTutorial,
  } = useOnboarding();

  const { settings, updateSettings } = useSettings();
  const { setThemePreference } = useTheme();
  const { t } = useTranslation("onboarding");

  // Calculate current step number for display
  const getCurrentStepNumber = useCallback(() => {
    const workflowIndex = PHASE_ORDER.indexOf(TUTORIAL_PHASES.WORKFLOW);
    const currentIndex = PHASE_ORDER.indexOf(currentPhase);
    const workflowStepCount = Object.keys(WORKFLOW_STEPS).length;

    if (currentIndex < workflowIndex) {
      return currentIndex + 1;
    } else if (currentIndex === workflowIndex) {
      const workflowOrder = Object.values(WORKFLOW_STEPS);
      return workflowIndex + 1 + workflowOrder.indexOf(currentWorkflowStep);
    } else {
      return workflowIndex + workflowStepCount + (currentIndex - workflowIndex);
    }
  }, [currentPhase, currentWorkflowStep]);

  // Total steps for display (phases + workflow sub-steps - 1 for overlap)
  const totalDisplaySteps =
    PHASE_ORDER.length - 1 + Object.keys(WORKFLOW_STEPS).length;

  // Handle preference changes
  const handleLanguageChange = useCallback(
    (lang: string) => {
      updateSettings({ language: lang });
    },
    [updateSettings]
  );

  const handleThemeChange = useCallback(
    (theme: string) => {
      updateSettings({ theme });
      setThemePreference(theme);
    },
    [updateSettings, setThemePreference]
  );

  const handleNotificationsChange = useCallback(
    (enabled: boolean) => {
      updateSettings({ desktopNotifications: enabled });
    },
    [updateSettings]
  );

  // Handle next step with completion check
  const handleNext = useCallback(() => {
    if (currentPhase === TUTORIAL_PHASES.COMPLETION) {
      completeTutorial();
    } else {
      nextStep();
    }
  }, [currentPhase, completeTutorial, nextStep]);

  // Render welcome modal
  if (showWelcomeModal) {
    return <WelcomeModal onStart={startTutorial} onSkip={skipTutorial} />;
  }

  // Don't render if tutorial is not active
  if (!isActive) {
    return null;
  }

  // Get phase title and icon
  const getPhaseInfo = () => {
    switch (currentPhase) {
      case TUTORIAL_PHASES.DASHBOARD:
        return { title: t("phases.dashboard.title"), icon: "fas fa-th-large" };
      case TUTORIAL_PHASES.WORKFLOW:
        return {
          title: t("phases.workflow.title"),
          icon: "fas fa-project-diagram",
          subtitle: t("phases.workflow.subtitle"),
        };
      case TUTORIAL_PHASES.FINANCIAL:
        return { title: t("phases.financial.title"), icon: "fas fa-coins" };
      case TUTORIAL_PHASES.PREFERENCES:
        return {
          title: t("phases.preferences.title"),
          icon: "fas fa-sliders-h",
        };
      case TUTORIAL_PHASES.COMPLETION:
        return { title: "", icon: "" }; // Completion has its own header
      default:
        return { title: "", icon: "" };
    }
  };

  const phaseInfo = getPhaseInfo();
  const isLastStep = currentPhase === TUTORIAL_PHASES.COMPLETION;

  return (
    <TutorialOverlay onClose={exitTutorial}>
      <TutorialCard
        title={phaseInfo.title}
        subtitle={phaseInfo.subtitle}
        icon={phaseInfo.icon}
        currentStep={getCurrentStepNumber()}
        totalSteps={totalDisplaySteps}
        showProgress={!isLastStep}
        showNavigation={true}
        onNext={handleNext}
        isLastStep={isLastStep}
        nextLabel={isLastStep ? t("phases.completion.button") : undefined}
      >
        {/* Render phase content */}
        {currentPhase === TUTORIAL_PHASES.DASHBOARD && <DashboardPhase />}

        {currentPhase === TUTORIAL_PHASES.WORKFLOW && (
          <WorkflowPhase currentStep={currentWorkflowStep} />
        )}

        {currentPhase === TUTORIAL_PHASES.FINANCIAL && <FinancialPhase />}

        {currentPhase === TUTORIAL_PHASES.PREFERENCES && (
          <PreferencesPhase
            language={settings.language}
            theme={settings.theme}
            notifications={settings.desktopNotifications}
            onLanguageChange={handleLanguageChange}
            onThemeChange={handleThemeChange}
            onNotificationsChange={handleNotificationsChange}
            languageOptions={LANGUAGE_REGISTRY.map((l) => ({
              code: l.code,
              label: l.label,
            }))}
          />
        )}

        {currentPhase === TUTORIAL_PHASES.COMPLETION && <CompletionPhase />}
      </TutorialCard>
    </TutorialOverlay>
  );
}
