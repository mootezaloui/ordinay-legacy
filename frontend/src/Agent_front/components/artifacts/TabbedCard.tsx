import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface Tab {
  id: string;
  label: string;
  icon?: LucideIcon;
  content: ReactNode;
  badge?: string | number;
}

interface TabbedCardProps {
  tabs: Tab[];
  defaultTab?: string;
  /** Header content rendered above tabs */
  header?: ReactNode;
  /** Footer content rendered below tab panels */
  footer?: ReactNode;
  /** Card class name for styling */
  className?: string;
}

/**
 * Tabbed interface for multi-section artifacts.
 *
 * Pattern: Multiple perspectives on the same data.
 * - Each tab shows different view of entity
 * - Badges indicate counts or status
 * - Smooth transitions between views
 */
export function TabbedCard({
  tabs,
  defaultTab,
  header,
  footer,
  className = "",
}: TabbedCardProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);

  if (tabs.length === 0) return null;

  const activePanel = tabs.find((t) => t.id === activeTab);

  return (
    <div className={`agent-tabs ${className}`}>
      {/* Optional header */}
      {header}

      {/* Tab list */}
      <div className="agent-tabs-list" role="tablist">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`agent-tab-button ${isActive ? "is-active" : ""}`}
            >
              {Icon && <Icon className="w-4 h-4" />}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-slate-300">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab panels */}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={tab.id}
          hidden={tab.id !== activeTab}
          className="agent-tab-panel"
        >
          {tab.content}
        </div>
      ))}

      {/* Optional footer */}
      {footer}
    </div>
  );
}
