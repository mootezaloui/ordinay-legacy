import { type ReactNode } from "react";
import { Circle, CheckCircle2, AlertCircle, Clock, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type TimelineItemStatus = "complete" | "current" | "upcoming" | "warning" | "error";

interface TimelineItem {
  id: string;
  title: string;
  description?: string;
  timestamp?: string | Date;
  status?: TimelineItemStatus;
  icon?: LucideIcon;
  meta?: ReactNode;
  onClick?: () => void;
}

interface TimelineProps {
  items: TimelineItem[];
  /** Show timestamps on the left side */
  showTimestamps?: boolean;
  /** Make items clickable */
  interactive?: boolean;
  /** Orientation */
  orientation?: "vertical" | "horizontal";
}

const STATUS_STYLES: Record<TimelineItemStatus, { icon: typeof Circle; color: string; bg: string }> = {
  complete: {
    icon: CheckCircle2,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
  },
  current: {
    icon: Circle,
    color: "text-[#3b82f6] dark:text-[#60a5fa]",
    bg: "bg-blue-100 dark:bg-blue-900/30",
  },
  upcoming: {
    icon: Clock,
    color: "text-slate-400 dark:text-slate-500",
    bg: "bg-black/[0.04] dark:bg-white/[0.05]",
  },
  warning: {
    icon: AlertCircle,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-100 dark:bg-amber-900/30",
  },
  error: {
    icon: AlertCircle,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-100 dark:bg-red-900/30",
  },
};

/**
 * Timeline view for chronological data display.
 *
 * Pattern: Chronological storytelling of events.
 * - Visual connection between events
 * - Status indicators (complete, current, upcoming)
 * - Optional timestamps and metadata
 * - Interactive items for drill-down
 */
export function Timeline({
  items,
  showTimestamps = true,
  interactive = false,
  orientation = "vertical",
}: TimelineProps) {
  if (items.length === 0) return null;

  if (orientation === "horizontal") {
    return <HorizontalTimeline items={items} interactive={interactive} />;
  }

  return (
    <div className="agent-timeline">
      {items.map((item, idx) => {
        const status = item.status || "upcoming";
        const styles = STATUS_STYLES[status];
        const StatusIcon = item.icon || styles.icon;
        const isLast = idx === items.length - 1;
        const timestamp = item.timestamp
          ? typeof item.timestamp === "string"
            ? item.timestamp
            : item.timestamp.toLocaleDateString()
          : null;

        return (
          <div
            key={item.id}
            className={`agent-timeline-item ${interactive ? "is-interactive" : ""}`}
            onClick={interactive && item.onClick ? item.onClick : undefined}
          >
            {/* Timestamp column */}
            {showTimestamps && (
              <div className="agent-timeline-timestamp">
                {timestamp && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {timestamp}
                  </span>
                )}
              </div>
            )}

            {/* Icon and connector */}
            <div className="agent-timeline-marker">
              <div className={`agent-timeline-icon ${styles.bg}`}>
                <StatusIcon className={`w-4 h-4 ${styles.color}`} />
              </div>
              {!isLast && (
                <div
                  className={`agent-timeline-connector ${
                    status === "complete"
                      ? "is-complete"
                      : status === "current"
                        ? "is-active"
                        : ""
                  }`}
                />
              )}
            </div>

            {/* Content */}
            <div className="agent-timeline-content">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h4
                    className={`text-sm font-medium ${
                      status === "upcoming"
                        ? "text-slate-400 dark:text-slate-500"
                        : "text-slate-800 dark:text-slate-200"
                    }`}
                  >
                    {item.title}
                  </h4>
                  {item.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                      {item.description}
                    </p>
                  )}
                </div>
                {interactive && item.onClick && (
                  <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                )}
              </div>
              {item.meta && <div className="mt-2">{item.meta}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Horizontal timeline variant for workflows
 */
function HorizontalTimeline({
  items,
  interactive,
}: {
  items: TimelineItem[];
  interactive: boolean;
}) {
  return (
    <div className="agent-timeline-horizontal">
      {items.map((item, idx) => {
        const status = item.status || "upcoming";
        const styles = STATUS_STYLES[status];
        const StatusIcon = item.icon || styles.icon;
        const isLast = idx === items.length - 1;

        return (
          <div
            key={item.id}
            className={`agent-timeline-h-item ${interactive ? "is-interactive" : ""}`}
            onClick={interactive && item.onClick ? item.onClick : undefined}
          >
            {/* Node */}
            <div className="agent-timeline-h-node">
              <div className={`agent-timeline-h-icon ${styles.bg}`}>
                <StatusIcon className={`w-3.5 h-3.5 ${styles.color}`} />
              </div>
              {!isLast && (
                <div
                  className={`agent-timeline-h-connector ${
                    status === "complete" ? "is-complete" : ""
                  }`}
                />
              )}
            </div>

            {/* Label */}
            <span
              className={`agent-timeline-h-label ${
                status === "current" ? "font-medium" : ""
              } ${
                status === "upcoming"
                  ? "text-slate-400 dark:text-slate-500"
                  : "text-slate-700 dark:text-slate-200"
              }`}
            >
              {item.title}
            </span>
          </div>
        );
      })}
    </div>
  );
}
