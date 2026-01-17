/**
 * components/LockScreen.tsx
 * Full-screen workspace lock UI
 * Blocks all app access until correct password is entered
 */

import { useState, FormEvent } from 'react';
import { useLock } from '../contexts/LockContext';

export default function LockScreen() {
  const { unlock } = useLock();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password) {
      setError('Please enter your password');
      return;
    }

    setIsUnlocking(true);

    // Small delay for UX feedback
    await new Promise(resolve => setTimeout(resolve, 300));

    const success = unlock(password);

    if (!success) {
      setError('Incorrect password');
      setPassword('');
      setIsUnlocking(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center z-[9999]">
      <div className="w-full max-w-md px-8">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-600 rounded-2xl mb-6 shadow-2xl">
            <i className="fas fa-lock text-white text-3xl"></i>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Organia Workspace Locked
          </h1>
          <p className="text-slate-400">
            Enter your password to access your workspace
          </p>
        </div>

        {/* Lock Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="password" className="sr-only">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                placeholder="Enter password"
                autoFocus
                autoComplete="current-password"
                disabled={isUnlocking}
                className={`w-full px-4 py-4 bg-slate-800/50 border ${
                  error ? 'border-red-500' : 'border-slate-700'
                } rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
              />
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <i className="fas fa-key text-slate-500"></i>
              </div>
            </div>
            {error && (
              <div className="mt-2 flex items-center gap-2 text-red-400 text-sm">
                <i className="fas fa-exclamation-circle"></i>
                <span>{error}</span>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isUnlocking}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isUnlocking ? (
              <>
                <i className="fas fa-spinner fa-spin"></i>
                <span>Unlocking...</span>
              </>
            ) : (
              <>
                <i className="fas fa-unlock"></i>
                <span>Unlock Workspace</span>
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-8 text-center text-slate-500 text-sm">
          <p>Organia - Legal Practice Management</p>
        </div>
      </div>
    </div>
  );
}