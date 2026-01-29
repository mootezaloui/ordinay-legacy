/**
 * Brand Components
 *
 * Canonical Ordinay brand assets and loading experiences.
 */

// Logo components
export { default as OrdinayLogo, OrdinayLogoMinimal } from './OrdinayLogo';
export type { OrdinayLogoProps } from './OrdinayLogo';

// Startup loader (cold start)
export { default as OrdinayStartupLoader, useStartupLoader } from './OrdinayStartupLoader';
export type { OrdinayStartupLoaderProps } from './OrdinayStartupLoader';

// Data loader (in-app loading)
export {
  default as OrdinayDataLoader,
  PageLoader,
  InlineLoader,
  ButtonLoader,
} from './OrdinayDataLoader';
export type { OrdinayDataLoaderProps } from './OrdinayDataLoader';
