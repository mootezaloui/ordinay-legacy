/**
 * TutorialPhases.tsx
 *
 * Individual phase content components for the onboarding tutorial.
 * Each phase teaches a specific concept with human language.
 */

import { useTranslation } from "react-i18next";
import {
  WORKFLOW_STEPS,
  type WorkflowStep,
  useOnboarding,
} from "../../contexts/OnboardingContext";
import { useTutorial } from "../../contexts/TutorialContext";
import { useTheme } from "../../contexts/ThemeProvider";
import WorkflowDiagram from "./WorkflowDiagram";

// ===== PHASE: Dashboard Understanding =====
export function DashboardPhase() {
  const { t } = useTranslation("onboarding");

  return (
    <div className="space-y-4">
      <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
        {t("phases.dashboard.description")}
      </p>

      {/* Highlights */}
      <div className="space-y-3 mt-4">
        <HighlightItem
          icon="fas fa-chart-bar"
          color="blue"
          text={t("phases.dashboard.highlights.stats")}
        />
        <HighlightItem
          icon="fas fa-calendar-alt"
          color="purple"
          text={t("phases.dashboard.highlights.upcoming")}
        />
        <HighlightItem
          icon="fas fa-bolt"
          color="amber"
          text={t("phases.dashboard.highlights.quick")}
        />
      </div>

      {/* Tip */}
      <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/30">
        <p className="text-sm text-blue-700 dark:text-blue-300 flex items-start gap-2">
          <i className="fas fa-lightbulb mt-0.5" />
          {t("phases.dashboard.tip")}
        </p>
      </div>
    </div>
  );
}

// ===== PHASE: Workflow (with sub-steps) =====
interface WorkflowPhaseProps {
  currentStep: WorkflowStep;
}

export function WorkflowPhase({ currentStep }: WorkflowPhaseProps) {
  const { t } = useTranslation("onboarding");
  const { isDark } = useTheme();

  const stepContent: Record<
    WorkflowStep,
    { key: string; icon: string; color: string }
  > = {
    [WORKFLOW_STEPS.CLIENTS]: {
      key: "clients",
      icon: "fas fa-users",
      color: "blue",
    },
    [WORKFLOW_STEPS.DOSSIERS]: {
      key: "dossiers",
      icon: "fas fa-folder-open",
      color: "purple",
    },
    [WORKFLOW_STEPS.TASKS]: {
      key: "tasks",
      icon: "fas fa-tasks",
      color: "green",
    },
    [WORKFLOW_STEPS.MISSIONS]: {
      key: "missions",
      icon: "fas fa-calendar-check",
      color: "orange",
    },
  };

  const content = stepContent[currentStep];

  return (
    <div className="space-y-4">
      {/* Intro text (only on first step) */}
      {currentStep === WORKFLOW_STEPS.CLIENTS && (
        <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
          {t("phases.workflow.intro")}
        </p>
      )}

      {/* Workflow diagram */}
      <WorkflowDiagram
        highlightStep={
          content.key as "clients" | "dossiers" | "tasks" | "missions"
        }
      />

      {/* Step content */}
      <div
        className={`p-4 rounded-xl bg-${content.color}-50 dark:bg-${content.color}-900/20 border border-${content.color}-100 dark:border-${content.color}-800/30`}
        style={{
          backgroundColor: getColorBg(content.color, isDark),
          borderColor: getColorBorder(content.color, isDark),
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: getColorIcon(content.color) }}
          >
            <i className={`${content.icon} text-white`} />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
              {t(`phases.workflow.${content.key}.title`)}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">
              {t(`phases.workflow.${content.key}.description`)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t(`phases.workflow.${content.key}.detail`)}
            </p>
          </div>
        </div>
      </div>

      {/* Summary (only on last step) */}
      {currentStep === WORKFLOW_STEPS.MISSIONS && (
        <div className="mt-4 p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg">
          <p className="text-sm text-slate-700 dark:text-slate-300 font-medium text-center">
            {t("phases.workflow.summary")}
          </p>
        </div>
      )}
    </div>
  );
}

// ===== PHASE: Financial Basics =====
export function FinancialPhase() {
  const { t } = useTranslation("onboarding");

  return (
    <div className="space-y-4">
      <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
        {t("phases.financial.description")}
      </p>

      {/* Key points */}
      <div className="space-y-3 mt-4">
        <HighlightItem
          icon="fas fa-file-invoice-dollar"
          color="green"
          text={t("phases.financial.points.fees")}
        />
        <HighlightItem
          icon="fas fa-receipt"
          color="red"
          text={t("phases.financial.points.expenses")}
        />
        <HighlightItem
          icon="fas fa-chart-pie"
          color="blue"
          text={t("phases.financial.points.tracking")}
        />
      </div>

      {/* Reassurance */}
      <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-800/30">
        <p className="text-sm text-green-700 dark:text-green-300 flex items-start gap-2">
          <i className="fas fa-shield-alt mt-0.5" />
          {t("phases.financial.reassurance")}
        </p>
      </div>

      {/* Tip */}
      <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-2">
        {t("phases.financial.tip")}
      </p>
    </div>
  );
}

// ===== PHASE: Preferences =====
interface PreferencesPhaseProps {
  language: string;
  theme: string;
  notifications: boolean;
  onLanguageChange: (lang: string) => void;
  onThemeChange: (theme: string) => void;
  onNotificationsChange: (enabled: boolean) => void;
  languageOptions: Array<{ code: string; label: string }>;
}

export function PreferencesPhase({
  language,
  theme,
  notifications,
  onLanguageChange,
  onThemeChange,
  onNotificationsChange,
  languageOptions,
}: PreferencesPhaseProps) {
  const { t } = useTranslation("onboarding");

  return (
    <div className="space-y-5">
      <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
        {t("phases.preferences.description")}
      </p>

      {/* Language */}
      <div className="space-y-2">
        <label
          htmlFor="onboarding-language-select"
          className="text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          {t("phases.preferences.language.title")}
        </label>
        <select
          id="onboarding-language-select"
          value={language}
          onChange={(e) => onLanguageChange(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {languageOptions.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Theme */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {t("phases.preferences.theme.title")}
        </label>
        <div className="flex gap-2">
          {["light", "dark", "system"].map((themeOption) => (
            <button
              key={themeOption}
              onClick={() => onThemeChange(themeOption)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                theme === themeOption
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600"
              }`}
            >
              {t(`phases.preferences.theme.${themeOption}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Notifications */}
      <div className="flex items-center justify-between py-2">
        <div>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {t("phases.preferences.notifications.title")}
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("phases.preferences.notifications.description")}
          </p>
        </div>
        <button
          onClick={() => onNotificationsChange(!notifications)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            notifications ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"
          }`}
          role="switch"
          aria-checked={notifications}
          aria-label={t("phases.preferences.notifications.enable")}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              notifications ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      {/* Skip note */}
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
        {t("phases.preferences.skipNote")}
      </p>
    </div>
  );
}

// ===== PHASE: Completion =====
export function CompletionPhase() {
  const { t } = useTranslation("onboarding");
  const { startTutorial } = useTutorial();
  const { completeTutorial } = useOnboarding();

  const handleStartGuidedTutorial = () => {
    // Start guided tutorial first so activation screen doesn't flash,
    // then complete onboarding after a small delay to allow modal to close
    startTutorial();
    setTimeout(() => {
      completeTutorial();
    }, 300);
  };

  return (
    <div className="space-y-5 text-center">
      {/* Celebratory icon */}
      <div className="w-16 h-16 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
        <i className="fas fa-check text-2xl text-green-600 dark:text-green-400" />
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          {t("phases.completion.title")}
        </h2>
        <p className="text-slate-600 dark:text-slate-300">
          {t("phases.completion.description")}
        </p>
      </div>

      {/* Encouragement */}
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
        {t("phases.completion.encouragement")}
      </p>

      {/* Quick tips */}
      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 text-left">
        <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
          {t("phases.completion.tips.title")}
        </h4>
        <ul className="space-y-2">
          {["tip1", "tip2", "tip3", "tip4"].map((tip, index) => (
            <li
              key={tip}
              className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400"
            >
              <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xs font-medium text-blue-600 dark:text-blue-400">
                {index + 1}
              </span>
              {t(`phases.completion.tips.${tip}`)}
            </li>
          ))}
        </ul>
      </div>

      {/* Guided Tutorial Option */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
            <i className="fas fa-hand-pointer text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 text-left">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
              {t("phases.completion.guidedTutorial.title")}
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
              {t("phases.completion.guidedTutorial.description")}
            </p>
            <button
              onClick={handleStartGuidedTutorial}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <i className="fas fa-play text-xs" />
              {t("phases.completion.guidedTutorial.button")}
            </button>
          </div>
        </div>
      </div>

      {/* Replay note */}
      <p className="text-xs text-slate-400 dark:text-slate-500">
        {t("phases.completion.replay")}
      </p>
    </div>
  );
}

// ===== Helper Components =====

function HighlightItem({
  icon,
  color,
  text,
}: {
  icon: string;
  color: string;
  text: string;
}) {
  const colorClasses: Record<string, { bg: string; icon: string }> = {
    blue: {
      bg: "bg-blue-50 dark:bg-blue-900/20",
      icon: "text-blue-600 dark:text-blue-400",
    },
    purple: {
      bg: "bg-purple-50 dark:bg-purple-900/20",
      icon: "text-purple-600 dark:text-purple-400",
    },
    amber: {
      bg: "bg-amber-50 dark:bg-amber-900/20",
      icon: "text-amber-600 dark:text-amber-400",
    },
    green: {
      bg: "bg-green-50 dark:bg-green-900/20",
      icon: "text-green-600 dark:text-green-400",
    },
    red: {
      bg: "bg-red-50 dark:bg-red-900/20",
      icon: "text-red-600 dark:text-red-400",
    },
  };

  const classes = colorClasses[color] || colorClasses.blue;

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg ${classes.bg}`}>
      <div className="flex-shrink-0 mt-0.5">
        <i className={`${icon} ${classes.icon}`} />
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300">{text}</p>
    </div>
  );
}

// Helper functions for dynamic colors (CSS-in-JS fallback)
function getColorBg(color: string, isDark: boolean): string {
  const light: Record<string, string> = {
    blue: "rgba(239, 246, 255, 1)",
    purple: "rgba(245, 243, 255, 1)",
    green: "rgba(240, 253, 244, 1)",
    orange: "rgba(255, 247, 237, 1)",
  };
  const dark: Record<string, string> = {
    blue: "rgba(30, 58, 138, 0.35)",
    purple: "rgba(76, 29, 149, 0.35)",
    green: "rgba(20, 83, 45, 0.35)",
    orange: "rgba(124, 45, 18, 0.35)",
  };
  const palette = isDark ? dark : light;
  return palette[color] || palette.blue;
}

function getColorBorder(color: string, isDark: boolean): string {
  const light: Record<string, string> = {
    blue: "rgba(191, 219, 254, 0.5)",
    purple: "rgba(221, 214, 254, 0.5)",
    green: "rgba(187, 247, 208, 0.5)",
    orange: "rgba(254, 215, 170, 0.5)",
  };
  const dark: Record<string, string> = {
    blue: "rgba(59, 130, 246, 0.35)",
    purple: "rgba(168, 85, 247, 0.35)",
    green: "rgba(34, 197, 94, 0.35)",
    orange: "rgba(249, 115, 22, 0.35)",
  };
  const palette = isDark ? dark : light;
  return palette[color] || palette.blue;
}

function getColorIcon(color: string): string {
  const colors: Record<string, string> = {
    blue: "#2563eb",
    purple: "#9333ea",
    green: "#16a34a",
    orange: "#ea580c",
  };
  return colors[color] || colors.blue;
}
