import { useNotifications } from "../../contexts/NotificationContext";
import { useTranslation } from "react-i18next";

/**
 * AlertBanner Component
 * Displays temporary alert banners at the top of the app
 * Auto-dismisses after duration
 * 
 * Types: success, error, warning, info
 */
export default function AlertBanner() {
  const { alerts, removeAlert } = useNotifications();
  const { t } = useTranslation("common");

  if (alerts.length === 0) return null;

  const getAlertStyles = (type) => {
    const styles = {
      success: {
        bg: "bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950",
        border: "border-green-300 dark:border-green-600",
        icon: "fas fa-check-circle",
        iconBg: "bg-green-500",
        iconColor: "text-white",
        textColor: "text-green-900 dark:text-green-100",
        titleColor: "text-green-950 dark:text-green-50",
      },
      error: {
        bg: "bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-950 dark:to-rose-950",
        border: "border-red-300 dark:border-red-600",
        icon: "fas fa-exclamation-circle",
        iconBg: "bg-red-500",
        iconColor: "text-white",
        textColor: "text-red-900 dark:text-red-100",
        titleColor: "text-red-950 dark:text-red-50",
      },
      warning: {
        bg: "bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950 dark:to-yellow-950",
        border: "border-amber-300 dark:border-amber-600",
        icon: "fas fa-exclamation-triangle",
        iconBg: "bg-amber-500",
        iconColor: "text-white",
        textColor: "text-amber-900 dark:text-amber-100",
        titleColor: "text-amber-950 dark:text-amber-50",
      },
      info: {
        bg: "bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950 dark:to-cyan-950",
        border: "border-blue-300 dark:border-blue-600",
        icon: "fas fa-info-circle",
        iconBg: "bg-blue-500",
        iconColor: "text-white",
        textColor: "text-blue-900 dark:text-blue-100",
        titleColor: "text-blue-950 dark:text-blue-50",
      },
    };
    return styles[type] || styles.info;
  };

  return (
    <div className="fixed top-20 left-0 right-0 z-[100] px-4 space-y-3 pointer-events-none">
      {alerts.map((alert) => {
        const style = getAlertStyles(alert.type);

        return (
          <div
            key={alert.id}
            className={`mx-auto max-w-2xl animate-slide-down pointer-events-auto`}
          >
            <div
              className={`flex items-center gap-4 px-5 py-4 ${style.bg} border-2 ${style.border} rounded-xl shadow-2xl backdrop-blur-sm`}
            >
              {/* Icon with colored background */}
              <div className={`${style.iconBg} w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 shadow-md`}>
                <i className={`${style.icon} ${style.iconColor} text-lg`}></i>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {alert.title && (
                  <p className={`font-bold ${style.titleColor} mb-0.5 text-sm`}>
                    {alert.title}
                  </p>
                )}
                <p className={`text-sm ${style.textColor} leading-relaxed`}>
                  {alert.message}
                </p>
              </div>

              {/* Action Button (optional) */}
              {alert.action && (
                <button
                  onClick={alert.action.onClick}
                  className={`px-4 py-2 ${style.iconBg} text-white rounded-lg font-semibold text-sm hover:opacity-90 active:scale-95 transition-all shadow-md flex-shrink-0`}
                >
                  {alert.action.label}
                </button>
              )}

              {/* Close Button */}
              <button
                onClick={() => removeAlert(alert.id)}
                className={`${style.textColor} hover:bg-black/5 dark:hover:bg-white/5 w-8 h-8 rounded-lg transition-all flex items-center justify-center flex-shrink-0 active:scale-90`}
                aria-label={t("actions.close", { ns: "common" })}
              >
                <i className="fas fa-times text-base"></i>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* Add to your CSS or Tailwind config:

@keyframes slide-down {
  from {
    transform: translateY(-100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.animate-slide-down {
  animation: slide-down 0.3s ease-out;
}
*/
