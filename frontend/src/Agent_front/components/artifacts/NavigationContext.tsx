import { ArrowUp, ArrowDown, Network } from "lucide-react";
import type {
  NavigationContext as NavigationContextType,
  FollowUpSuggestion,
} from "../../../services/api/agent";

interface NavigationContextProps {
  navigation: NavigationContextType;
  parentFollowUp?: FollowUpSuggestion;
  onNavigate?: (followUp: FollowUpSuggestion) => void;
}

/**
 * Renders the MANDATORY navigation context section.
 *
 * This is NOT optional. Every entity read MUST show its role in the hierarchy.
 * - Parent entities lead to children (dossiers, tasks, etc.)
 * - Child entities link back to parents (client, dossier, etc.)
 */
export function NavigationContext({
  navigation,
  parentFollowUp,
  onNavigate,
}: NavigationContextProps) {
  const isParent = navigation.role === "parent";
  const isChild = navigation.role === "child";

  return (
    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <Network className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Context
        </span>
        <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">
          {navigation.role === "parent" ? "Parent entity" : navigation.role === "child" ? "Child entity" : "Entity"}
        </span>
      </div>

      {/* Role description */}
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
        {navigation.contextStatement}
      </p>

      <div className="flex flex-wrap gap-2">
        {/* Parent path — show if this is a child entity */}
        {isChild && navigation.parentPath && parentFollowUp && onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate(parentFollowUp)}
            className="group inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <ArrowUp className="w-3 h-3 text-slate-400" />
            <span>
              {navigation.parentPath.type}: {navigation.parentPath.reference || navigation.parentPath.name || navigation.parentPath.id}
            </span>
          </button>
        )}

        {isChild && navigation.parentPath && (!parentFollowUp || !onNavigate) && (
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
            <ArrowUp className="w-3 h-3 text-slate-400" />
            <span>
              {navigation.parentPath.type}: {navigation.parentPath.reference || navigation.parentPath.name || navigation.parentPath.id}
            </span>
          </span>
        )}

        {/* Children available — show if this is a parent entity */}
        {isParent && navigation.childrenAvailable && navigation.childrenAvailable.length > 0 && (
          navigation.childrenAvailable.map((child, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800/50 text-slate-500 dark:text-slate-400"
            >
              <ArrowDown className="w-3 h-3 text-slate-400" />
              <span>{child.type}</span>
              <span className="text-slate-400 dark:text-slate-500">({child.count})</span>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
