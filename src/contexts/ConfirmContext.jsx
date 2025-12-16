import { createContext, useContext, useState, useCallback } from "react";
import ConfirmDialog from "../components/ui/ConfirmDialog";

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
    title: "Confirmation",
    message: "",
    confirmText: "Confirmer",
    cancelText: "Annuler",
    variant: "warning",
    resolve: null,
  });

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      // Allow passing just a string as the message
      const config = typeof options === "string"
        ? { message: options }
        : options;

      setConfirmState({
        isOpen: true,
        title: config.title || "Confirmation",
        message: config.message || "",
        confirmText: config.confirmText || "Confirmer",
        cancelText: config.cancelText || "Annuler",
        variant: config.variant || "warning",
        resolve,
      });
    });
  }, []);

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
