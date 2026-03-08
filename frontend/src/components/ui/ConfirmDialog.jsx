import { AlertTriangle, Info, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";

/**
 * ConfirmDialog - Custom confirmation dialog matching the app's UI design
 * Replaces native window.confirm with a styled modal
 */
export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirmation",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "warning", // 'warning' | 'danger' | 'info'
}) {
  const { t } = useTranslation("common");
  useBodyScrollLock(isOpen);
  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const handleCancel = () => {
    onClose();
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  };

  const variantStyles = {
    warning: {
      icon: AlertTriangle,
      iconColor: "text-amber-500",
      iconBg: "bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/30 dark:to-orange-900/20",
      iconRing: "ring-amber-200 dark:ring-amber-800/50",
      confirmButton: "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg shadow-amber-500/25",
      accentColor: "via-amber-500/50",
    },
    danger: {
      icon: AlertTriangle,
      iconColor: "text-red-500",
      iconBg: "bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/30 dark:to-rose-900/20",
      iconRing: "ring-red-200 dark:ring-red-800/50",
      confirmButton: "bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white shadow-lg shadow-red-500/25",
      accentColor: "via-red-500/50",
    },
    info: {
      icon: Info,
      iconColor: "text-blue-500",
      iconBg: "bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/20",
      iconRing: "ring-blue-200 dark:ring-blue-800/50",
      confirmButton: "bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-lg shadow-blue-500/25",
      accentColor: "via-blue-500/50",
    },
  };

  const style = variantStyles[variant] || variantStyles.warning;
  const Icon = style.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center p-0 md:p-4 pt-[var(--titlebar-height)] md:pt-[calc(var(--titlebar-height)+16px)] overflow-hidden animate-in fade-in duration-300"
      style={{
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/50 via-slate-800/40 to-slate-900/50 dark:from-black/60 dark:via-slate-900/50 dark:to-black/60" />

      {/* Modal */}
      <div
        className="relative bg-white dark:bg-slate-900 rounded-none md:rounded-2xl md:max-w-md w-full h-full md:h-auto animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 overflow-hidden flex flex-col"
        style={{
          boxShadow: '0 0 0 1px rgba(148, 163, 184, 0.1), 0 24px 48px -12px rgba(0, 0, 0, 0.25), 0 12px 24px -8px rgba(0, 0, 0, 0.15)',
        }}
      >
        {/* Top accent line */}
        <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${style.accentColor} to-transparent`} />

        {/* Close button */}
        <button
          onClick={handleCancel}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          aria-label={t("actions.close")}
        >
          <X size={18} />
        </button>

        {/* Content */}
        <div className="flex flex-col flex-1 min-h-0">
          <div className="modal-scroll-stable p-6 pt-8 overflow-y-auto flex-1 min-h-0">
          {/* Icon with ring effect */}
          <div className={`flex items-center justify-center w-14 h-14 rounded-xl ${style.iconBg} ring-4 ${style.iconRing} mb-5`}>
            <Icon className={style.iconColor} size={26} strokeWidth={2} />
          </div>

          {/* Title */}
          <h2
            id="confirm-dialog-title"
            className="text-xl font-bold text-slate-900 dark:text-white mb-2"
          >
            {title}
          </h2>

          {/* Message */}
          <p className="text-slate-600 dark:text-slate-400 mb-8 whitespace-pre-line leading-relaxed">
            {message}
          </p>
          </div>

          {/* Actions */}
          <div className="px-6 pb-6 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-col-reverse sm:flex-row gap-3 justify-end">
              <button
                onClick={handleCancel}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all font-semibold"
              >
                {cancelText}
              </button>
              <button
                onClick={handleConfirm}
                className={`w-full sm:w-auto px-5 py-2.5 rounded-xl transition-all font-semibold ${style.confirmButton}`}
              >
                {confirmText}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
