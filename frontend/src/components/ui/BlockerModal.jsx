import { useEffect, useRef, useState } from 'react';
import { createPortal } from "react-dom";
import { useNavigate } from 'react-router-dom';
import { enrichBlockers, getEntityRoute } from '../../services/blockerEnrichment';
import { canPerformAction } from '../../services/domainRules';
import { useToast } from '../../contexts/ToastContext';
import { useData } from '../../contexts/DataContext';
import { useTranslation } from "react-i18next";
import { translateStatus } from '../../utils/entityTranslations';

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
 * - requiresForceDelete: boolean (if true, shows force delete option)
 * - affectedEntities: array (list of entities that will be cascade deleted)
 * - forceDeleteMessage: string (warning message for force delete)
 * - onForceDelete: function (callback when user confirms force delete)
 */
export default function BlockerModal({
  isOpen,
  onClose,
  actionName = "Do action",
  blockers = [],
  warnings = [],
  entityName = "",
  entityType = null,
  entityId = null,
  action = null,
  context = {},
  onRetry = null,
  onUpdate = null,
  requiresForceDelete = false,
  affectedEntities = [],
  forceDeleteMessage = "",
  onForceDelete = null
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { updateTask, updateSession, updateFinancialEntry, updateCase, updateDossier } = useData();
  const [enrichedBlockers, setEnrichedBlockers] = useState([]);
  const [resolvedBlockers, setResolvedBlockers] = useState(new Set());
  const [isResolving, setIsResolving] = useState(false);
  const { t } = useTranslation("common");
  const blockersKeyRef = useRef("");

  const getBlockersKey = (blockersInput) => {
    if (!blockersInput || blockersInput.length === 0) {
      return "empty";
    }

    if (typeof blockersInput[0] === "string") {
      return `strings:${blockersInput.join("|")}`;
    }

    try {
      return `objects:${JSON.stringify(blockersInput)}`;
    } catch {
      return `objects:${blockersInput.length}`;
    }
  };

  // Enrich blockers when they change
  useEffect(() => {
    if (!isOpen) {
      blockersKeyRef.current = "";
      setEnrichedBlockers((prev) => (prev.length > 0 ? [] : prev));
      setResolvedBlockers((prev) => (prev.size > 0 ? new Set() : prev));
      return;
    }

    const blockersKey = `${entityType ?? ""}|${entityId ?? ""}|${action ?? ""}|${getBlockersKey(blockers)}`;
    if (blockersKeyRef.current === blockersKey) {
      return;
    }
    blockersKeyRef.current = blockersKey;

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
      setEnrichedBlockers((prev) => (prev.length > 0 ? [] : prev));
    }
    // Reset resolved blockers when modal opens with new blockers
    setResolvedBlockers((prev) => (prev.size > 0 ? new Set() : prev));
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
  const handleInlineAction = async (
    actionType,
    targetEntityType,
    targetEntityId,
    blockerIndex,
    item = null
  ) => {
    setIsResolving(true);

    try {
      let success = false;
      let message = '';

      switch (actionType) {
        case 'complete':
          // Mark task or session as complete
          if (targetEntityType === 'task') {
            try {
              await updateTask(targetEntityId, { status: 'Done' });
              success = true;
              message = t("detail.blocker.toast.success.taskComplete");
            } catch (error) {
              console.error('Error updating task:', error);
              showToast(t("detail.blocker.toast.error.taskComplete"), 'error');
            }
          } else if (targetEntityType === 'session') {
            try {
              await updateSession(targetEntityId, { status: 'Completed' });
              success = true;
              message = t("detail.blocker.toast.success.hearingComplete");
            } catch (error) {
              console.error('Error updating session:', error);
              showToast(t("detail.blocker.toast.error.hearingComplete"), 'error');
            }
          }
          break;

        case 'markPaid':
          // Mark financial entry as paid
          try {
            await updateFinancialEntry(targetEntityId, { status: 'paid' });
            success = true;
            message = t("detail.blocker.toast.success.entryPaid");
          } catch (error) {
            console.error('Error updating financial entry:', error);
            showToast(t("detail.blocker.toast.error.entryPaid"), 'error');
          }
          break;

        case 'close':
          // Close case or dossier
          if (targetEntityType === 'case') {
            try {
              await updateCase(targetEntityId, { status: 'Closed' });
              success = true;
              message = t("detail.blocker.toast.success.caseClosed");
            } catch (error) {
              console.error('Error closing case:', error);
              showToast(t("detail.blocker.toast.error.caseClosed"), 'error');
            }
          } else if (targetEntityType === 'dossier') {
            try {
              await updateDossier(targetEntityId, { status: 'Closed' });
              success = true;
              message = t("detail.blocker.toast.success.dossierClosed");
            } catch (error) {
              console.error('Error closing dossier:', error);
              showToast(t("detail.blocker.toast.error.dossierClosed"), 'error');
            }
          }
          break;

        default:
          showToast(t("detail.blocker.toast.error.unsupported"), 'error');
      }

      if (success) {
        showToast(message, 'success');

        // Update the specific blocker items so only the resolved item disappears
        let shouldResolveBlocker = false;
        setEnrichedBlockers(prev =>
          prev.map((blocker, idx) => {
            if (idx !== blockerIndex) return blocker;
            const remainingItems = (blocker.items || []).filter(
              (it) => String(it.entityId) !== String(targetEntityId)
            );
            if (remainingItems.length === 0) {
              shouldResolveBlocker = true;
            }
            return { ...blocker, items: remainingItems };
          })
        );

        // Mark blocker resolved only if no items remain
        if (shouldResolveBlocker) {
          setResolvedBlockers(prev => new Set([...prev, blockerIndex]));
        }

        // Notify parent to update data
        if (onUpdate) {
          await onUpdate();
        }

        // Small delay to show success, then check if all blockers resolved
        setTimeout(() => {
          checkAllBlockersResolved();
        }, 500);
      }
    } catch (error) {
      console.error('Error performing inline action:', error);
      showToast(t("detail.blocker.toast.error.generic"), 'error');
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
      showToast(t("detail.blocker.toast.success.resolved"), 'success');
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
  const hasEnrichedBlockers = enrichedBlockers && enrichedBlockers.length > 0;

  const isBlockerResolved = (blocker, idx) =>
    resolvedBlockers.has(idx) ||
    ((blocker.items?.length || 0) === 0 && (!blocker.actions || blocker.actions.length === 0));

  const activeBlockers = enrichedBlockers.filter(
    (blocker, idx) => !isBlockerResolved(blocker, idx)
  );
  const allResolved = hasBlockers && hasEnrichedBlockers && activeBlockers.length === 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
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
                  {allResolved ? t("detail.blocker.title.blockersResolved") : t("detail.blocker.title.actionNotPossible")}
                </h3>
                <p className={`text-sm mt-0.5 break-words overflow-wrap-anywhere ${allResolved ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                  {allResolved ? t("detail.blocker.subtitle.canRetry") : t("detail.blocker.subtitle.unableTo", { actionName: actionName.toLowerCase(), entityName: entityName ? ` ${entityName}` : '' })}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`transition-colors flex-shrink-0 ${allResolved ? 'text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200' : 'text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200'}`}
              aria-label={t("aria.dialog.close", { ns: "common" })}
            >
              <i className="fas fa-times text-xl"></i>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto overflow-x-hidden max-h-[calc(90vh-200px)]">
          {hasEnrichedBlockers && activeBlockers.length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                <i className="fas fa-ban text-red-500"></i>
                {t("detail.blocker.sections.issuesToResolve")}
              </h4>
              <div className="space-y-4">
                {enrichedBlockers.map((blocker, index) => {
                  const isResolved = isBlockerResolved(blocker, index);
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
                {t("detail.blocker.sections.resolved", { count: resolvedBlockers.size })}
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
                {t("detail.blocker.sections.warnings")}
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

          {/* Force Delete Section */}
          {requiresForceDelete && affectedEntities.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/10 border-2 border-red-300 dark:border-red-700 rounded-lg p-5 w-full mt-4">
              <h4 className="text-base font-bold text-red-900 dark:text-red-100 mb-3 flex items-center gap-2">
                <i className="fas fa-exclamation-triangle text-red-600 dark:text-red-400"></i>
                {t("detail.blocker.title.deleteAnyway")}
              </h4>

              <p className="text-sm text-red-800 dark:text-red-200 mb-4 leading-relaxed">
                {forceDeleteMessage}
              </p>

              {/* Affected Entities List */}
              <div className="space-y-3 mb-4">
                {affectedEntities.map((entityGroup, idx) => (
                  <div key={idx} className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <i className="fas fa-trash-alt text-red-500 text-xs"></i>
                      <span className="text-sm font-semibold text-red-900 dark:text-red-100">
                        {entityGroup.count} {getEntityTypeLabel(entityGroup.type, entityGroup.count, t)} {entityGroup.count > 1 ? t("detail.blocker.forceDelete.willBeDeletedPlural") : t("detail.blocker.forceDelete.willBeDeleted")}
                      </span>
                    </div>
                    {entityGroup.items && entityGroup.items.length > 0 && (
                      <ul className="space-y-1 ml-5">
                        {entityGroup.items.map((item, itemIdx) => (
                          <li key={itemIdx} className="text-xs text-red-700 dark:text-red-300">
                            • {item.label}
                          </li>
                        ))}
                        {entityGroup.count > entityGroup.items.length && (
                          <li className="text-xs text-red-600 dark:text-red-400 font-medium">
                            • {t("detail.blocker.forceDelete.andMore", { count: entityGroup.count - entityGroup.items.length })}
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                ))}
              </div>

              <div className="bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-lg p-3 mb-4">
                <p className="text-xs text-red-900 dark:text-red-100 font-semibold flex items-center gap-2">
                  <i className="fas fa-info-circle"></i>
                  {t("detail.blocker.forceDelete.irreversible")}
                </p>
              </div>

              <button
                onClick={() => {
                  if (onForceDelete) {
                    onForceDelete();
                  }
                }}
                className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 text-white rounded-lg transition-colors font-semibold flex items-center justify-center gap-2"
              >
                <i className="fas fa-trash-alt"></i>
                {t("detail.blocker.forceDelete.confirmButton")}
              </button>
            </div>
          )}

          {/* Guidance */}
          {!allResolved && !requiresForceDelete && (
            <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4 w-full">
              <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                <i className="fas fa-lightbulb text-blue-500"></i>
                {t("detail.blocker.sections.howToResolve")}
              </h4>
              <p className="text-sm text-blue-800 dark:text-blue-200 whitespace-normal break-words max-w-full" style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}>
                {t("detail.blocker.help.useButtons")}
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
                {t("detail.blocker.actions.retryAction")}
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
              {allResolved ? t("detail.blocker.actions.close") : t("detail.blocker.actions.cancel")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * BlockerItem - Individual blocker with actions
 */
function BlockerItem({ blocker, blockerIndex, onNavigate, onInlineAction, isResolving }) {
  const { t } = useTranslation("common");
  const { t: tDossiers } = useTranslation("dossiers");
  const { t: tCases } = useTranslation("cases");
  const { t: tTasks } = useTranslation("tasks");
  const { t: tSessions } = useTranslation("sessions");
  const hasItems = blocker.items && blocker.items.length > 0;
  const hasActions = blocker.actions && blocker.actions.length > 0;
  const hasHelpText = !!blocker.helpText;

  return (
    <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg p-4">
      {/* Main blocker reason */}
      <div className="mb-3 space-y-2">
        <p className="text-sm font-medium text-red-900 dark:text-red-100 whitespace-pre-wrap break-words overflow-wrap-anywhere">
          {blocker.reason}
        </p>
        {blocker.warning && (
          <p className="text-xs text-red-700 dark:text-red-300 mt-2 italic">
            {blocker.warning}
          </p>
        )}
        {hasHelpText && (
          <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <i className="fas fa-info-circle text-blue-500 mt-0.5"></i>
            <p className="text-sm text-blue-900 dark:text-blue-100 whitespace-pre-wrap break-words">
              {blocker.helpText}
            </p>
          </div>
        )}
      </div>

      {/* Blocker items (e.g., list of incomplete tasks) */}
      {hasItems && (
        <div className="space-y-2 mb-3">
          {blocker.items.map((item, idx) => {
            const primaryText = item.entityLabel || item.label || item.message || `Item ${idx + 1}`;
            const showMessageDetail = item.message && item.message !== primaryText;

            // Translate status based on entity type
            const getTranslatedStatus = () => {
              if (!item.status) return null;

              const statusKeyMap = {
                'Open': 'open',
                'In Progress': 'inProgress',
                'On Hold': 'onHold',
                'Closed': 'closed',
                'Pending': 'pending',
                'Done': 'done',
                'Scheduled': 'scheduled',
                'Completed': 'completed',
                'Cancelled': 'cancelled'
              };

              const statusKey = statusKeyMap[item.status];
              if (!statusKey) return item.status;

              try {
                switch (item.entityType) {
                  case 'dossier':
                    return tDossiers(`status.${statusKey}`, item.status);
                  case 'case':
                  case 'lawsuit':
                    return tCases(`status.${statusKey}`, item.status);
                  case 'task':
                    return tTasks(`status.${statusKey}`, item.status);
                  case 'session':
                  case 'hearing':
                    return tSessions(`status.${statusKey}`, item.status);
                  default:
                    return item.status;
                }
              } catch {
                return item.status;
              }
            };

            const translatedStatus = getTranslatedStatus();

            return (
              <div
                key={idx}
                className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-red-100 dark:border-red-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white break-words whitespace-pre-wrap">
                      {primaryText}
                    </p>
                    {translatedStatus && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        {t("detail.blocker.sections.status")} {translatedStatus}
                      </p>
                    )}
                    {showMessageDetail && (
                      <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 whitespace-pre-wrap break-words">
                        {item.message}
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
            );
          })}
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
        blockerIndex,
        item
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

/**
 * Helper function to get localized entity type label
 */
function getEntityTypeLabel(type, count = 1, t) {
  const entityTypeMap = {
    clients: count > 1 ? 'clients' : 'client',
    dossiers: count > 1 ? 'dossiers' : 'dossier',
    cases: count > 1 ? 'lawsuits' : 'lawsuit',
    tasks: count > 1 ? 'tasks' : 'task',
    sessions: count > 1 ? 'sessions' : 'session',
    missions: count > 1 ? 'missions' : 'mission',
    financialEntries: count > 1 ? 'financialEntries' : 'financialEntry',
    officers: count > 1 ? 'officers' : 'officer'
  };

  const entityKey = entityTypeMap[type] || type;
  return t(`detail.blocker.entityTypes.${entityKey}`, { defaultValue: type });
}
