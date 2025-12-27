import { AlertTriangle, Info, X } from "lucide-react";

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
      iconColor: "text-yellow-500",
      iconBg: "bg-yellow-50 dark:bg-yellow-900/20",
      confirmButton: "bg-yellow-500 hover:bg-yellow-600 text-white",
    },
    danger: {
      icon: AlertTriangle,
      iconColor: "text-red-500",
      iconBg: "bg-red-50 dark:bg-red-900/20",
      confirmButton: "bg-red-500 hover:bg-red-600 text-white",
    },
    info: {
      icon: Info,
      iconColor: "text-blue-500",
      iconBg: "bg-blue-50 dark:bg-blue-900/20",
      confirmButton: "bg-blue-500 hover:bg-blue-600 text-white",
    },
  };

  const style = variantStyles[variant] || variantStyles.warning;
  const Icon = style.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="relative bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full mx-4 animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={handleCancel}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {/* Content */}
        <div className="p-6">
          {/* Icon */}
          <div className={`flex items-center justify-center w-12 h-12 rounded-full ${style.iconBg} mb-4`}>
            <Icon className={style.iconColor} size={24} />
          </div>

          {/* Title */}
          <h2
            id="confirm-dialog-title"
            className="text-xl font-semibold text-gray-900 dark:text-white mb-2"
          >
            {title}
          </h2>

          {/* Message */}
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            {message}
          </p>

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
            >
              {cancelText}
            </button>
            <button
              onClick={handleConfirm}
              className={`px-4 py-2 rounded-lg transition-colors font-medium ${style.confirmButton}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
