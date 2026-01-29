/**
 * WorkflowDiagram.tsx
 *
 * A visual representation of Ordinay's core workflow:
 * Clients → Dossiers → Tasks/Missions
 *
 * Designed to be understood at a glance.
 */

import { useTranslation } from "react-i18next";

interface WorkflowDiagramProps {
  highlightStep?: "clients" | "dossiers" | "tasks" | "missions";
}

export default function WorkflowDiagram({
  highlightStep,
}: WorkflowDiagramProps) {
  const { t } = useTranslation("onboarding");

  const steps = [
    {
      id: "clients",
      icon: "fas fa-users",
      label: t("phases.workflow.clients.title"),
      color: "blue",
    },
    {
      id: "dossiers",
      icon: "fas fa-folder-open",
      label: t("phases.workflow.dossiers.title").replace("Dossiers: ", ""),
      color: "purple",
    },
    {
      id: "tasks",
      icon: "fas fa-tasks",
      label: t("phases.workflow.tasks.title").replace("Tasks ", ""),
      color: "green",
    },
    {
      id: "missions",
      icon: "fas fa-calendar-check",
      label: t("phases.workflow.missions.title").replace(" & Hearings", ""),
      color: "orange",
    },
  ];

  const getColorClasses = (color: string, isActive: boolean) => {
    const colors: Record<string, { bg: string; text: string; border: string }> =
      {
        blue: {
          bg: isActive
            ? "bg-blue-100 dark:bg-blue-900/40"
            : "bg-slate-100 dark:bg-slate-700/50",
          text: isActive
            ? "text-blue-600 dark:text-blue-400"
            : "text-slate-400 dark:text-slate-500",
          border: isActive
            ? "border-blue-300 dark:border-blue-700"
            : "border-transparent",
        },
        purple: {
          bg: isActive
            ? "bg-purple-100 dark:bg-purple-900/40"
            : "bg-slate-100 dark:bg-slate-700/50",
          text: isActive
            ? "text-purple-600 dark:text-purple-400"
            : "text-slate-400 dark:text-slate-500",
          border: isActive
            ? "border-purple-300 dark:border-purple-700"
            : "border-transparent",
        },
        green: {
          bg: isActive
            ? "bg-green-100 dark:bg-green-900/40"
            : "bg-slate-100 dark:bg-slate-700/50",
          text: isActive
            ? "text-green-600 dark:text-green-400"
            : "text-slate-400 dark:text-slate-500",
          border: isActive
            ? "border-green-300 dark:border-green-700"
            : "border-transparent",
        },
        orange: {
          bg: isActive
            ? "bg-orange-100 dark:bg-orange-900/40"
            : "bg-slate-100 dark:bg-slate-700/50",
          text: isActive
            ? "text-orange-600 dark:text-orange-400"
            : "text-slate-400 dark:text-slate-500",
          border: isActive
            ? "border-orange-300 dark:border-orange-700"
            : "border-transparent",
        },
      };
    return colors[color];
  };

  return (
    <div className="flex items-center justify-center gap-2 py-4">
      {steps.map((step, index) => {
        const isActive = highlightStep === step.id || !highlightStep;
        const colors = getColorClasses(step.color, isActive);

        return (
          <div key={step.id} className="flex items-center">
            {/* Step */}
            <div
              className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all duration-300 ${colors.bg} ${colors.border}`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center mb-1.5 transition-colors ${
                  isActive ? colors.bg : ""
                }`}
              >
                <i
                  className={`${step.icon} ${colors.text} text-lg transition-colors`}
                />
              </div>
              <span
                className={`text-xs font-medium transition-colors ${
                  isActive
                    ? "text-slate-700 dark:text-slate-200"
                    : "text-slate-400 dark:text-slate-500"
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Arrow */}
            {index < steps.length - 1 && (
              <div className="px-2">
                <i className="fas fa-chevron-right text-slate-300 dark:text-slate-600 text-sm" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
