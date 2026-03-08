import { useEffect, useRef, useState } from 'react';
import { createPortal } from "react-dom";
import { useNavigate } from 'react-router-dom';
import { enrichBlockers, getEntityRoute } from '../../services/blockerEnrichment';
import { canPerformAction } from '../../services/domainRules';
import { useToast } from '../../contexts/ToastContext';
import { useData } from '../../contexts/DataContext';
import { useTranslation } from "react-i18next";
import { translateStatus } from '../../utils/entityTranslations';
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

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
 * - entityType: string (e.g., "dossier", "lawsuit", "task")
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
  const { updateTask, updateSession, updateFinancialEntry, updateLawsuit, updateDossier, updateMission } = useData();
  const [enrichedBlockers, setEnrichedBlockers] = useState([]);
  const [resolvedBlockers, setResolvedBlockers] = useState(new Set());
  const [isResolving, setIsResolving] = useState(false);
  const { t } = useTranslation("common");
  const blockersKeyRef = useRef("");
  useBodyScrollLock(isOpen);

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
          // Convert plain strings to basic blocker objects.
          // Do not add empty `actions` here; the resolved-state heuristic uses
          // missing `items`/`actions` metadata to distinguish generic blockers.
          const plainBlockers = blockers.map(b => ({
            type: 'other',
            reason: b
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
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
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
          } else if (targetEntityType === 'mission') {
            try {
              await updateMission(targetEntityId, { status: 'completed' }, true);
              success = true;
              message = t("detail.blocker.toast.success.missionComplete", { defaultValue: "Mission marked as completed" });
            } catch (error) {
              console.error('Error updating mission:', error);
              showToast(t("detail.blocker.toast.error.missionComplete", { defaultValue: "Failed to complete mission" }), 'error');
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
          // Close lawsuit or dossier
          if (targetEntityType === 'lawsuit') {
            try {
              await updateLawsuit(targetEntityId, { status: 'Closed' });
              success = true;
              message = t("detail.blocker.toast.success.lawsuitClosed");
            } catch (error) {
              console.error('Error closing lawsuit:', error);
              showToast(t("detail.blocker.toast.error.lawsuitClosed"), 'error');
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

  const isBlockerResolved = (blocker, idx) => {
    if (resolvedBlockers.has(idx)) return true;

    // Only auto-resolve enriched blockers that explicitly track `items`.
    // Plain string blockers converted to generic objects should remain visible.
    if (Array.isArray(blocker.items)) {
      return blocker.items.length === 0 && (!blocker.actions || blocker.actions.length === 0);
    }

    return false;
  };

  const activeBlockers = enrichedBlockers.filter(
    (blocker, idx) => !isBlockerResolved(blocker, idx)
  );
  const allResolved = hasBlockers && hasEnrichedBlockers && activeBlockers.length === 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-stretch md:items-center justify-center p-0 md:p-4 pt-[var(--titlebar-height)] md:pt-[calc(var(--titlebar-height)+16px)] overflow-hidden animate-in fade-in duration-300"
      style={{
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/50 via-slate-800/40 to-slate-900/50 dark:from-black/60 dark:via-slate-900/50 dark:to-black/60" />

      <div
        className="relative bg-white dark:bg-slate-900 rounded-none md:rounded-2xl md:max-w-3xl w-full h-full md:h-auto overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 flex flex-col md:max-h-[calc(100vh-var(--titlebar-height)-48px)]"
        style={{
          boxShadow: '0 0 0 1px rgba(148, 163, 184, 0.1), 0 24px 48px -12px rgba(0, 0, 0, 0.25), 0 12px 24px -8px rgba(0, 0, 0, 0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top accent line */}
        <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${allResolved ? 'via-emerald-500/50' : 'via-red-500/50'} to-transparent z-10`} />

        {/* Header */}
        <div className={`border-b px-6 py-5 flex-shrink-0 ${allResolved ? 'bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 border-emerald-200 dark:border-emerald-800/50' : 'bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 border-red-200 dark:border-red-800/50'}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className={`p-3 rounded-xl flex-shrink-0 ring-4 ${allResolved ? 'bg-gradient-to-br from-emerald-100 to-green-100 dark:from-emerald-900/40 dark:to-green-900/40 ring-emerald-200 dark:ring-emerald-800/50' : 'bg-gradient-to-br from-red-100 to-rose-100 dark:from-red-900/40 dark:to-rose-900/40 ring-red-200 dark:ring-red-800/50'}`}>
                <i className={`text-xl ${allResolved ? 'fas fa-check-circle text-emerald-600 dark:text-emerald-400' : 'fas fa-exclamation-triangle text-red-500 dark:text-red-400'}`}></i>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`text-lg font-bold ${allResolved ? 'text-emerald-900 dark:text-emerald-100' : 'text-red-900 dark:text-red-100'}`}>
                  {allResolved ? t("detail.blocker.title.blockersResolved") : t("detail.blocker.title.actionNotPossible")}
                </h3>
                <p className={`text-sm mt-1 break-words overflow-wrap-anywhere ${allResolved ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                  {allResolved ? t("detail.blocker.subtitle.canRetry") : t("detail.blocker.subtitle.unableTo", { actionName: actionName.toLowerCase(), entityName: entityName ? ` ${entityName}` : '' })}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition-all flex-shrink-0 ${allResolved ? 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:text-emerald-200 dark:hover:bg-emerald-900/30' : 'text-red-500 hover:text-red-700 hover:bg-red-100 dark:text-red-400 dark:hover:text-red-200 dark:hover:bg-red-900/30'}`}
              aria-label={t("aria.dialog.close", { ns: "common" })}
            >
              <i className="fas fa-times text-lg"></i>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="modal-scroll-stable px-6 py-5 overflow-y-auto overscroll-contain overflow-x-hidden flex-1 min-h-0">
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
        <div className="bg-slate-50/80 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 px-6 py-5 flex-shrink-0">
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
            {allResolved && onRetry && (
              <button
                onClick={handleRetry}
                className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white rounded-xl transition-all font-semibold shadow-lg shadow-emerald-500/25"
              >
                <i className="fas fa-redo mr-2"></i>
                {t("detail.blocker.actions.retryAction")}
              </button>
            )}
            <button
              onClick={onClose}
              className={`w-full sm:w-auto px-5 py-2.5 rounded-xl transition-all font-semibold ${allResolved
                ? 'border-2 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                : 'bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 dark:from-slate-700 dark:to-slate-800 dark:hover:from-slate-600 dark:hover:to-slate-700 text-white shadow-lg shadow-slate-500/25'
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
  const { t: tLawsuits } = useTranslation("lawsuits");
  const { t: tTasks } = useTranslation("tasks");
  const { t: tSessions } = useTranslation("sessions");
  const hasItems = blocker.items && blocker.items.length > 0;
  const hasActions = blocker.actions && blocker.actions.length > 0;
  const hasHelpText = !!blocker.helpText;

  return (
    <div className="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/15 dark:to-rose-900/10 border border-red-200 dark:border-red-800/50 rounded-xl p-5">
      {/* Main blocker reason */}
      <div className="mb-4 space-y-3">
        <p className="text-sm font-semibold text-red-900 dark:text-red-100 whitespace-pre-wrap break-words overflow-wrap-anywhere">
          {blocker.reason}
        </p>
        {blocker.warning && (
          <p className="text-xs text-red-700 dark:text-red-300 italic">
            {blocker.warning}
          </p>
        )}
        {hasHelpText && (
          <div className="flex items-start gap-3 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/15 border border-blue-200 dark:border-blue-800/50 rounded-xl p-4">
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
                  case 'lawsuit':
                    return tLawsuits(`status.${statusKey}`, item.status);
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
                className="bg-white dark:bg-slate-900/80 rounded-xl p-4 border border-red-100 dark:border-red-900/50 shadow-sm"
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
      className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${isNavigation
        ? 'bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 dark:hover:from-blue-900/50 dark:hover:to-indigo-900/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50'
        : isSafe
          ? 'bg-gradient-to-r from-emerald-50 to-green-50 hover:from-emerald-100 hover:to-green-100 dark:from-emerald-900/30 dark:to-green-900/30 dark:hover:from-emerald-900/50 dark:hover:to-green-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50'
          : 'bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 dark:from-amber-900/30 dark:to-orange-900/30 dark:hover:from-amber-900/50 dark:hover:to-orange-900/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50'
        } ${isResolving ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-md hover:-translate-y-0.5'}`}
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
    lawsuits: count > 1 ? 'lawsuits' : 'lawsuit',
    tasks: count > 1 ? 'tasks' : 'task',
    sessions: count > 1 ? 'sessions' : 'session',
    missions: count > 1 ? 'missions' : 'mission',
    financialEntries: count > 1 ? 'financialEntries' : 'financialEntry',
    officers: count > 1 ? 'officers' : 'officer'
  };

  const entityKey = entityTypeMap[type] || type;
  return t(`detail.blocker.entityTypes.${entityKey}`, { defaultValue: type });
}



