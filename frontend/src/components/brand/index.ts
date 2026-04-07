/**
 * Brand Components
 *
 * Canonical Ordinay brand assets and loading experiences.
 */

// Logo components
export { default as OrdinayLogo, OrdinayLogoMinimal } from './OrdinayLogo';
export type { OrdinayLogoProps } from './OrdinayLogo';

// Provider logos
export {
  AnthropicLogo,
  OpenAILogo,
  GoogleLogo,
  MetaLogo,
  MicrosoftLogo,
  AlibabaLogo,
  DeepSeekLogo,
  CohereLogo,
  HuggingFaceLogo,
  MistralLogo,
  IBMLogo,
  GenericAILogo,
  PROVIDER_LOGOS,
} from './ProviderLogos';
export type { ProviderLogoProps, ProviderKey } from './ProviderLogos';

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
