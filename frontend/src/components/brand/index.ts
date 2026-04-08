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
  GeminiLogo,
  MetaLogo,
  MicrosoftLogo,
  AzureLogo,
  BedrockLogo,
  AlibabaLogo,
  DeepSeekLogo,
  CohereLogo,
  HuggingFaceLogo,
  MistralLogo,
  MoonshotLogo,
  IBMLogo,
  GemmaLogo,
  QwenLogo,
  YiLogo,
  NousResearchLogo,
  UpstageLogo,
  TIILogo,
  ZeroOneLogo,
  OllamaLogo,
  GenericAILogo,
} from './ProviderLogos';
export type { ProviderLogoProps } from './ProviderLogos';
export { PROVIDER_LOGOS, PROVIDER_LOGO_AVATARS } from './ProviderLogoMap';
export type { ProviderKey } from './ProviderLogoMap';

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
