import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { enrichBlockers, getEntityRoute } from '../../services/blockerEnrichment';
import { canPerformAction } from '../../services/domainRules';
import { useToast } from '../../contexts/ToastContext';

/**
 * BlockerModal Component - ENHANCED with Interactive Actions
 *
 * Displays domain rule validation errors with actionable resolution paths.
 * Shows what the user tried to do, why it's blocked, and HOW TO FIX IT.
 *
 * Props:
 * - isOpen: boolean
 * - onClose: function
 * - actionName: string (e.g., "Fermer le dossier")
 * - blockers: string[] | object[] (array of blocker reasons or structured blockers)
 * - warnings: string[] (optional non-blocking warnings)
 * - entityName: string (e.g., "DOS-2024-001")
 * - entityType: string (e.g., "dossier", "case", "task")
 * - entityId: number|string (ID of the entity being validated)
 * - action: string (e.g., "close", "edit", "delete")
 * - context: object (additional context for enrichment)
 * - onRetry: function (callback to retry the original action after resolution)
 * - onUpdate: function (callback when blockers are resolved to refresh data)
 */
export default function BlockerModal({
  isOpen,
  onClose,
  actionName = "effectuer cette action",
  blockers = [],
  warnings = [],
  entityName = "",
  entityType = null,
  entityId = null,
  action = null,
  context = {},
  onRetry = null,
  onUpdate = null
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [enrichedBlockers, setEnrichedBlockers] = useState([]);
  const [resolvedBlockers, setResolvedBlockers] = useState(new Set());
  const [isResolving, setIsResolving] = useState(false);

  // Enrich blockers when they change
  useEffect(() => {
    if (isOpen && blockers && blockers.length > 0) {
      // Check if blockers are already enriched (objects) or need enrichment (strings)
      if (typeof blockers[0] === 'string') {
        if (entityType && entityId && action) {
          const enriched = enrichBlockers(blockers, entityType, entityId, action, context);
          setEnrichedBlockers(enriched);
        } else {
          // Convert plain strings to basic blocker objects
          const plainBlockers = blockers.map(b => ({
            type: 'other',
            reason: b,
            actions: []
          }));
          setEnrichedBlockers(plainBlockers);
        }
      } else {
        // Already enriched
        setEnrichedBlockers(blockers);
      }
    } else {
      setEnrichedBlockers([]);
    }
    // Reset resolved blockers when modal opens with new blockers
    setResolvedBlockers(new Set());
  }, [isOpen, blockers, entityType, entityId, action]);

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

  /**
   * Handle navigation action
   */
  const handleNavigate = (route, entityId, tab = null) => {
    onClose();
    if (tab) {
      navigate(`${route}/${entityId}?tab=${tab}`);
    } else {
      navigate(`${route}/${entityId}`);
    }
  };

  /**
   * Handle inline resolution action
   */
  const handleInlineAction = async (actionType, targetEntityType, targetEntityId, blockerIndex) => {
    setIsResolving(true);

    try {
      let success = false;
      let message = '';

      switch (actionType) {
        case 'complete':
          // Mark task or session as complete
          if (targetEntityType === 'task') {
            const result = canPerformAction(targetEntityType, targetEntityId, 'changeStatus', {
              newValue: 'Terminée'
            });
            if (result.allowed) {
              // In a real app, this would call an API
              // For now, we'll just show success
              success = true;
              message = 'Tâche marquée comme terminée';
            } else {
              showToast('error', 'Impossible de marquer cette tâche comme terminée');
            }
          } else if (targetEntityType === 'session') {
            const result = canPerformAction(targetEntityType, targetEntityId, 'edit', {
              newData: { status: 'Terminée' }
            });
            if (result.allowed) {
              success = true;
              message = 'Séance marquée comme terminée';
            } else {
              showToast('error', 'Impossible de marquer cette séance comme terminée');
            }
          }
          break;

        case 'markPaid':
          // Mark financial entry as paid
          const result = canPerformAction(targetEntityType, targetEntityId, 'changeStatus', {
            newValue: 'Payée'
          });
          if (result.allowed) {
            success = true;
            message = 'Écriture marquée comme payée';
          } else {
            showToast('error', 'Impossible de marquer cette écriture comme payée');
          }
          break;

        default:
          showToast('error', 'Action non supportée');
      }

      if (success) {
        showToast('success', message);
        // Mark this blocker as resolved
        setResolvedBlockers(prev => new Set([...prev, blockerIndex]));

        // Notify parent to update data
        if (onUpdate) {
          onUpdate();
        }

        // Small delay to show success, then check if all blockers resolved
        setTimeout(() => {
          checkAllBlockersResolved();
        }, 500);
      }
    } catch (error) {
      console.error('Error performing inline action:', error);
      showToast('error', 'Une erreur est survenue');
    } finally {
      setIsResolving(false);
    }
  };

  /**
   * Check if all blockers have been resolved
   */
  const checkAllBlockersResolved = () => {
    const activeBlockers = enrichedBlockers.filter((_, idx) => !resolvedBlockers.has(idx));

    if (activeBlockers.length === 0 && onRetry) {
      // All blockers resolved - offer to retry
      showToast('success', 'Tous les blocages ont été résolus !');
      // Could auto-retry here or show retry button
    }
  };

  /**
   * Handle retry original action
   */
  const handleRetry = async () => {
    if (onRetry) {
      onClose();
      // Small delay for UX
      setTimeout(() => {
        onRetry();
      }, 200);
    }
  };

  if (!isOpen) return null;

  const hasBlockers = blockers && blockers.length > 0;
  const hasWarnings = warnings && warnings.length > 0;
  const activeBlockers = enrichedBlockers.filter((_, idx) => !resolvedBlockers.has(idx));
  const allResolved = hasBlockers && activeBlockers.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-white dark:bg-slate-800 rounded-lg shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`border-b px-6 py-4 ${allResolved ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className={`p-2 rounded-full flex-shrink-0 ${allResolved ? 'bg-green-100 dark:bg-green-900/40' : 'bg-red-100 dark:bg-red-900/40'}`}>
                <i className={`text-xl ${allResolved ? 'fas fa-check-circle text-green-600 dark:text-green-400' : 'fas fa-exclamation-triangle text-red-600 dark:text-red-400'}`}></i>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`text-lg font-bold ${allResolved ? 'text-green-900 dark:text-green-100' : 'text-red-900 dark:text-red-100'}`}>
                  {allResolved ? 'Blocages résolus !' : 'Action impossible'}
                </h3>
                <p className={`text-sm mt-0.5 break-words overflow-wrap-anywhere ${allResolved ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                  {allResolved ? 'Vous pouvez maintenant réessayer l\'action' : `Impossible de ${actionName.toLowerCase()}${entityName ? ` ${entityName}` : ''}`}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`transition-colors flex-shrink-0 ${allResolved ? 'text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200' : 'text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200'}`}
              aria-label="Fermer"
            >
              <i className="fas fa-times text-xl"></i>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto overflow-x-hidden max-h-[calc(90vh-200px)]">
          {hasBlockers && activeBlockers.length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                <i className="fas fa-ban text-red-500"></i>
                Problèmes à résoudre :
              </h4>
              <div className="space-y-4">
                {enrichedBlockers.map((blocker, index) => {
                  const isResolved = resolvedBlockers.has(index);
                  if (isResolved) return null; // Don't show resolved blockers

                  return (
                    <BlockerItem
                      key={index}
                      blocker={blocker}
                      blockerIndex={index}
                      onNavigate={handleNavigate}
                      onInlineAction={handleInlineAction}
                      isResolving={isResolving}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Show resolved blockers */}
          {resolvedBlockers.size > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-green-900 dark:text-green-100 mb-3 flex items-center gap-2">
                <i className="fas fa-check-circle text-green-500"></i>
                Résolu ({resolvedBlockers.size}) :
              </h4>
              <div className="space-y-2">
                {enrichedBlockers.map((blocker, index) => {
                  if (!resolvedBlockers.has(index)) return null;

                  return (
                    <div
                      key={index}
                      className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-center gap-3"
                    >
                      <i className="fas fa-check text-green-600 dark:text-green-400"></i>
                      <p className="text-sm text-green-800 dark:text-green-200 flex-1 line-through">
                        {blocker.summary || blocker.reason}
                      </p>
                    </div>
                  );
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
          {!allResolved && (
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4 w-full">
              <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                <i className="fas fa-lightbulb text-blue-500"></i>
                Comment résoudre ?
              </h4>
              <p className="text-sm text-blue-800 dark:text-blue-200 whitespace-normal break-words max-w-full" style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}>
                Utilisez les boutons d'action ci-dessus pour résoudre chaque problème. Vous pouvez naviguer vers les éléments bloquants ou les résoudre directement depuis cet écran.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 px-6 py-4">
          <div className="flex justify-end gap-3">
            {allResolved && onRetry && (
              <button
                onClick={handleRetry}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 text-white rounded-lg transition-colors font-medium"
              >
                <i className="fas fa-redo mr-2"></i>
                Réessayer l'action
              </button>
            )}
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-lg transition-colors font-medium ${allResolved
                ? 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-white'
                : 'bg-slate-600 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white'
                }`}
            >
              <i className="fas fa-times mr-2"></i>
              {allResolved ? 'Fermer' : 'Annuler'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * BlockerItem - Individual blocker with actions
 */
function BlockerItem({ blocker, blockerIndex, onNavigate, onInlineAction, isResolving }) {
  const hasItems = blocker.items && blocker.items.length > 0;
  const hasActions = blocker.actions && blocker.actions.length > 0;

  return (
    <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-4">
      {/* Main blocker reason */}
      <div className="mb-3">
        <p className="text-sm font-medium text-red-900 dark:text-red-100 whitespace-pre-wrap break-words overflow-wrap-anywhere">
          {blocker.reason}
        </p>
        {blocker.warning && (
          <p className="text-xs text-red-700 dark:text-red-300 mt-2 italic">
            {blocker.warning}
          </p>
        )}
      </div>

      {/* Blocker items (e.g., list of incomplete tasks) */}
      {hasItems && (
        <div className="space-y-2 mb-3">
          {blocker.items.map((item, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-red-100 dark:border-red-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                    {item.entityLabel}
                  </p>
                  {item.status && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      Statut: {item.status}
                    </p>
                  )}
                </div>
                {item.actions && item.actions.length > 0 && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {item.actions.map((action, actionIdx) => (
                      <ActionButton
                        key={actionIdx}
                        action={action}
                        item={item}
                        blockerIndex={blockerIndex}
                        onNavigate={onNavigate}
                        onInlineAction={onInlineAction}
                        isResolving={isResolving}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Blocker-level actions */}
      {hasActions && (
        <div className="flex flex-wrap gap-2">
          {blocker.actions.map((action, idx) => (
            <ActionButton
              key={idx}
              action={action}
              blockerIndex={blockerIndex}
              onNavigate={onNavigate}
              onInlineAction={onInlineAction}
              isResolving={isResolving}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * ActionButton - Renders navigation or inline action button
 */
function ActionButton({ action, item, blockerIndex, onNavigate, onInlineAction, isResolving }) {
  const handleClick = () => {
    if (action.type === 'navigate') {
      onNavigate(action.route, action.entityId || item?.entityId, action.tab);
    } else if (action.type === 'inline-action') {
      onInlineAction(
        action.action,
        action.entityType || item?.entityType,
        action.entityId || item?.entityId,
        blockerIndex
      );
    }
  };

  const isNavigation = action.type === 'navigate';
  const isSafe = action.safe;

  return (
    <button
      onClick={handleClick}
      disabled={isResolving}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${isNavigation
        ? 'bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
        : isSafe
          ? 'bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
          : 'bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
        } ${isResolving ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md'}`}
      title={action.description}
    >
      {isResolving && action.type === 'inline-action' ? (
        <i className="fas fa-spinner fa-spin"></i>
      ) : (
        <i className={action.icon}></i>
      )}
      <span>{action.label}</span>
    </button>
  );
}
