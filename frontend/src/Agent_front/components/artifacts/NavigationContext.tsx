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
    <div className="mt-4 pt-4 border-t border-black/[0.05] dark:border-white/[0.05]">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-2.5">
        <Network className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Hierarchy
        </span>
      </div>

      {/* Role description */}
      <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
        {navigation.contextStatement}
      </p>

      <div className="flex flex-wrap gap-2">
        {/* Parent path — show if this is a child entity */}
        {isChild && navigation.parentPath && parentFollowUp && onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate(parentFollowUp)}
            className="agent-nav-chip agent-nav-chip-interactive group"
          >
            <ArrowUp className="w-3 h-3 text-[#60a5fa] group-hover:text-[#3b82f6]" />
            <span className="agent-nav-chip-type">{navigation.parentPath.type}</span>
            <span className="agent-nav-chip-ref">
              {navigation.parentPath.reference || navigation.parentPath.name || navigation.parentPath.type}
            </span>
          </button>
        )}

        {isChild && navigation.parentPath && (!parentFollowUp || !onNavigate) && (
          <span className="agent-nav-chip">
            <ArrowUp className="w-3 h-3 text-slate-400" />
            <span className="agent-nav-chip-type">{navigation.parentPath.type}</span>
            <span className="agent-nav-chip-ref">
              {navigation.parentPath.reference || navigation.parentPath.name || navigation.parentPath.type}
            </span>
          </span>
        )}

        {/* Children available — show if this is a parent entity */}
        {isParent && navigation.childrenAvailable && navigation.childrenAvailable.length > 0 && (
          navigation.childrenAvailable.map((child, idx) => (
            <span key={idx} className="agent-nav-chip">
              <ArrowDown className="w-3 h-3 text-slate-400" />
              <span className="agent-nav-chip-type">{child.type}</span>
              <span className="agent-nav-chip-count">{child.count}</span>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
