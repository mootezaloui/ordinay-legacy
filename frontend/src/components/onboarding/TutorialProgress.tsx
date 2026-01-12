/**
 * TutorialProgress.tsx
 *
 * A progress indicator for the onboarding tutorial.
 * Shows current step and total steps visually.
 * Minimal, non-overwhelming design.
 */

import { useTranslation } from "react-i18next";

interface TutorialProgressProps {
  currentStep: number;
  totalSteps: number;
  percentage?: number;
  showLabel?: boolean;
}

export default function TutorialProgress({
  currentStep,
  totalSteps,
  percentage,
  showLabel = true,
}: TutorialProgressProps) {
  const { t } = useTranslation("onboarding");

  const progress = percentage ?? Math.round((currentStep / totalSteps) * 100);

  return (
    <div className="flex items-center gap-3 text-sm">
      {/* Progress bar */}
      <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 dark:bg-blue-400 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Step label */}
      {showLabel && (
        <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap min-w-[80px] text-right">
          {t("navigation.stepOf", { current: currentStep, total: totalSteps })}
        </span>
      )}
    </div>
  );
}
