import { useState, useMemo } from "react";
import {
  LayoutList,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Lightbulb,
  Filter,
  AlertCircle,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Minus,
} from "lucide-react";
import type { CollectionOutput, CollectionItem, FollowUpSuggestion } from "../../../services/api/agent";
import { TabbedCard } from "./TabbedCard";

// ─────────────────────────────────────────────────────────────────
// Scale thresholds — determines which layout to use
// ─────────────────────────────────────────────────────────────────

const INLINE_MAX = 5;
const GROUPED_MAX = 20;
const PAGE_SIZE = 10;

// ─────────────────────────────────────────────────────────────────
// Status severity helpers
// ─────────────────────────────────────────────────────────────────

function getSeverityIcon(severity?: string) {
  switch (severity) {
    case "error":
      return <AlertCircle className="w-3.5 h-3.5" />;
    case "warning":
      return <AlertTriangle className="w-3.5 h-3.5" />;
    case "success":
      return <CheckCircle2 className="w-3.5 h-3.5" />;
    default:
      return <Minus className="w-3.5 h-3.5" />;
  }
}

function getSeverityClass(severity?: string): string {
  switch (severity) {
    case "error":
      return "agent-collection-severity-error";
    case "warning":
      return "agent-collection-severity-warning";
    case "success":
      return "agent-collection-severity-success";
    default:
      return "agent-collection-severity-neutral";
  }
}

function getPriorityClass(priority?: string): string {
  switch (priority) {
    case "critical":
      return "agent-collection-priority-critical";
    case "high":
      return "agent-collection-priority-high";
    default:
      return "";
  }
}

// ─────────────────────────────────────────────────────────────────
// Grouping logic
// ─────────────────────────────────────────────────────────────────

interface ItemGroup {
  key: string;
  label: string;
  items: CollectionItem[];
  defaultExpanded: boolean;
  showHeader: boolean;
}

type GroupField = "status" | "priority" | "entityType";

function normalizeGroupBy(groupBy?: string): GroupField | undefined {
  if (!groupBy) return undefined;
  if (groupBy === "status" || groupBy === "priority" || groupBy === "entityType") {
    return groupBy;
  }
  return undefined;
}

function normalizeGroupValue(value?: string): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === "unknown") return null;
  return trimmed;
}

function resolveGroupValue(item: CollectionItem, groupBy: GroupField): string | null {
  if (groupBy === "status") {
    return normalizeGroupValue(item.status);
  }
  if (groupBy === "priority") {
    return normalizeGroupValue(item.priority);
  }
  return normalizeGroupValue(item.entityType);
}

function isGroupingResolvable(items: CollectionItem[], groupBy?: string): boolean {
  const normalized = normalizeGroupBy(groupBy);
  if (!normalized) return false;
  if (items.length === 0) return false;
  return items.every((item) => resolveGroupValue(item, normalized) !== null);
}

function groupItems(items: CollectionItem[], groupBy?: string): ItemGroup[] {
  if (!isGroupingResolvable(items, groupBy) || items.length <= INLINE_MAX) {
    return [{ key: "all", label: "All", items, defaultExpanded: true, showHeader: false }];
  }

  const normalizedGroupBy = normalizeGroupBy(groupBy)!;
  const groups = new Map<string, CollectionItem[]>();

  for (const item of items) {
    const key = resolveGroupValue(item, normalizedGroupBy);
    if (!key) continue;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(item);
  }

  // Sort groups: error/critical first, then warning/high, then others, completed last
  const severityOrder: Record<string, number> = {
    critical: 0, overdue: 0,
    high: 1, urgent: 1,
    warning: 2, "in progress": 2, active: 2,
    normal: 3, open: 3,
    low: 4, pending: 4,
    completed: 5, closed: 5, done: 5,
  };

  const sorted = Array.from(groups.entries()).sort(([a], [b]) => {
    const aOrder = severityOrder[a.toLowerCase()] ?? 3;
    const bOrder = severityOrder[b.toLowerCase()] ?? 3;
    return aOrder - bOrder;
  });

  return sorted.map(([key, groupItems], idx) => {
    const lowerKey = key.toLowerCase();
    const isLowPriority = ["completed", "closed", "done"].includes(lowerKey);
    return {
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      items: groupItems,
      defaultExpanded: !isLowPriority && idx < 3,
      showHeader: true,
    };
  });
}

// ─────────────────────────────────────────────────────────────────
// Stat card helpers for dashboard view
// ─────────────────────────────────────────────────────────────────

interface StatCard {
  label: string;
  count: number;
  severity: string;
}

function computeStats(items: CollectionItem[], groupBy?: string): StatCard[] {
  const normalizedGroupBy = normalizeGroupBy(groupBy);
  if (!normalizedGroupBy || !isGroupingResolvable(items, normalizedGroupBy)) {
    return [];
  }
  const counts = new Map<string, { count: number; severity: string }>();

  for (const item of items) {
    const key = resolveGroupValue(item, normalizedGroupBy);
    if (!key) continue;

    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, {
        count: 1,
        severity: item.statusSeverity || "neutral",
      });
    }
  }

  return Array.from(counts.entries()).map(([label, data]) => ({
    label: label.charAt(0).toUpperCase() + label.slice(1),
    count: data.count,
    severity: data.severity,
  }));
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

/** Single collection item row */
function CollectionRow({
  item,
  isSelected,
  onSelect,
}: {
  item: CollectionItem;
  isSelected: boolean;
  onSelect: (item: CollectionItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`agent-collection-row ${isSelected ? "is-selected" : ""} ${getPriorityClass(item.priority)}`}
    >
      <div className="agent-collection-row-main">
        <div className={`agent-collection-status-dot ${getSeverityClass(item.statusSeverity)}`} />
        <div className="agent-collection-row-content">
          <span className="agent-collection-row-title">{item.title}</span>
          {item.subtitle && (
            <span className="agent-collection-row-subtitle">{item.subtitle}</span>
          )}
        </div>
      </div>
      <div className="agent-collection-row-meta">
        {item.status && (
          <span className={`agent-collection-status-badge ${getSeverityClass(item.statusSeverity)}`}>
            {getSeverityIcon(item.statusSeverity)}
            {item.status}
          </span>
        )}
        {item.date && (
          <span className="agent-collection-row-date">
            <Clock className="w-3 h-3" />
            {item.dateLabel ? `${item.dateLabel}: ` : ""}{item.date}
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
      </div>
    </button>
  );
}

/** Inspector panel for selected item */
function InspectorPanel({ item }: { item: CollectionItem }) {
  const hasStructuredDetails = Boolean(
    item.subtitle ||
    item.status ||
    item.priority ||
    item.date ||
    (item.metrics && item.metrics.length > 0) ||
    (item.tags && item.tags.length > 0),
  );

  return (
    <div className="agent-collection-inspector">
      <div className="agent-collection-inspector-header">
        <h5 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {item.title}
        </h5>
        {item.subtitle && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {item.subtitle}
          </p>
        )}
      </div>

      <div className="agent-collection-inspector-body">
        {/* Status */}
        {item.status && (
          <div className="agent-collection-inspector-field">
            <span className="agent-collection-inspector-label">Status</span>
            <span className={`agent-collection-status-badge ${getSeverityClass(item.statusSeverity)}`}>
              {getSeverityIcon(item.statusSeverity)}
              {item.status}
            </span>
          </div>
        )}

        {/* Priority */}
        {item.priority && (
          <div className="agent-collection-inspector-field">
            <span className="agent-collection-inspector-label">Priority</span>
            <span className="text-sm text-slate-700 dark:text-slate-200 capitalize">{item.priority}</span>
          </div>
        )}

        {/* Date */}
        {item.date && (
          <div className="agent-collection-inspector-field">
            <span className="agent-collection-inspector-label">{item.dateLabel || "Date"}</span>
            <span className="text-sm text-slate-700 dark:text-slate-200">{item.date}</span>
          </div>
        )}

        {/* Metrics */}
        {item.metrics && item.metrics.length > 0 && (
          <div className="agent-collection-inspector-metrics">
            {item.metrics.map((metric, idx) => (
              <div key={idx} className="agent-collection-inspector-metric">
                <span className="agent-collection-inspector-label">{metric.label}</span>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {metric.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Tags */}
        {item.tags && item.tags.length > 0 && (
          <div className="agent-collection-inspector-tags">
            {item.tags.map((tag, idx) => (
              <span key={idx} className="agent-collection-tag">{tag}</span>
            ))}
          </div>
        )}

        {!hasStructuredDetails && (
          <div className="agent-collection-inspector-field">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              No additional structured details are available for this item.
            </span>
          </div>
        )}
      </div>

    </div>
  );
}

/** Collapsible group section */
function GroupSection({
  group,
  selectedItem,
  onSelectItem,
}: {
  group: ItemGroup;
  selectedItem: CollectionItem | null;
  onSelectItem: (item: CollectionItem) => void;
}) {
  const [expanded, setExpanded] = useState(group.defaultExpanded);

  return (
    <div className="agent-collection-group">
      {group.showHeader && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="agent-collection-group-header"
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {group.label}
          </span>
          <span className="agent-collection-group-count">{group.items.length}</span>
        </button>
      )}
      {(!group.showHeader || expanded) && (
        <div className="agent-collection-group-items">
          {group.items.map((item) => (
            <CollectionRow
              key={item.id}
              item={item}
              isSelected={selectedItem?.id === item.id}
              onSelect={onSelectItem}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Insights bar */
function InsightsBar({ insights }: { insights: string[] }) {
  if (!insights || insights.length === 0) return null;

  return (
    <div className="agent-collection-insights">
      <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <div className="space-y-1">
        {insights.map((insight, idx) => (
          <p key={idx} className="text-sm text-amber-800 dark:text-amber-200">{insight}</p>
        ))}
      </div>
    </div>
  );
}

/** Active filters display */
function ActiveFilters({ filters }: { filters: { field: string; value: string; label: string }[] }) {
  if (!filters || filters.length === 0) return null;

  return (
    <div className="agent-collection-filters">
      <Filter className="w-3.5 h-3.5 text-slate-400" />
      {filters.map((filter, idx) => (
        <span key={idx} className="agent-collection-filter-badge">
          {filter.label}
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Layout: Inline Cards (1–5 items)
// ─────────────────────────────────────────────────────────────────

function InlineLayout({
  items,
  onSelectItem,
}: {
  items: CollectionItem[];
  onSelectItem: (item: CollectionItem) => void;
}) {
  return (
    <div className="agent-collection-inline">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelectItem(item)}
          className={`agent-collection-card ${getPriorityClass(item.priority)}`}
        >
          <div className="agent-collection-card-top">
            <div className={`agent-collection-status-dot ${getSeverityClass(item.statusSeverity)}`} />
            <div className="agent-collection-card-title-area">
              <span className="agent-collection-card-title">{item.title}</span>
              {item.subtitle && (
                <span className="agent-collection-card-subtitle">{item.subtitle}</span>
              )}
            </div>
            <ExternalLink className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
          </div>
          <div className="agent-collection-card-bottom">
            {item.status && (
              <span className={`agent-collection-status-badge ${getSeverityClass(item.statusSeverity)}`}>
                {getSeverityIcon(item.statusSeverity)}
                {item.status}
              </span>
            )}
            {item.date && (
              <span className="agent-collection-row-date">
                <Clock className="w-3 h-3" />
                {item.dateLabel ? `${item.dateLabel}: ` : ""}{item.date}
              </span>
            )}
            {item.metrics && item.metrics.slice(0, 2).map((m, idx) => (
              <span key={idx} className="agent-collection-metric-inline">
                {m.label}: <strong>{m.value}</strong>
              </span>
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Layout: Grouped List + Inspector (6–20 items)
// ─────────────────────────────────────────────────────────────────

function GroupedLayout({
  items,
  groupBy,
}: {
  items: CollectionItem[];
  groupBy?: string;
}) {
  const [selectedItem, setSelectedItem] = useState<CollectionItem | null>(null);
  const groups = useMemo(() => groupItems(items, groupBy), [items, groupBy]);

  return (
    <div className={`agent-collection-grouped ${selectedItem ? "has-inspector" : ""}`}>
      <div className="agent-collection-list-panel">
        {groups.map((group) => (
          <GroupSection
            key={group.key}
            group={group}
            selectedItem={selectedItem}
            onSelectItem={setSelectedItem}
          />
        ))}
      </div>
      {selectedItem && (
        <InspectorPanel item={selectedItem} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Layout: Dashboard (21+ items)
// ─────────────────────────────────────────────────────────────────

function DashboardLayout({
  data,
}: {
  data: CollectionOutput;
}) {
  const normalizedGroupBy = normalizeGroupBy(data.groupBy);
  const groupingEnabled = isGroupingResolvable(data.items, normalizedGroupBy);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<CollectionItem | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const stats = useMemo(
    () => computeStats(data.items, groupingEnabled ? normalizedGroupBy : undefined),
    [data.items, groupingEnabled, normalizedGroupBy],
  );

  const filteredItems = useMemo(() => {
    if (!activeFilter || !groupingEnabled || !normalizedGroupBy) return data.items;
    return data.items.filter((item) => {
      const field = resolveGroupValue(item, normalizedGroupBy);
      return field?.toLowerCase() === activeFilter.toLowerCase();
    });
  }, [data.items, activeFilter, groupingEnabled, normalizedGroupBy]);

  const visibleItems = filteredItems.slice(0, visibleCount);
  const groups = useMemo(
    () => groupItems(filteredItems, groupingEnabled ? normalizedGroupBy : undefined),
    [filteredItems, groupingEnabled, normalizedGroupBy],
  );

  // Build tabs
  const attentionItems = data.items.filter((item) =>
    item.statusSeverity === "error" || item.statusSeverity === "warning" || item.priority === "critical" || item.priority === "high"
  );

  const tabs = [
    ...(attentionItems.length > 0
      ? [{
          id: "attention",
          label: "Attention Required",
          badge: attentionItems.length,
          content: (
            <div className={`agent-collection-grouped ${selectedItem ? "has-inspector" : ""}`}>
              <div className="agent-collection-list-panel">
                {attentionItems.slice(0, visibleCount).map((item) => (
                  <CollectionRow
                    key={item.id}
                    item={item}
                    isSelected={selectedItem?.id === item.id}
                    onSelect={setSelectedItem}
                  />
                ))}
                {attentionItems.length > visibleCount && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                    className="agent-collection-show-more"
                  >
                    Show more ({attentionItems.length - visibleCount} remaining)
                  </button>
                )}
              </div>
              {selectedItem && <InspectorPanel item={selectedItem} />}
            </div>
          ),
        }]
      : []),
    ...(groupingEnabled && normalizedGroupBy
      ? [{
          id: "grouped",
          label: `By ${normalizedGroupBy.charAt(0).toUpperCase() + normalizedGroupBy.slice(1)}`,
          badge: filteredItems.length,
          content: (
            <div className={`agent-collection-grouped ${selectedItem ? "has-inspector" : ""}`}>
              <div className="agent-collection-list-panel">
                {groups.map((group) => (
                  <GroupSection
                    key={group.key}
                    group={group}
                    selectedItem={selectedItem}
                    onSelectItem={setSelectedItem}
                  />
                ))}
              </div>
              {selectedItem && <InspectorPanel item={selectedItem} />}
            </div>
          ),
        }]
      : []),
    {
      id: "all",
      label: "All Items",
      badge: data.totalCount,
      content: (
        <div className={`agent-collection-grouped ${selectedItem ? "has-inspector" : ""}`}>
          <div className="agent-collection-list-panel">
            {visibleItems.map((item) => (
              <CollectionRow
                key={item.id}
                item={item}
                isSelected={selectedItem?.id === item.id}
                onSelect={setSelectedItem}
              />
            ))}
            {filteredItems.length > visibleCount && (
              <button
                type="button"
                onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                className="agent-collection-show-more"
              >
                Show more ({filteredItems.length - visibleCount} remaining)
              </button>
            )}
          </div>
          {selectedItem && <InspectorPanel item={selectedItem} />}
        </div>
      ),
    },
  ];

  return (
    <div className="agent-collection-dashboard">
      {/* Stat cards */}
      {stats.length > 0 && (
        <div className="agent-collection-stats">
          {stats.map((stat) => (
            <button
              key={stat.label}
              type="button"
              onClick={() => setActiveFilter(activeFilter === stat.label ? null : stat.label)}
              className={`agent-collection-stat-card ${getSeverityClass(stat.severity)} ${
                activeFilter === stat.label ? "is-active" : ""
              }`}
            >
              <span className="agent-collection-stat-count">{stat.count}</span>
              <span className="agent-collection-stat-label">{stat.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Active filter indicator */}
      {activeFilter && groupingEnabled && (
        <div className="agent-collection-active-filter">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Filtered by: <strong>{activeFilter}</strong>
          </span>
          <button
            type="button"
            onClick={() => setActiveFilter(null)}
            className="text-xs text-[#3b82f6] dark:text-[#60a5fa] hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* Tabbed content */}
      <TabbedCard
        tabs={tabs}
        defaultTab={attentionItems.length > 0 ? "attention" : groupingEnabled ? "grouped" : "all"}
      />

      {/* Total count indicator */}
      {data.totalCount > data.items.length && (
        <div className="agent-collection-total-indicator">
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Showing {data.items.length} of {data.totalCount} total results
          </span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────

interface CollectionArtifactProps {
  data: CollectionOutput;
  onFollowUpClick?: (followUp: FollowUpSuggestion) => void;
}

export function CollectionArtifact({ data, onFollowUpClick }: CollectionArtifactProps) {
  const normalizedGroupBy = normalizeGroupBy(data.groupBy);
  const groupingEnabled = isGroupingResolvable(data.items, normalizedGroupBy);
  const entityLabel = data.entityType
    ? data.entityType
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()) + "s"
    : "Results";

  const itemCount = data.items.length;
  const useInline = itemCount <= INLINE_MAX;
  const useGrouped = itemCount > INLINE_MAX && itemCount <= GROUPED_MAX;
  const useDashboard = itemCount > GROUPED_MAX || data.totalCount > GROUPED_MAX;

  return (
    <div className="artifact-build agent-artifact-card is-collection">
      {/* Header */}
      <div className="artifact-build-header agent-artifact-header agent-artifact-header-collection flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="agent-icon-container agent-icon-container-violet">
            <LayoutList className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {data.totalCount} {entityLabel}
            </h4>
            {data.sortBy && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Sorted by {data.sortBy}{groupingEnabled && normalizedGroupBy ? ` • Grouped by ${normalizedGroupBy}` : ""}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-5">
        {/* Summary */}
        <div className="artifact-build-section artifact-build-section-1">
          <p className="artifact-build-summary text-[15px] font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
            {data.summary}
          </p>
        </div>

        {/* Active filters */}
        {data.filters && data.filters.length > 0 && (
          <div className="artifact-build-section mt-3">
            <ActiveFilters filters={data.filters} />
          </div>
        )}

        {/* Insights */}
        {data.insights && data.insights.length > 0 && (
          <div className="artifact-build-section mt-4">
            <InsightsBar insights={data.insights} />
          </div>
        )}

        {/* Scale-adaptive layout */}
        <div className="artifact-build-section artifact-build-section-2 mt-5">
          {useInline && (
            <InlineLayout
              items={data.items}
              onSelectItem={() => {}}
            />
          )}
          {useGrouped && (
            <GroupedLayout
              items={data.items}
              groupBy={groupingEnabled ? normalizedGroupBy : undefined}
            />
          )}
          {useDashboard && (
            <DashboardLayout data={data} />
          )}
        </div>
      </div>
    </div>
  );
}
