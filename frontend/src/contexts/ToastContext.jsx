import { createContext, useContext, useCallback } from "react";
import { useNotifications } from "./NotificationContext";

/**
 * Toast Context
 * Centralized toast notification system for the entire app
 * 
 * Usage:
 * const { showToast } = useToast();
 * showToast("Success message!", "success");
 * showToast("Error message!", "error");
 * showToast("Info message!", "info");
 * showToast("Warning message!", "warning");
 */

const ToastContext = createContext();

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }) {
  const { notify } = useNotifications();

  const showToast = useCallback((message, type = "success", options = {}) => {
    const severity = ["success", "error", "warning", "info"].includes(type)
      ? type
      : "info";

    const titleMap = {
      success: "Success",
      error: "Error",
      warning: "Warning",
      info: "Information",
    };

    return notify[severity]({
      title: options.title || titleMap[severity],
      message,
      context: options.context || options.category || "app",
      link: options.link,
      duration: options.duration,
      toast: options.toast,
    });
  }, [notify]);

  // Kept for backward compatibility with previous API (no-op now that notifications are centralized)
  const removeToast = useCallback(() => { }, []);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export default ToastContext;
