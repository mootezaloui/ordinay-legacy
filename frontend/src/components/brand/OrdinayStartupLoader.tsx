/**
 * OrdinayStartupLoader.tsx
 *
 * Full-page branded loading screen using Orbital Motion concept.
 * Static rings with orbiting dots at different speeds.
 */

/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState, memo } from 'react';
import { i18nInstance } from '../../i18n';

export interface OrdinayStartupLoaderProps {
  isLoading?: boolean;
  onFadeOutComplete?: () => void;
  message?: string;
}

const OrdinayStartupLoader = memo(function OrdinayStartupLoader({
  isLoading = true,
  onFadeOutComplete,
  message,
}: OrdinayStartupLoaderProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [, setI18nVersion] = useState(0);
  const fallbackMessage = 'Finding natural balance...';
  const resolvedMessage =
    typeof message === 'string'
      ? message
      : i18nInstance.isInitialized
        ? i18nInstance.t('startup.splashMessage', {
            ns: 'common',
            defaultValue: fallbackMessage,
          })
        : fallbackMessage;
  const isFadingOut = !isLoading && isVisible;

  useEffect(() => {
    const refresh = () => setI18nVersion((v) => v + 1);

    i18nInstance.on('initialized', refresh);
    i18nInstance.on('loaded', refresh);
    i18nInstance.on('languageChanged', refresh);

    return () => {
      i18nInstance.off('initialized', refresh);
      i18nInstance.off('loaded', refresh);
      i18nInstance.off('languageChanged', refresh);
    };
  }, []);

  useEffect(() => {
    if (!isLoading && isVisible) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        onFadeOutComplete?.();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isLoading, isVisible, onFadeOutComplete]);

  if (!isVisible) return null;

  return (
    <div className={`ordinay-orbital-loader ${isFadingOut ? 'ordinay-orbital-loader--fading' : ''}`}>
      {/* Background */}
      <div className="ordinay-orbital-loader__bg" />

      {/* Content */}
      <div className="ordinay-orbital-loader__content">
        {/* Orbital animation container */}
        <div className="ordinay-orbital-loader__orbit-container">
          {/* Static rings */}
          <div className="ordinay-orbital-loader__ring ordinay-orbital-loader__ring--outer" />
          <div className="ordinay-orbital-loader__ring ordinay-orbital-loader__ring--middle" />
          <div className="ordinay-orbital-loader__ring ordinay-orbital-loader__ring--inner" />

          {/* Core */}
          <div className="ordinay-orbital-loader__core" />

          {/* Orbiting points */}
          <div className="ordinay-orbital-loader__orbit ordinay-orbital-loader__orbit--1">
            <div className="ordinay-orbital-loader__point ordinay-orbital-loader__point--gold" />
          </div>
          <div className="ordinay-orbital-loader__orbit ordinay-orbital-loader__orbit--2">
            <div className="ordinay-orbital-loader__point ordinay-orbital-loader__point--primary" />
          </div>
          <div className="ordinay-orbital-loader__orbit ordinay-orbital-loader__orbit--3">
            <div className="ordinay-orbital-loader__point ordinay-orbital-loader__point--muted" />
          </div>
        </div>

        {/* Message */}
        {resolvedMessage && (
          <p className="ordinay-orbital-loader__message">{resolvedMessage}</p>
        )}
      </div>
    </div>
  );
});

export default OrdinayStartupLoader;

export function useStartupLoader(initialDelay = 0) {
  const [hasMinimumTimeElapsed, setHasMinimumTimeElapsed] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false);
  const isLoading = !(hasMinimumTimeElapsed && isAppReady);

  useEffect(() => {
    const timer = setTimeout(() => {
      setHasMinimumTimeElapsed(true);
    }, initialDelay + 800);
    return () => clearTimeout(timer);
  }, [initialDelay]);

  return { isLoading, setReady: () => setIsAppReady(true) };
}
