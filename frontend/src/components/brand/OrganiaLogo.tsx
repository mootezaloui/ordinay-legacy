/**
 * OrganiaLogo.tsx
 *
 * Canonical Organia logo component.
 * Clean, reusable SVG that works on both light and dark backgrounds.
 *
 * Visual structure:
 * - Three concentric growth rings (opacity: 0.25 → 0.5 → 0.75)
 * - Four cardinal organization points
 * - Central core
 * - Optional gold intelligence accent
 */

import { CSSProperties, memo } from 'react';

export interface OrganiaLogoProps {
  /** Width in pixels (default: 80) */
  size?: number;
  /** Color mode: 'auto' uses CSS variables, 'light' uses dark mark, 'dark' uses light mark */
  variant?: 'auto' | 'light' | 'dark';
  /** Show the gold accent mark (default: true) */
  showAccent?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Inline styles */
  style?: CSSProperties;
  /** Animation state for loading scenarios */
  animate?: 'none' | 'pulse' | 'breathe';
}

const OrganiaLogo = memo(function OrganiaLogo({
  size = 80,
  variant = 'auto',
  showAccent = true,
  className = '',
  style,
  animate = 'none',
}: OrganiaLogoProps) {
  // Determine colors based on variant
  const getColors = () => {
    switch (variant) {
      case 'light':
        return {
          primary: '#1F3D36', // Forest green on light backgrounds
          accent: '#B89B5E',  // Gold accent
        };
      case 'dark':
        return {
          primary: '#F6F7F4', // Light on dark backgrounds
          accent: '#B89B5E',  // Gold accent (works on both)
        };
      case 'auto':
      default:
        return {
          primary: 'currentColor', // Inherits from parent
          accent: '#B89B5E',       // Gold is always gold
        };
    }
  };

  const colors = getColors();

  // Animation class mapping
  const animationClass = animate !== 'none' ? `organia-logo-${animate}` : '';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`organia-logo ${animationClass} ${className}`.trim()}
      style={style}
      aria-label="Organia"
      role="img"
    >
      {/* Growth rings - organic system structure */}
      <circle
        cx="80"
        cy="80"
        r="60"
        fill="none"
        stroke={colors.primary}
        strokeWidth="7"
        opacity="0.25"
        className="organia-ring organia-ring-outer"
      />
      <circle
        cx="80"
        cy="80"
        r="46"
        fill="none"
        stroke={colors.primary}
        strokeWidth="7"
        opacity="0.5"
        className="organia-ring organia-ring-middle"
      />
      <circle
        cx="80"
        cy="80"
        r="32"
        fill="none"
        stroke={colors.primary}
        strokeWidth="7"
        opacity="0.75"
        className="organia-ring organia-ring-inner"
      />

      {/* Cardinal organization points */}
      <circle cx="80" cy="20" r="5" fill={colors.primary} className="organia-point" />
      <circle cx="140" cy="80" r="5" fill={colors.primary} className="organia-point" />
      <circle cx="80" cy="140" r="5" fill={colors.primary} className="organia-point" />
      <circle cx="20" cy="80" r="5" fill={colors.primary} className="organia-point" />

      {/* Central core */}
      <circle cx="80" cy="80" r="10" fill={colors.primary} className="organia-core" />

      {/* Gold intelligence accent */}
      {showAccent && (
        <path
          d="M100 60 Q105 55, 110 60 Q105 65, 100 60 Z"
          fill={colors.accent}
          opacity="0.6"
          className="organia-accent"
        />
      )}
    </svg>
  );
});

export default OrganiaLogo;

/**
 * Minimal logo variant for very small spaces (favicon, notification badges)
 */
export const OrganiaLogoMinimal = memo(function OrganiaLogoMinimal({
  size = 24,
  variant = 'auto',
  className = '',
  style,
}: Omit<OrganiaLogoProps, 'showAccent' | 'animate'>) {
  const getColors = () => {
    switch (variant) {
      case 'light':
        return { primary: '#1F3D36' };
      case 'dark':
        return { primary: '#F6F7F4' };
      default:
        return { primary: 'currentColor' };
    }
  };

  const colors = getColors();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`organia-logo-minimal ${className}`.trim()}
      style={style}
      aria-label="Organia"
      role="img"
    >
      {/* Simplified: just rings and core */}
      <circle cx="80" cy="80" r="55" fill="none" stroke={colors.primary} strokeWidth="6" opacity="0.25" />
      <circle cx="80" cy="80" r="42" fill="none" stroke={colors.primary} strokeWidth="6" opacity="0.5" />
      <circle cx="80" cy="80" r="29" fill="none" stroke={colors.primary} strokeWidth="6" opacity="0.75" />
      <circle cx="80" cy="80" r="10" fill={colors.primary} />
    </svg>
  );
});
