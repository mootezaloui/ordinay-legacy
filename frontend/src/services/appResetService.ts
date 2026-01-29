const APP_DB_NAMES = ["LawyerAppDocuments"];
const PRESERVE_LOCAL_STORAGE_KEYS = ["ordinay_device_id"];

const deleteDatabase = (name: string): Promise<void> =>
  new Promise((resolve, reject) => {
    try {
      if (typeof indexedDB === "undefined") {
        resolve();
        return;
      }
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onblocked = () => resolve();
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });

export const resetAppData = async (): Promise<void> => {
  if (typeof window === "undefined") return;

  try {
    if (window.electronAPI?.resetAppData) {
      const result = await window.electronAPI.resetAppData();
      if (!result?.ok) {
        console.error("[Reset] Backend reset failed:", result?.error);
      }
    }

    const preserved = new Map<string, string>();
    PRESERVE_LOCAL_STORAGE_KEYS.forEach((key) => {
      const value = window.localStorage.getItem(key);
      if (value !== null) {
        preserved.set(key, value);
      }
    });

    window.localStorage.clear();
    preserved.forEach((value, key) => {
      window.localStorage.setItem(key, value);
    });
    window.sessionStorage.clear();
  } catch (error) {
    console.error("[Reset] Failed to clear storage:", error);
  }

  try {
    await Promise.all(APP_DB_NAMES.map((name) => deleteDatabase(name)));
  } catch (error) {
    console.error("[Reset] Failed to clear IndexedDB:", error);
  }
};
