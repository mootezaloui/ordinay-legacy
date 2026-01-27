/**
 * TutorialOverlay.tsx
 *
 * A soft, semi-transparent overlay that dims the background
 * while keeping the tutorial content visible.
 * Designed to be non-intrusive and calming.
 */

import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

interface TutorialOverlayProps {
  children: ReactNode;
  onClose?: () => void;
  showEscHint?: boolean;
}

export default function TutorialOverlay({
  children,
  onClose,
  showEscHint = true,
}: TutorialOverlayProps) {
  const { t } = useTranslation("onboarding");
  useBodyScrollLock(true);

  // Handle ESC key to close
  useEffect(() => {
    if (!onClose) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const modalRoot = document.getElementById("modal-root");
  if (!modalRoot) {
    console.error("TutorialOverlay: #modal-root element not found");
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-stretch md:items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop with subtle blur */}
      <div
        className="absolute inset-0 bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
        style={{ pointerEvents: onClose ? "auto" : "none" }}
      />

      {/* Content container */}
      <div className="relative z-10 w-full h-full md:h-auto md:max-w-2xl mx-0 md:mx-4 animate-in zoom-in-95 fade-in duration-300">
        {children}
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={t("tooltips.close", { defaultValue: "Close" })}
          className="absolute top-6 right-6 z-20 h-9 w-9 rounded-full bg-white/10 text-white/80 hover:text-white hover:bg-white/20 transition"
        >
          <i className="fas fa-times text-sm" />
        </button>
      )}

      {/* ESC hint */}
      {showEscHint && onClose && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-white/60 flex items-center gap-2 animate-in fade-in duration-500 delay-500">
          <kbd className="px-2 py-0.5 bg-white/10 rounded text-[10px] font-mono">
            Esc
          </kbd>
          <span>{t("tooltips.pressEsc")}</span>
        </div>
      )}
    </div>,
    modalRoot
  );
}
