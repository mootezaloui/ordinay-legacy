import React, { useState } from "react";
import { useLock } from "../../contexts/LockContext";

/**
 * A full‑screen overlay that blocks access to the workspace. It is
 * intentionally minimalist: no account concept, no username field and
 * no links to sign in. Users must provide the correct password to
 * continue.
 */
export default function LockScreen() {
  const { unlock } = useLock();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const success = await unlock(password);
    if (!success) {
      setError("Incorrect password");
      setPassword("");
    } else {
      setPassword("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 dark:bg-black/80">
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg w-80">
        <h2 className="text-lg font-semibold text-center text-slate-900 dark:text-white mb-4">
          Organia Workspace Locked
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  );
}