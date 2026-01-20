import { useTranslation } from "react-i18next";
import { useOnboarding } from "../../contexts/OnboardingContext";
import { useTutorialSafe } from "../../contexts/TutorialContext";
import ContentSection from "../layout/ContentSection";

export default function SettingsAdvanced() {
  const { replayTutorial, hasCompletedOnboarding, hasSkippedOnboarding } = useOnboarding();
  const tutorial = useTutorialSafe();
  const { t } = useTranslation(["onboarding", "tutorial"]);

  return (
    <div className="space-y-6">
      {/* Removed rarely used options phrase as requested */}

      <ContentSection title={t("onboarding:settings.section")}>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-slate-900 dark:text-white">
                {t("onboarding:settings.replayTitle")}
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {t("onboarding:settings.replayDescription")}
              </p>
              <div className="mt-2 flex items-center gap-2">
                {hasCompletedOnboarding ? (
                  <>
                    <i className="fas fa-check-circle text-green-500 text-sm" />
                    <span className="text-xs text-green-600 dark:text-green-400">
                      {t("onboarding:settings.completed")}
                    </span>
                  </>
                ) : hasSkippedOnboarding ? (
                  <>
                    <i className="fas fa-forward text-amber-500 text-sm" />
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      {t("onboarding:settings.skipped")}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
            <button
              onClick={replayTutorial}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <i className="fas fa-play text-xs" />
              {t("onboarding:settings.replayButton")}
            </button>
          </div>

          {tutorial && (
            <div className="flex items-center justify-between pt-6 border-t border-slate-200 dark:border-slate-700">
              <div>
                <label className="text-sm font-medium text-slate-900 dark:text-white">
                  {t("tutorial:settings.startTitle")}
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {t("tutorial:settings.startDescription")}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  {tutorial.hasCompletedTutorial ? (
                    <>
                      <i className="fas fa-check-circle text-green-500 text-sm" />
                      <span className="text-xs text-green-600 dark:text-green-400">
                        {t("tutorial:settings.status.completed")}
                      </span>
                    </>
                  ) : tutorial.hasStartedTutorial ? (
                    <>
                      <i className="fas fa-hourglass-half text-blue-500 text-sm" />
                      <span className="text-xs text-blue-600 dark:text-blue-400">
                        {t("tutorial:settings.status.inProgress")}
                      </span>
                    </>
                  ) : (
                    <>
                      <i className="fas fa-circle text-slate-400 text-sm" />
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {t("tutorial:settings.status.notStarted")}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {tutorial.hasCompletedTutorial ? (
                  <button
                    onClick={tutorial.restartTutorial}
                    className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                  >
                    <i className="fas fa-redo text-xs" />
                    {t("tutorial:settings.restartButton")}
                  </button>
                ) : tutorial.hasStartedTutorial ? (
                  <>
                    <button
                      onClick={tutorial.resumeTutorial}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                    >
                      <i className="fas fa-play text-xs" />
                      {t("tutorial:settings.resumeButton")}
                    </button>
                    <button
                      onClick={tutorial.restartTutorial}
                      className="px-3 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm rounded-lg transition-colors"
                      title={t("tutorial:settings.restartButton")}
                    >
                      <i className="fas fa-redo" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={tutorial.startTutorial}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                  >
                    <i className="fas fa-hand-pointer text-xs" />
                    {t("tutorial:settings.startButton")}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </ContentSection>
    </div>
  );
}
