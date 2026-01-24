/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from "react";
import { getCurrentOperator, type Operator } from "../services/api/operators";

interface OperatorContextValue {
  operator: Operator | null;
  isLoading: boolean;
  refetchOperator: () => Promise<void>;
}

const OperatorContext = createContext<OperatorContextValue | null>(null);

export const useOperator = () => {
  const ctx = useContext(OperatorContext);
  if (!ctx) {
    throw new Error("useOperator must be used within OperatorProvider");
  }
  return ctx;
};

/**
 * OperatorProvider loads the current operator at app startup.
 * This is identity context, not authentication.
 * The operator is always present for a local desktop app.
 */
export function OperatorProvider({ children }: { children: React.ReactNode }) {
  const [operator, setOperator] = useState<Operator | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load operator function (can be called on mount or manually to refresh)
  const loadOperator = async () => {
    try {
      const currentOperator = await getCurrentOperator();
      setOperator(currentOperator);
    } catch (error) {
      console.error("[OperatorContext] Failed to load current operator:", error);

      // Fallback to default operator if backend fails
      // This ensures the app continues to work
      setOperator({
        id: 1,
        name: "Principal Lawyer",
        role: "OWNER",
        is_active: 1,
        created_at: new Date().toISOString(),
      });
    }
  };

  // Refresh operator from backend
  const refetchOperator = async () => {
    await loadOperator();
  };

  useEffect(() => {
    let isMounted = true;

    async function init() {
      await loadOperator();
      if (isMounted) {
        setIsLoading(false);
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <OperatorContext.Provider value={{ operator, isLoading, refetchOperator }}>
      {children}
    </OperatorContext.Provider>
  );
}
