import { useState, useEffect } from "react";

/**
 * Toast Component (IMPROVED POSITIONING)
 * Simple notification toast for success/error messages
 * Now positioned below header to avoid overlap
 */
export default function Toast({ message, type = "success", duration = 3000, onClose, position = "top-right" }) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onClose && onClose(), 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!message) return null;

  const types = {
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
    info: {
      bg: "bg-blue-50 dark:bg-blue-900/20",
      border: "border-blue-200 dark:border-blue-800",
      icon: "fas fa-info-circle",
      iconColor: "text-blue-600 dark:text-blue-400",
      textColor: "text-blue-800 dark:text-blue-300",
    },
    warning: {
      bg: "bg-amber-50 dark:bg-amber-900/20",
      border: "border-amber-200 dark:border-amber-800",
      icon: "fas fa-exclamation-triangle",
      iconColor: "text-amber-600 dark:text-amber-400",
      textColor: "text-amber-800 dark:text-amber-300",
    },
  };

  // Position classes
  const positions = {
    "top-right": "top-20 right-4",
    "top-center": "top-20 left-1/2 transform -translate-x-1/2",
    "top-left": "top-20 left-4",
    "bottom-right": "bottom-4 right-4",
    "bottom-center": "bottom-4 left-1/2 transform -translate-x-1/2",
    "bottom-left": "bottom-4 left-4",
  };

  const style = types[type] || types.success;
  const positionClass = positions[position] || positions["top-right"];

  return (
    <div className={`fixed ${positionClass} z-50 animate-slide-in`}>
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg ${style.bg} ${style.border} ${
          isVisible ? "opacity-100" : "opacity-0"
        } transition-opacity duration-300`}
        style={{ minWidth: "300px", maxWidth: "500px" }}
      >
        <i className={`${style.icon} ${style.iconColor} text-xl flex-shrink-0`}></i>
        <p className={`flex-1 text-sm font-medium ${style.textColor}`}>
          {message}
        </p>
        <button
          onClick={() => {
            setIsVisible(false);
            setTimeout(() => onClose && onClose(), 300);
          }}
          className={`${style.iconColor} hover:opacity-70 transition-opacity flex-shrink-0`}
        >
          <i className="fas fa-times"></i>
        </button>
      </div>
    </div>
  );
}

/**
 * Toast Container Hook
 * Usage:
 * const { showToast, ToastContainer } = useToast();
 * showToast("Success message!", "success");
 */
export function useToast() {
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success", position = "top-right") => {
    setToast({ message, type, position });
  };

  const ToastContainer = () => (
    toast && (
      <Toast
        message={toast.message}
        type={toast.type}
        position={toast.position}
        onClose={() => setToast(null)}
      />
    )
  );

  return { showToast, ToastContainer };
}

/* Add this to your global CSS or Tailwind config for the slide-in animation:

In tailwind.config.js:
module.exports = {
  theme: {
    extend: {
      keyframes: {
        'slide-in': {
          from: {
            transform: 'translateX(100%)',
            opacity: '0',
          },
          to: {
            transform: 'translateX(0)',
            opacity: '1',
          },
        },
      },
      animation: {
        'slide-in': 'slide-in 0.3s ease-out',
      },
    },
  },
}

OR in your global CSS:
@keyframes slide-in {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.animate-slide-in {
  animation: slide-in 0.3s ease-out;
}
*/