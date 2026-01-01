import { createContext, useContext, useState, useCallback } from "react";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { useTranslation } from "react-i18next";

/**
 * Confirm Context
 * Provides a promise-based confirm dialog system
 *
 * Usage:
 * const { confirm } = useConfirm();
 *
 * if (await confirm("Êtes-vous sûr ?")) {
 *   // User confirmed
 * }
 *
 * Or with options:
 * if (await confirm({
 *   title: "Supprimer",
 *   message: "Êtes-vous sûr de vouloir supprimer cet élément ?",
 *   confirmText: "Supprimer",
 *   cancelText: "Annuler",
 *   variant: "danger"
 * })) {
 *   // User confirmed
 * }
 */

const ConfirmContext = createContext();

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return context;
}

export function ConfirmProvider({ children }) {
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    title: "",
    message: "",
    confirmText: "",
    cancelText: "",
    variant: "warning",
    resolve: null,
  });
  const { t } = useTranslation("common");

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      // Allow passing just a string as the message
      const config = typeof options === "string"
        ? { message: options }
        : options;

      setConfirmState({
        isOpen: true,
        title: config.title || t("dialog.confirm.defaults.title"),
        message: config.message || "",
        confirmText: config.confirmText || t("dialog.confirm.defaults.confirm"),
        cancelText: config.cancelText || t("dialog.confirm.defaults.cancel"),
        variant: config.variant || "warning",
        resolve,
      });
    });
  }, [t]);

  const handleConfirm = useCallback(() => {
    if (confirmState.resolve) {
      confirmState.resolve(true);
    }
    setConfirmState(prev => ({ ...prev, isOpen: false, resolve: null }));
  }, [confirmState.resolve]);

  const handleCancel = useCallback(() => {
    if (confirmState.resolve) {
      confirmState.resolve(false);
    }
    setConfirmState(prev => ({ ...prev, isOpen: false, resolve: null }));
  }, [confirmState.resolve]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={handleCancel}
        onConfirm={handleConfirm}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        variant={confirmState.variant}
      />
    </ConfirmContext.Provider>
  );
}

export default ConfirmContext;
