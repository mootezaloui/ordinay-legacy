/**
 * OrganiaDataLoader.tsx
 *
 * In-app loading component for data fetching, workspace switching, etc.
 *
 * Purpose:
 * - Faster, more functional than startup loading
 * - Used during data operations
 * - Still branded but less prominent
 *
 * Variants:
 * - page: Full content area loader (centered)
 * - inline: Small inline loader with optional text
 * - card: Loader for card/panel content areas
 * - button: Tiny spinner for button loading states
 * - dots: Animated dots sequence
 */

import { memo } from 'react';
import { OrganiaLogoMinimal } from './OrganiaLogo';

export interface OrganiaDataLoaderProps {
  /** Loader variant */
  variant?: 'page' | 'inline' | 'card' | 'button' | 'dots';
  /** Optional loading message */
  message?: string;
  /** Size: 'sm' | 'md' | 'lg' */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  className?: string;
}

const OrganiaDataLoader = memo(function OrganiaDataLoader({
  variant = 'inline',
  message,
  size = 'md',
  className = '',
}: OrganiaDataLoaderProps) {

  // Size mappings for different variants
  const sizeMap = {
    sm: { logo: 20, ring: 'h-5 w-5', dots: 'h-1.5 w-1.5' },
    md: { logo: 28, ring: 'h-7 w-7', dots: 'h-2 w-2' },
    lg: { logo: 40, ring: 'h-10 w-10', dots: 'h-2.5 w-2.5' },
  };

  const sizes = sizeMap[size];

  // Page variant: Centered in content area
  if (variant === 'page') {
    return (
      <div className={`organia-data-loader organia-data-loader--page ${className}`}>
        <div className="organia-data-loader__content">
          {/* Animated ring spinner with logo core */}
          <div className="organia-data-loader__spinner">
            <OrganiaLogoMinimal size={sizes.logo * 2} variant="auto" />
          </div>

          {message && (
            <p className="organia-data-loader__message">{message}</p>
          )}
        </div>
      </div>
    );
  }

  // Card variant: For content areas within cards
  if (variant === 'card') {
    return (
      <div className={`organia-data-loader organia-data-loader--card ${className}`}>
        <div className="organia-data-loader__spinner organia-data-loader__spinner--small">
          <OrganiaLogoMinimal size={sizes.logo} variant="auto" />
        </div>
        {message && (
          <span className="organia-data-loader__message organia-data-loader__message--small">
            {message}
          </span>
        )}
      </div>
    );
  }

  // Button variant: Tiny spinner for button states
  if (variant === 'button') {
    return (
      <div className={`organia-data-loader organia-data-loader--button ${className}`}>
        <div className={`organia-data-loader__ring ${sizes.ring}`} />
      </div>
    );
  }

  // Dots variant: Animated dots sequence
  if (variant === 'dots') {
    return (
      <div className={`organia-data-loader organia-data-loader--dots ${className}`}>
        <div className="organia-data-loader__dots">
          <span className={`organia-data-loader__dot ${sizes.dots}`} style={{ animationDelay: '0ms' }} />
          <span className={`organia-data-loader__dot ${sizes.dots}`} style={{ animationDelay: '150ms' }} />
          <span className={`organia-data-loader__dot ${sizes.dots}`} style={{ animationDelay: '300ms' }} />
        </div>
        {message && (
          <span className="organia-data-loader__message organia-data-loader__message--inline">
            {message}
          </span>
        )}
      </div>
    );
  }

  // Inline variant (default): Small spinner with optional text
  return (
    <div className={`organia-data-loader organia-data-loader--inline ${className}`}>
      <div className="organia-data-loader__spinner organia-data-loader__spinner--inline">
        <div className={`organia-data-loader__ring ${sizes.ring}`} />
      </div>
      {message && (
        <span className="organia-data-loader__message organia-data-loader__message--inline">
          {message}
        </span>
      )}
    </div>
  );
});

export default OrganiaDataLoader;

/**
 * Convenience wrapper for page-level loading
 */
export const PageLoader = memo(function PageLoader({
  message = 'Loading...',
  className = '',
}: {
  message?: string;
  className?: string;
}) {
  return (
    <OrganiaDataLoader variant="page" message={message} size="lg" className={className} />
  );
});

/**
 * Convenience wrapper for inline loading
 */
export const InlineLoader = memo(function InlineLoader({
  message,
  size = 'sm',
  className = '',
}: {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <OrganiaDataLoader variant="inline" message={message} size={size} className={className} />
  );
});

/**
 * Convenience wrapper for button loading state
 */
export const ButtonLoader = memo(function ButtonLoader({
  size = 'sm',
  className = '',
}: {
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <OrganiaDataLoader variant="button" size={size} className={className} />
  );
});
