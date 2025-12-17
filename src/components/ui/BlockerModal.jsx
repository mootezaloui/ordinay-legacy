import { useEffect } from 'react';

/**
 * BlockerModal Component
 *
 * Displays domain rule validation errors in a clear, user-friendly modal.
 * Shows what the user tried to do, why it's blocked, and what to do next.
 *
 * Props:
 * - isOpen: boolean
 * - onClose: function
 * - actionName: string (e.g., "Fermer le dossier")
 * - blockers: string[] (array of blocker reasons)
 * - warnings: string[] (optional non-blocking warnings)
 * - entityName: string (e.g., "DOS-2024-001")
 */
export default function BlockerModal({
  isOpen,
  onClose,
  actionName = "effectuer cette action",
  blockers = [],
  warnings = [],
  entityName = ""
}) {
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

  const hasBlockers = blockers && blockers.length > 0;
  const hasWarnings = warnings && warnings.length > 0;

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
        <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-6 py-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/40 rounded-full">
                <i className="fas fa-exclamation-triangle text-red-600 dark:text-red-400 text-xl"></i>
              </div>
              <div>
                <h3 className="text-lg font-bold text-red-900 dark:text-red-100">
                  Action impossible
                </h3>
                <p className="text-sm text-red-700 dark:text-red-300 mt-0.5 break-words">
                  Impossible de {actionName.toLowerCase()}
                  {entityName && ` ${entityName}`}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 transition-colors"
              aria-label="Fermer"
            >
              <i className="fas fa-times text-xl"></i>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto max-h-[calc(85vh-180px)]">
          {hasBlockers && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                <i className="fas fa-ban text-red-500"></i>
                Raisons bloquantes :
              </h4>
              <div className="space-y-3">
                {blockers.map((blocker, index) => {
                  // Check if blocker has sub-items (contains newlines with bullets)
                  const hasSubItems = blocker.includes('\n  •');

                  if (hasSubItems) {
                    // Split main message and sub-items
                    const [mainMessage, ...subItems] = blocker.split('\n  •');

                    return (
                      <div
                        key={index}
                        className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-4"
                      >
                        <p className="text-sm font-medium text-red-900 dark:text-red-100 mb-2 break-words">
                          {mainMessage.replace(/^•\s*/, '')}
                        </p>
                        <ul className="space-y-1.5 ml-4">
                          {subItems.map((item, idx) => (
                            <li
                              key={idx}
                              className="text-sm text-red-800 dark:text-red-200 flex items-start gap-2"
                            >
                              <span className="text-red-400 mt-0.5 flex-shrink-0">•</span>
                              <span className="flex-1 break-words">{item.trim()}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  } else {
                    // Simple blocker without sub-items
                    return (
                      <div
                        key={index}
                        className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-4"
                      >
                        <p className="text-sm text-red-900 dark:text-red-100 whitespace-pre-line break-words">
                          {blocker.replace(/^•\s*/, '')}
                        </p>
                      </div>
                    );
                  }
                })}
              </div>
            </div>
          )}

          {hasWarnings && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-3 flex items-center gap-2">
                <i className="fas fa-exclamation-circle text-amber-500"></i>
                Avertissements :
              </h4>
              <div className="space-y-2">
                {warnings.map((warning, index) => (
                  <div
                    key={index}
                    className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-4"
                  >
                    <p className="text-sm text-amber-900 dark:text-amber-100 break-words">
                      {warning.replace(/^⚠\s*/, '')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Guidance */}
          <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
              <i className="fas fa-lightbulb text-blue-500"></i>
              Que faire ?
            </h4>
            <p className="text-sm text-blue-800 dark:text-blue-200 whitespace-pre-line break-words">
              Pour {actionName.toLowerCase()}, vous devez d'abord résoudre les problèmes listés ci-dessus.
              Une fois ces éléments traités, vous pourrez effectuer cette action.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 px-6 py-4">
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-lg transition-colors font-medium"
            >
              <i className="fas fa-check mr-2"></i>
              J'ai compris
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
