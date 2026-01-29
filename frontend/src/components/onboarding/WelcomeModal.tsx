/**
 * WelcomeModal.tsx
 *
 * The first-launch welcome screen for Ordinay.
 * Calm, professional, and inviting.
 * Offers Start/Skip options with no pressure.
 */

import { useTranslation } from "react-i18next";
import TutorialOverlay from "./TutorialOverlay";

interface WelcomeModalProps {
  onStart: () => void;
  onSkip: () => void;
}

export default function WelcomeModal({ onStart, onSkip }: WelcomeModalProps) {
  const { t } = useTranslation("onboarding");

  return (
    <TutorialOverlay onClose={onSkip} showEscHint={false}>
      <div className="bg-white dark:bg-slate-800 rounded-none md:rounded-2xl shadow-2xl overflow-hidden border border-slate-200/50 dark:border-slate-700/50 h-full md:h-auto flex flex-col">
        {/* Hero section */}
        <div className="px-8 pt-10 pb-6 text-center flex-1">
          {/* Logo / Icon */}
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
            <i className="fas fa-balance-scale text-3xl text-white" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            {t("welcome.title")}
          </h1>

          {/* Subtitle */}
          <p className="text-lg text-blue-600 dark:text-blue-400 font-medium mb-4">
            {t("welcome.subtitle")}
          </p>

          {/* Description */}
          <p className="text-slate-600 dark:text-slate-300 max-w-md mx-auto leading-relaxed">
            {t("welcome.description")}
          </p>
        </div>

        {/* Actions */}
        <div className="px-8 pb-8 pt-2 space-y-3">
          {/* Primary CTA */}
          <button
            onClick={onStart}
            className="w-full py-3.5 px-6 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            <i className="fas fa-play text-sm" />
            {t("welcome.startButton")}
          </button>

          {/* Secondary CTA */}
          <button
            onClick={onSkip}
            className="w-full py-3 px-6 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 font-medium transition-colors flex items-center justify-center gap-2"
          >
            {t("welcome.skipButton")}
          </button>

          {/* Reassurance note */}
          <p className="text-center text-xs text-slate-400 dark:text-slate-500 pt-2">
            {t("welcome.skipNote")}
          </p>
        </div>
      </div>
    </TutorialOverlay>
  );
}
