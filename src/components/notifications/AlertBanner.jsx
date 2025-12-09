import { useNotifications } from "../../contexts/NotificationContext";

/**
 * AlertBanner Component
 * Displays temporary alert banners at the top of the app
 * Auto-dismisses after duration
 * 
 * Types: success, error, warning, info
 */
export default function AlertBanner() {
  const { alerts, removeAlert } = useNotifications();

  if (alerts.length === 0) return null;

  const getAlertStyles = (type) => {
    const styles = {
      success: {
        bg: "bg-green-50 dark:bg-green-900/20",
        border: "border-green-200 dark:border-green-800",
        icon: "fas fa-check-circle",
        iconColor: "text-green-600 dark:text-green-400",
        textColor: "text-green-800 dark:text-green-300",
      },
      error: {
        bg: "bg-red-50 dark:bg-red-900/20",
        border: "border-red-200 dark:border-red-800",
        icon: "fas fa-exclamation-circle",
        iconColor: "text-red-600 dark:text-red-400",
        textColor: "text-red-800 dark:text-red-300",
      },
      warning: {
        bg: "bg-amber-50 dark:bg-amber-900/20",
        border: "border-amber-200 dark:border-amber-800",
        icon: "fas fa-exclamation-triangle",
        iconColor: "text-amber-600 dark:text-amber-400",
        textColor: "text-amber-800 dark:text-amber-300",
      },
      info: {
        bg: "bg-blue-50 dark:bg-blue-900/20",
        border: "border-blue-200 dark:border-blue-800",
        icon: "fas fa-info-circle",
        iconColor: "text-blue-600 dark:text-blue-400",
        textColor: "text-blue-800 dark:text-blue-300",
      },
    };
    return styles[type] || styles.info;
  };

  return (
    <div className="fixed top-20 left-0 right-0 z-40 px-4 space-y-2">
      {alerts.map((alert) => {
        const style = getAlertStyles(alert.type);
        
        return (
          <div
            key={alert.id}
            className={`mx-auto max-w-4xl animate-slide-down`}
          >
            <div
              className={`flex items-center gap-4 px-6 py-4 ${style.bg} border ${style.border} rounded-lg shadow-lg`}
            >
              {/* Icon */}
              <i className={`${style.icon} ${style.iconColor} text-xl flex-shrink-0`}></i>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {alert.title && (
                  <p className={`font-semibold ${style.textColor} mb-1`}>
                    {alert.title}
                  </p>
                )}
                <p className={`text-sm ${style.textColor}`}>
                  {alert.message}
                </p>
              </div>

              {/* Action Button (optional) */}
              {alert.action && (
                <button
                  onClick={alert.action.onClick}
                  className={`px-4 py-2 ${style.iconColor} border-2 ${style.border} rounded-lg font-medium text-sm hover:bg-white/50 dark:hover:bg-black/20 transition-colors flex-shrink-0`}
                >
                  {alert.action.label}
                </button>
              )}

              {/* Close Button */}
              <button
                onClick={() => removeAlert(alert.id)}
                className={`${style.iconColor} hover:opacity-70 transition-opacity flex-shrink-0`}
              >
                <i className="fas fa-times text-lg"></i>
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
