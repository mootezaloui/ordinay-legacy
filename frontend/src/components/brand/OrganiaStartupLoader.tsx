/**
 * OrganiaStartupLoader.tsx
 *
 * Full-page branded loading screen using Orbital Motion concept.
 * Static rings with orbiting dots at different speeds.
 */

import { useEffect, useState, memo } from 'react';

export interface OrganiaStartupLoaderProps {
  isLoading?: boolean;
  onFadeOutComplete?: () => void;
  message?: string;
}

const OrganiaStartupLoader = memo(function OrganiaStartupLoader({
  isLoading = true,
  onFadeOutComplete,
  message = 'Finding natural balance...',
}: OrganiaStartupLoaderProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    if (!isLoading && isVisible) {
      setIsFadingOut(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        onFadeOutComplete?.();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isLoading, isVisible, onFadeOutComplete]);

  if (!isVisible) return null;

  return (
    <div className={`organia-orbital-loader ${isFadingOut ? 'organia-orbital-loader--fading' : ''}`}>
      {/* Background */}
      <div className="organia-orbital-loader__bg" />

      {/* Content */}
      <div className="organia-orbital-loader__content">
        {/* Orbital animation container */}
        <div className="organia-orbital-loader__orbit-container">
          {/* Static rings */}
          <div className="organia-orbital-loader__ring organia-orbital-loader__ring--outer" />
          <div className="organia-orbital-loader__ring organia-orbital-loader__ring--middle" />
          <div className="organia-orbital-loader__ring organia-orbital-loader__ring--inner" />

          {/* Core */}
          <div className="organia-orbital-loader__core" />

          {/* Orbiting points */}
          <div className="organia-orbital-loader__orbit organia-orbital-loader__orbit--1">
            <div className="organia-orbital-loader__point organia-orbital-loader__point--gold" />
          </div>
          <div className="organia-orbital-loader__orbit organia-orbital-loader__orbit--2">
            <div className="organia-orbital-loader__point organia-orbital-loader__point--primary" />
          </div>
          <div className="organia-orbital-loader__orbit organia-orbital-loader__orbit--3">
            <div className="organia-orbital-loader__point organia-orbital-loader__point--muted" />
          </div>
        </div>

        {/* Message */}
        {message && (
          <p className="organia-orbital-loader__message">{message}</p>
        )}
      </div>
    </div>
  );
});

export default OrganiaStartupLoader;

export function useStartupLoader(initialDelay = 0) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasMinimumTimeElapsed, setHasMinimumTimeElapsed] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setHasMinimumTimeElapsed(true);
    }, initialDelay + 800);
    return () => clearTimeout(timer);
  }, [initialDelay]);

  useEffect(() => {
    if (hasMinimumTimeElapsed && isAppReady) {
      setIsLoading(false);
    }
  }, [hasMinimumTimeElapsed, isAppReady]);

  return { isLoading, setReady: () => setIsAppReady(true) };
}
