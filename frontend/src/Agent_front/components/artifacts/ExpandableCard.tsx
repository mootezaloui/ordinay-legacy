import { useState, useRef, useEffect, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Maximize2, Minimize2 } from "lucide-react";

interface ExpandableCardProps {
  children: ReactNode;
  /** Collapsed height in pixels. Default 200 */
  collapsedHeight?: number;
  /** Auto-collapse if content exceeds this height */
  autoCollapseThreshold?: number;
  /** Show the card in a modal when expanded */
  enableModal?: boolean;
  /** Title shown in modal header */
  modalTitle?: string;
  /** Initial expanded state */
  defaultExpanded?: boolean;
}

/**
 * Wraps artifact content with expand/collapse behavior.
 *
 * Progressive disclosure pattern:
 * - Shows collapsed preview with gradient fade
 * - "Show more" button at bottom
 * - Optional modal view for full inspection
 */
export function ExpandableCard({
  children,
  collapsedHeight = 200,
  autoCollapseThreshold = 300,
  enableModal = false,
  modalTitle = "Details",
  defaultExpanded = false,
}: ExpandableCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [showModal, setShowModal] = useState(false);
  const [shouldCollapse, setShouldCollapse] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Check if content is tall enough to warrant collapsing
  useEffect(() => {
    if (contentRef.current) {
      const height = contentRef.current.scrollHeight;
      setShouldCollapse(height > autoCollapseThreshold);
    }
  }, [autoCollapseThreshold, children]);

  // If content doesn't need collapsing, just render it
  if (!shouldCollapse) {
    return <>{children}</>;
  }

  return (
    <>
      <div
        className={`agent-expandable-card ${!isExpanded ? "is-collapsed" : ""}`}
        style={{ maxHeight: isExpanded ? "none" : `${collapsedHeight}px` }}
      >
        <div ref={contentRef}>{children}</div>

        {/* Expand/Collapse toggle */}
        {!isExpanded && (
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="agent-expand-toggle"
          >
            <ChevronDown className="w-4 h-4" />
            Show more
          </button>
        )}
      </div>

      {/* Actions when expanded */}
      {isExpanded && (
        <div className="flex items-center justify-center gap-2 mt-3">
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="agent-expand-toggle"
          >
            <ChevronUp className="w-4 h-4" />
            Show less
          </button>
          {enableModal && (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="agent-expand-toggle"
            >
              <Maximize2 className="w-4 h-4" />
              Full view
            </button>
          )}
        </div>
      )}

      {/* Modal for full inspection */}
      {showModal && (
        <div
          className="agent-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowModal(false);
          }}
        >
          <div className="agent-modal-container">
            <div className="agent-modal-header">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
                {modalTitle}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="agent-modal-close"
                aria-label="Close modal"
              >
                <Minimize2 className="w-5 h-5" />
              </button>
            </div>
            <div className="agent-modal-body">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
