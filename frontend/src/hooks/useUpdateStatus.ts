import { useEffect, useState } from "react";
import type { UpdateStatus } from "../types/electron";

const fallbackStatus: UpdateStatus = {
  status: "idle",
  version: "",
  availableVersion: null,
  progress: null,
  lastCheckedAt: null,
  lastError: null,
  updatesEnabled: false,
};

export function useUpdateStatus() {
  const [status, setStatus] = useState<UpdateStatus>(fallbackStatus);

  useEffect(() => {
    let isMounted = true;
    const loadInitial = async () => {
      if (!window.electronAPI?.getUpdateStatus) return;
      try {
        const initial = await window.electronAPI.getUpdateStatus();
        if (isMounted && initial) {
          setStatus(initial);
        }
      } catch {
        // Silent by design (offline-first)
      }
    };

    loadInitial();

    if (!window.electronAPI?.onUpdateStatus) {
      return () => {
        isMounted = false;
      };
    }

    const unsubscribe = window.electronAPI.onUpdateStatus((next) => {
      if (!isMounted || !next) return;
      setStatus(next);
    });

    return () => {
      isMounted = false;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  return status;
}
