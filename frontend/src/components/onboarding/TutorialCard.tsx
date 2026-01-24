/**
 * TutorialCard.tsx
 *
 * The main container for tutorial step content.
 * A floating glass card with navigation controls.
 * Professional, calm, and accessible design.
 */

import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import TutorialProgress from "./TutorialProgress";

interface TutorialCardProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  icon?: string;
  currentStep?: number;
  totalSteps?: number;
  showProgress?: boolean;
  showNavigation?: boolean;
  onNext?: () => void;
  isLastStep?: boolean;
  nextLabel?: string;
}

export default function TutorialCard({
  children,
  title,
  subtitle,
  icon,
  currentStep = 1,
  totalSteps = 6,
  showProgress = true,
  showNavigation = true,
  onNext,
  isLastStep = false,
  nextLabel,
}: TutorialCardProps) {
  const { t } = useTranslation("onboarding");

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden border border-slate-200/50 dark:border-slate-700/50">
      {/* Progress bar at top */}
      {showProgress && (
        <div className="px-6 pt-4">
          <TutorialProgress currentStep={currentStep} totalSteps={totalSteps} />
        </div>
      )}

      {/* Header */}
      {(title || subtitle) && (
        <div className="px-6 pt-6 pb-2">
          {icon && (
            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-4">
              <i
                className={`${icon} text-xl text-blue-600 dark:text-blue-400`}
              />
            </div>
          )}
          {title && (
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          )}
        </div>
      )}

      {/* Content */}
      <div className="px-6 py-4">{children}</div>

      {/* Navigation */}
      {showNavigation && (
        <div className="px-6 pb-6 pt-2 flex items-center justify-center">
          {/* Next or Finish */}
          {onNext && (
            <button
              onClick={onNext}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
            >
              {nextLabel ||
                (isLastStep ? t("navigation.finish") : t("navigation.next"))}
              {!isLastStep && <i className="fas fa-arrow-right text-xs" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
