import { useEffect } from 'react';
import { useTranslation } from "react-i18next";

/**
 * ConfirmImpactModal Component
 *
 * Displays relational-impact warnings and requires explicit confirmation
 * before allowing structural changes to entity relationships.
 *
 * Used for Phase 2.5: Relational-Impact Confirmations
 *
 * Props:
 * - isOpen: boolean
 * - onClose: function
 * - onConfirm: function
 * - actionName: string (e.g., "Réassigner la mission")
 * - impactSummary: string[] (array of impact description lines)
 * - entityName: string (e.g., "Mission #001")
 */
export default function ConfirmImpactModal({
  isOpen,
  onClose,
  onConfirm,
  actionName,
  impactSummary = [],
  entityName = ""
}) {
  const { t } = useTranslation(["domain", "common"]);
  const resolvedActionName = actionName || t("impact.actions.perform", { ns: "domain" });
  const leadText = t("dialog.impact.warning.lead", {
    ns: "common",
    action: resolvedActionName.toLowerCase(),
    entityName: entityName ? ` ${entityName}` : "",
  });
  // Close modal on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Parse markdown-style formatting in impact summary
  const formatLine = (line) => {
    // Bold text: **text** → <strong>text</strong>
    return line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-white dark:bg-slate-800 rounded-lg shadow-2xl max-w-2xl w-full mx-4 max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/40 rounded-full flex-shrink-0">
                <i className="fas fa-exclamation-triangle text-amber-600 dark:text-amber-400 text-xl"></i>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-amber-900 dark:text-amber-100">
                  {t("dialog.impact.warning.title", { ns: "common" })}
                </h3>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5 break-words overflow-wrap-anywhere">
                  {leadText}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors flex-shrink-0"
              aria-label={t("actions.close", { ns: "common" })}
            >
              <i className="fas fa-times text-xl"></i>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto max-h-[calc(85vh-200px)]">
          <div className="space-y-4">
            {impactSummary.map((line, index) => {
              // Empty lines are spacers
              if (line.trim() === '') {
                return <div key={index} className="h-2"></div>;
              }

              // Lines starting with • are bullet points
              if (line.trim().startsWith('•')) {
                return (
                  <div
                    key={index}
                    className="flex items-start gap-2 text-slate-700 dark:text-slate-300"
                  >
                    <span className="text-amber-500 mt-1 flex-shrink-0">•</span>
                    <p
                      className="text-sm break-words overflow-wrap-anywhere flex-1"
                      dangerouslySetInnerHTML={{ __html: formatLine(line.replace(/^•\s*/, '')) }}
                    />
                  </div>
                );
              }

              // Lines starting with ** are section headers
              if (line.includes('**')) {
                return (
                  <p
                    key={index}
                    className="text-sm text-slate-900 dark:text-white font-medium break-words overflow-wrap-anywhere"
                    dangerouslySetInnerHTML={{ __html: formatLine(line) }}
                  />
                );
              }

              // Regular lines
              return (
                <p
                  key={index}
                  className="text-sm text-slate-700 dark:text-slate-300 break-words overflow-wrap-anywhere"
                >
                  {line}
                </p>
              );
            })}
          </div>

          {/* Confirmation prompt */}
          <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-900 dark:text-blue-100 font-medium flex items-center gap-2">
              <i className="fas fa-question-circle text-blue-600 dark:text-blue-400"></i>
              {t("dialog.impact.warning.prompt", { ns: "common" })}
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              {t("dialog.impact.warning.detail", { ns: "common" })}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 px-6 py-4">
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg transition-colors font-medium"
            >
              <i className="fas fa-times mr-2"></i>
              {t("dialog.impact.warning.cancel", { ns: "common" })}
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600 text-white rounded-lg transition-colors font-medium"
            >
              <i className="fas fa-check mr-2"></i>
              {t("dialog.impact.warning.confirm", { ns: "common" })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
