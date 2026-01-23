/**
 * TutorialOverlay.tsx
 *
 * Interactive tutorial overlay that:
 * - Dims/blurs the app background
 * - Creates a spotlight on the target element
 * - Blocks clicks outside the spotlight
 * - Shows a tooltip anchored to the target
 * - Provides navigation controls
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTutorial } from "../../contexts/TutorialContext";

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
  bottom: number;
  right: number;
}

interface TooltipPosition {
  top: number;
  left: number;
  arrowPosition: "top" | "bottom" | "left" | "right";
}

export default function TutorialOverlayComponent() {
  const {
    isActive,
    isWaitingForAction,
    currentStep,
    currentStepIndex,
    totalSteps,
    nextStep,
    previousStep,
    skipCurrentStep,
    exitTutorial,
    canGoBack,
    canGoForward,
    isLastStep,
  } = useTutorial();

  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation("tutorial");

  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [tooltipPosition, setTooltipPosition] =
    useState<TooltipPosition | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const isDossierDetailRoute = useCallback((pathname: string) => {
    const segments = pathname.split("/").filter(Boolean);
    return segments[0] === "dossiers" && segments.length >= 2;
  }, []);

  // Find and track target element
  const findTargetElement = useCallback((): HTMLElement | null => {
    if (!currentStep?.target) return null;
    return document.querySelector(`[data-tutorial="${currentStep.target}"]`);
  }, [currentStep?.target]);

  // Update target rectangle
  const updateTargetRect = useCallback(() => {
    const element = findTargetElement();
    if (!element) {
      setTargetRect(null);
      setTooltipPosition(null);
      return;
    }

    const rect = element.getBoundingClientRect();
    const padding = 8; // Padding around the spotlight

    const newRect: TargetRect = {
      top: rect.top - padding,
      left: rect.left - padding,
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
      bottom: rect.bottom + padding,
      right: rect.right + padding,
    };

    setTargetRect(newRect);

    // Calculate tooltip position
    const tooltipWidth = 340; // Match actual tooltip width
    const tooltipHeight = 280; // Account for action hint and padding
    const gap = 24; // Increased gap to ensure clear separation
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let position: TooltipPosition;
    const preferredPosition = currentStep?.position || "auto";

    // Auto-calculate best position - use newRect (with padding) to avoid overlap
    const calculatePosition = (pos: string): TooltipPosition | null => {
      switch (pos) {
        case "bottom":
          if (newRect.bottom + gap + tooltipHeight < viewportHeight) {
            return {
              top: newRect.bottom + gap,
              left: Math.max(
                16,
                Math.min(
                  rect.left + rect.width / 2 - tooltipWidth / 2,
                  viewportWidth - tooltipWidth - 16
                )
              ),
              arrowPosition: "top",
            };
          }
          return null;
        case "top":
          if (newRect.top - gap - tooltipHeight > 0) {
            return {
              top: newRect.top - gap - tooltipHeight,
              left: Math.max(
                16,
                Math.min(
                  rect.left + rect.width / 2 - tooltipWidth / 2,
                  viewportWidth - tooltipWidth - 16
                )
              ),
              arrowPosition: "bottom",
            };
          }
          return null;
        case "right":
          if (newRect.right + gap + tooltipWidth < viewportWidth) {
            return {
              top: Math.max(
                16,
                Math.min(
                  rect.top + rect.height / 2 - tooltipHeight / 2,
                  viewportHeight - tooltipHeight - 16
                )
              ),
              left: newRect.right + gap,
              arrowPosition: "left",
            };
          }
          return null;
        case "left":
          if (newRect.left - gap - tooltipWidth > 0) {
            return {
              top: Math.max(
                16,
                Math.min(
                  rect.top + rect.height / 2 - tooltipHeight / 2,
                  viewportHeight - tooltipHeight - 16
                )
              ),
              left: newRect.left - gap - tooltipWidth,
              arrowPosition: "right",
            };
          }
          return null;
        default:
          return null;
      }
    };

    if (preferredPosition !== "auto") {
      position = calculatePosition(preferredPosition) ||
        calculatePosition("bottom") ||
        calculatePosition("top") ||
        calculatePosition("right") ||
        calculatePosition("left") || {
          top: viewportHeight / 2 - tooltipHeight / 2,
          left: viewportWidth / 2 - tooltipWidth / 2,
          arrowPosition: "top",
        };
    } else {
      // Try each position in order of preference
      position = calculatePosition("bottom") ||
        calculatePosition("top") ||
        calculatePosition("right") ||
        calculatePosition("left") || {
          top: viewportHeight / 2 - tooltipHeight / 2,
          left: viewportWidth / 2 - tooltipWidth / 2,
          arrowPosition: "top",
        };
    }

    setTooltipPosition(position);
  }, [currentStep, findTargetElement]);

  // Navigate to required route (only for non-action steps)
  useEffect(() => {
    if (!isActive || !currentStep?.route) return;

    // Don't force navigation for action-required steps - user needs to navigate themselves
    if (currentStep.requiresAction) return;

    if (location.pathname !== currentStep.route) {
      navigate(currentStep.route);
    }
  }, [
    isActive,
    currentStep?.route,
    currentStep?.requiresAction,
    location.pathname,
    navigate,
  ]);

  // Handle resuming tutorial - navigate to the step's route even if it requires action
  useEffect(() => {
    if (!isActive || !currentStep?.route) return;

    // Only navigate if not already on the correct route
    if (location.pathname !== currentStep.route) {
      navigate(currentStep.route);
    }
  }, [isActive, currentStep?.route, location.pathname, navigate]);

  // Detect when user navigates to complete an action-required step
  const searchString = location.search || "";
  useEffect(() => {
    if (!isActive || !currentStep?.requiresAction) return;

    // For sidebar-clients step: advance when user navigates to /clients
    if (
      currentStep.id === "sidebar-clients" &&
      location.pathname === "/clients"
    ) {
      // Small delay to let the navigation complete
      const timeout = setTimeout(() => {
        nextStep();
      }, 100);
      return () => clearTimeout(timeout);
    }

    // For client-dossiers-tab step: advance when user clicks on the Dossiers tab
    if (currentStep.id === "client-dossiers-tab") {
      const searchParams = new URLSearchParams(searchString);
      if (searchParams.get("tab") === "dossiers") {
        // Small delay to let the tab switch complete
        const timeout = setTimeout(() => {
          nextStep();
        }, 100);
        return () => clearTimeout(timeout);
      }
    }

    // For select-dossier-for-lawsuits step: advance when user opens a dossier detail page
    if (
      currentStep.id === "select-dossier-for-lawsuits" &&
      isDossierDetailRoute(location.pathname)
    ) {
      // Small delay to let the navigation complete
      const timeout = setTimeout(() => {
        nextStep();
      }, 100);
      return () => clearTimeout(timeout);
    }

    // For dossier-lawsuits-tab step: advance when user clicks on the Cases/Proceedings tab
    if (currentStep.id === "dossier-lawsuits-tab") {
      const searchParams = new URLSearchParams(searchString);
      if (searchParams.get("tab") === "proceedings") {
        // Small delay to let the tab switch complete
        const timeout = setTimeout(() => {
          nextStep();
        }, 100);
        return () => clearTimeout(timeout);
      }
    }

    // For sidebar-dossiers-for-tasks step: advance when user navigates to /dossiers
    if (
      currentStep.id === "sidebar-dossiers-for-tasks" &&
      location.pathname === "/dossiers"
    ) {
      const timeout = setTimeout(() => {
        nextStep();
      }, 100);
      return () => clearTimeout(timeout);
    }

    // For select-dossier-for-tasks step: advance when user opens a dossier detail page
    if (
      currentStep.id === "select-dossier-for-tasks" &&
      isDossierDetailRoute(location.pathname)
    ) {
      const timeout = setTimeout(() => {
        nextStep();
      }, 100);
      return () => clearTimeout(timeout);
    }

    // For dossier-tasks-tab step: advance when user clicks on the Tasks tab
    if (currentStep.id === "dossier-tasks-tab") {
      const searchParams = new URLSearchParams(searchString);
      if (searchParams.get("tab") === "tasks") {
        // Small delay to let the tab switch complete
        const timeout = setTimeout(() => {
          nextStep();
        }, 100);
        return () => clearTimeout(timeout);
      }
    }

    // For sidebar-dossiers step: advance when user navigates to /dossiers
    if (
      currentStep.id === "sidebar-dossiers" &&
      location.pathname === "/dossiers"
    ) {
      // Small delay to let the navigation complete
      const timeout = setTimeout(() => {
        nextStep();
      }, 100);
      return () => clearTimeout(timeout);
    }

    // For sidebar-personal-tasks step: advance when user navigates to /personal-tasks
    if (
      currentStep.id === "sidebar-personal-tasks" &&
      location.pathname === "/personal-tasks"
    ) {
      // Small delay to let the navigation complete
      const timeout = setTimeout(() => {
        nextStep();
      }, 100);
      return () => clearTimeout(timeout);
    }

    // Phase 4: Sessions navigation detection
    // For sidebar-sessions step: advance when user navigates to /sessions
    if (
      currentStep.id === "sidebar-sessions" &&
      location.pathname === "/sessions"
    ) {
      const timeout = setTimeout(() => {
        nextStep();
      }, 100);
      return () => clearTimeout(timeout);
    }

    // Phase 5: Officers navigation detection
    // For sidebar-officers step: advance when user navigates to /officers
    if (
      currentStep.id === "sidebar-officers" &&
      location.pathname === "/officers"
    ) {
      const timeout = setTimeout(() => {
        nextStep();
      }, 100);
      return () => clearTimeout(timeout);
    }

    // Phase 6: Financial navigation detection
    // For sidebar-accounting step: advance when user navigates to /accounting
    if (
      currentStep.id === "sidebar-accounting" &&
      location.pathname === "/accounting"
    ) {
      const timeout = setTimeout(() => {
        nextStep();
      }, 100);
      return () => clearTimeout(timeout);
    }

    // Phase 8: Document management navigation detection
    // For sidebar-dossiers-for-documents step: advance when user navigates to /dossiers
    if (
      currentStep.id === "sidebar-dossiers-for-documents" &&
      location.pathname === "/dossiers"
    ) {
      const timeout = setTimeout(() => {
        nextStep();
      }, 100);
      return () => clearTimeout(timeout);
    }

    // For select-dossier-for-documents step: advance when user opens a dossier detail page
    if (
      currentStep.id === "select-dossier-for-documents" &&
      isDossierDetailRoute(location.pathname)
    ) {
      const timeout = setTimeout(() => {
        nextStep();
      }, 100);
      return () => clearTimeout(timeout);
    }

    // For dossier-documents-tab step: advance when user clicks on the Documents tab
    if (currentStep.id === "dossier-documents-tab") {
      const searchParams = new URLSearchParams(searchString);
      if (searchParams.get("tab") === "documents") {
        // Slightly longer delay to ensure tab content renders
        const timeout = setTimeout(() => {
          nextStep();
        }, 250);
        return () => clearTimeout(timeout);
      }
    }

    // For dossier-notes-tab step: advance when user clicks on the Notes tab
    if (currentStep.id === "dossier-notes-tab") {
      const searchParams = new URLSearchParams(searchString);
      if (searchParams.get("tab") === "notes") {
        // Slightly longer delay to ensure tab content renders
        const timeout = setTimeout(() => {
          nextStep();
        }, 250);
        return () => clearTimeout(timeout);
      }
    }

    // For dossier-history-tab step: advance when user clicks on the History tab
    if (currentStep.id === "dossier-history-tab") {
      const searchParams = new URLSearchParams(searchString);
      if (searchParams.get("tab") === "timeline") {
        // Slightly longer delay to ensure tab content renders
        const timeout = setTimeout(() => {
          nextStep();
        }, 250);
        return () => clearTimeout(timeout);
      }
    }

    // For return-to-dashboard step: advance when user navigates back to dashboard
    if (
      currentStep.id === "return-to-dashboard" &&
      location.pathname === "/dashboard"
    ) {
      const timeout = setTimeout(() => {
        nextStep();
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [
    isActive,
    currentStep,
    location.pathname,
    searchString,
    nextStep,
    isDossierDetailRoute,
  ]);

  // Track target element with ResizeObserver and scroll
  useEffect(() => {
    if (!isActive || !currentStep?.target) {
      setTargetRect(null);
      setTooltipPosition(null);
      return;
    }

    // Scroll target element into view when step changes
    const scrollToTarget = () => {
      const element = findTargetElement();
      if (element) {
        // Scroll the element into view with some padding
        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
      }
    };

    // Initial scroll with delay for DOM to settle after navigation
    const scrollTimeout = setTimeout(scrollToTarget, 150);

    // Initial update with small delay for DOM to settle after navigation
    const initialTimeout = setTimeout(updateTargetRect, 200);

    // Setup observers
    const handleResize = () => updateTargetRect();
    const handleScroll = () => updateTargetRect();

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);

    // Watch for DOM changes (element might appear later)
    const mutationObserver = new MutationObserver(() => {
      const element = findTargetElement();
      if (element) {
        updateTargetRect();
      }
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Watch for element resize
    const checkAndObserve = () => {
      const element = findTargetElement();
      if (element && resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      if (element) {
        resizeObserverRef.current = new ResizeObserver(updateTargetRect);
        resizeObserverRef.current.observe(element);
      }
    };

    const observeTimeout = setTimeout(checkAndObserve, 150);

    return () => {
      clearTimeout(scrollTimeout);
      clearTimeout(initialTimeout);
      clearTimeout(observeTimeout);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
      mutationObserver.disconnect();
      resizeObserverRef.current?.disconnect();
    };
  }, [isActive, currentStep?.target, findTargetElement, updateTargetRect]);

  // Handle clicks on overlay (block or allow based on target)
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      // Don't block clicks on the tooltip itself - they have their own stopPropagation
      const target = e.target as HTMLElement;
      if (target.closest("[data-tutorial-tooltip]")) {
        return;
      }

      if (!targetRect || !currentStep?.allowInteraction) {
        // Block all clicks when no interaction allowed
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // Check if click is within the spotlight area
      const clickX = e.clientX;
      const clickY = e.clientY;

      const isInSpotlight =
        clickX >= targetRect.left &&
        clickX <= targetRect.right &&
        clickY >= targetRect.top &&
        clickY <= targetRect.bottom;

      if (!isInSpotlight) {
        e.preventDefault();
        e.stopPropagation();
      }
      // If in spotlight, let the click through
    },
    [targetRect, currentStep?.allowInteraction]
  );

  // Handle ESC key
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        exitTutorial();
      } else if (e.key === "ArrowRight" && canGoForward) {
        nextStep();
      } else if (e.key === "ArrowLeft" && canGoBack) {
        previousStep();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isActive, exitTutorial, nextStep, previousStep, canGoForward, canGoBack]);

  // Don't render if not active or waiting for user action (e.g., modal is open)
  if (!isActive || isWaitingForAction) return null;

  const tutorialRoot = document.getElementById("tutorial-root");
  if (!tutorialRoot) return null;

  // Check if this is a phase completion step (no target, centered display)
  const isPhase1Complete = currentStep?.id === "phase1-complete";
  const isPhase2Complete = currentStep?.id === "phase2-complete";
  const isPhase3Complete = currentStep?.id === "phase3-complete";
  const isPhase4Complete = currentStep?.id === "phase4-complete";
  const isPhase5Complete = currentStep?.id === "phase5-complete";
  const isPhase6Complete = currentStep?.id === "phase6-complete";
  const isPhase7Complete = currentStep?.id === "phase7-complete";
  const isPhase8Complete = currentStep?.id === "phase8-complete";
  const isTutorialComplete = currentStep?.id === "tutorial-complete";
  const isCompletionStep =
    isPhase1Complete ||
    isPhase2Complete ||
    isPhase3Complete ||
    isPhase4Complete ||
    isPhase5Complete ||
    isPhase6Complete ||
    isPhase7Complete ||
    isPhase8Complete ||
    isTutorialComplete;

  // Determine if spotlight should allow clicks through
  const allowSpotlightClicks = currentStep?.allowInteraction && targetRect;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9997]"
      style={{ pointerEvents: "none" }}
    >
      {/* Click blocker - covers everything when no interaction allowed */}
      {!allowSpotlightClicks && (
        <div
          className="absolute inset-0"
          style={{ pointerEvents: "auto" }}
          onClick={handleOverlayClick}
        />
      )}

      {/* Dimmed background with spotlight cutout - visual only */}
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: "none" }}
      >
        <defs>
          <mask id="spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left}
                y={targetRect.top}
                width={targetRect.width}
                height={targetRect.height}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(15, 23, 42, 0.6)"
          mask="url(#spotlight-mask)"
          style={{ pointerEvents: "none" }}
        />
      </svg>

      {/* Click blocker for areas outside spotlight when interaction IS allowed */}
      {allowSpotlightClicks && (
        <>
          {/* Top blocker */}
          <div
            className="absolute left-0 right-0"
            style={{ top: 0, height: targetRect.top, pointerEvents: "auto" }}
            onClick={handleOverlayClick}
          />
          {/* Bottom blocker */}
          <div
            className="absolute left-0 right-0"
            style={{ top: targetRect.bottom, bottom: 0, pointerEvents: "auto" }}
            onClick={handleOverlayClick}
          />
          {/* Left blocker */}
          <div
            className="absolute"
            style={{
              left: 0,
              width: targetRect.left,
              top: targetRect.top,
              height: targetRect.height,
              pointerEvents: "auto",
            }}
            onClick={handleOverlayClick}
          />
          {/* Right blocker */}
          <div
            className="absolute"
            style={{
              left: targetRect.right,
              right: 0,
              top: targetRect.top,
              height: targetRect.height,
              pointerEvents: "auto",
            }}
            onClick={handleOverlayClick}
          />
        </>
      )}

      {/* Spotlight border/glow - refined subtle appearance */}
      {targetRect && (
        <div
          className="absolute pointer-events-none rounded-xl border border-blue-400/60 shadow-[0_0_0_3px_rgba(59,130,246,0.15),0_0_20px_rgba(59,130,246,0.2)]"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            transition: "all 0.2s ease-out",
          }}
        />
      )}

      {/* Tooltip */}
      {(tooltipPosition || isCompletionStep) && (
        <div
          data-tutorial-tooltip
          className="absolute bg-white dark:bg-slate-800 rounded-2xl shadow-xl shadow-slate-900/10 dark:shadow-slate-900/50 border border-slate-200/80 dark:border-slate-700/80 w-[340px] max-w-[calc(100vw-2rem)] z-[9999] pointer-events-auto"
          style={
            isCompletionStep
              ? {
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  animation: "fadeInScale 0.25s ease-out",
                }
              : {
                  top: tooltipPosition?.top,
                  left: tooltipPosition?.left,
                  animation: "fadeInScale 0.2s ease-out",
                }
          }
          onClick={(e) => e.stopPropagation()}
        >
          {/* Arrow - refined */}
          {tooltipPosition && !isCompletionStep && (
            <div
              className={`absolute w-2.5 h-2.5 bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700/80 transform rotate-45 ${
                tooltipPosition.arrowPosition === "top"
                  ? "-top-[5px] left-1/2 -translate-x-1/2 border-l border-t"
                  : tooltipPosition.arrowPosition === "bottom"
                  ? "-bottom-[5px] left-1/2 -translate-x-1/2 border-r border-b"
                  : tooltipPosition.arrowPosition === "left"
                  ? "-left-[5px] top-1/2 -translate-y-1/2 border-l border-b"
                  : "-right-[5px] top-1/2 -translate-y-1/2 border-r border-t"
              }`}
            />
          )}

          {/* Content */}
          <div className="p-5">
            {/* Progress indicator */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(totalSteps, 8) }).map(
                    (_, i) => {
                      const segmentSize = Math.ceil(totalSteps / 8);
                      const segmentIndex = Math.floor(
                        currentStepIndex / segmentSize
                      );
                      return (
                        <div
                          key={i}
                          className={`h-1 w-4 rounded-full transition-colors duration-200 ${
                            i <= segmentIndex
                              ? "bg-blue-500"
                              : "bg-slate-200 dark:bg-slate-600"
                          }`}
                        />
                      );
                    }
                  )}
                </div>
                <span className="text-xs text-slate-400 dark:text-slate-500 font-medium tabular-nums">
                  {currentStepIndex + 1}/{totalSteps}
                </span>
              </div>
              <button
                onClick={exitTutorial}
                className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-700 transition-all"
                aria-label={t("controls.exit")}
              >
                <i className="fas fa-times text-xs" />
              </button>
            </div>

            {/* Step title */}
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-2 leading-snug">
              {t(`steps.${currentStep?.id}.title`)}
            </h3>

            {/* Step description */}
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
              {t(`steps.${currentStep?.id}.description`)}
            </p>

            {/* Action hint for interactive steps */}
            {currentStep?.requiresAction && (
              <div className="mb-4 px-3 py-2.5 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-100 dark:border-blue-900/50">
                <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-2 font-medium">
                  <i className="fas fa-hand-pointer text-blue-500/70" />
                  {t(`steps.${currentStep.id}.action`)}
                </p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-center pt-3 mt-1 border-t border-slate-100 dark:border-slate-700/60">
              {/* Next or Finish */}
              {canGoForward && (
                <button
                  onClick={nextStep}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2 shadow-sm hover:shadow"
                >
                  {isLastStep || isTutorialComplete
                    ? t("controls.finish")
                    : isPhase1Complete
                    ? t("controls.continuePhase2")
                    : isPhase2Complete
                    ? t("controls.continuePhase3")
                    : isPhase3Complete
                    ? t("controls.continuePhase4")
                    : isPhase4Complete
                    ? t("controls.continuePhase5")
                    : isPhase5Complete
                    ? t("controls.continuePhase6")
                    : isPhase6Complete
                    ? t("controls.continuePhase7")
                    : isPhase7Complete
                    ? t("controls.continuePhase8")
                    : t("controls.next")}
                  {!isLastStep && !isTutorialComplete && (
                    <i className="fas fa-arrow-right text-xs" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ESC hint - refined */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/50 flex items-center gap-2 pointer-events-none select-none">
        <kbd className="px-1.5 py-0.5 bg-white/10 backdrop-blur-sm rounded text-[10px] font-mono border border-white/10">
          Esc
        </kbd>
        <span className="font-medium">{t("controls.pressEscToExit")}</span>
      </div>
    </div>,
    tutorialRoot
  );
}

