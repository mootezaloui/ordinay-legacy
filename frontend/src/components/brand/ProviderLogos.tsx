/**
 * ProviderLogos.tsx
 *
 * AI provider logo components for model selection.
 * Clean, reusable SVG logos that work on both light and dark backgrounds.
 */

import { CSSProperties, memo } from 'react';

export interface ProviderLogoProps {
  /** Width in pixels (default: 24) */
  size?: number;
  /** Additional CSS classes */
  className?: string;
  /** Inline styles */
  style?: CSSProperties;
}

// Anthropic Logo
export const AnthropicLogo = memo(function AnthropicLogo({
  size = 24,
  className = '',
  style,
}: ProviderLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-label="Anthropic"
      role="img"
    >
      <path
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-4-4 1.41-1.41L11 14.17l6.59-6.59L19 9l-8 8z"
        fill="#D4AF37"
      />
    </svg>
  );
});

// OpenAI Logo
export const OpenAILogo = memo(function OpenAILogo({
  size = 24,
  className = '',
  style,
}: ProviderLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-label="OpenAI"
      role="img"
    >
      <rect width="24" height="24" rx="4" fill="#412991"/>
      <path
        d="M7.5 7.5h9v9h-9z"
        fill="white"
      />
      <circle cx="12" cy="12" r="3" fill="#412991"/>
    </svg>
  );
});

// Google Logo
export const GoogleLogo = memo(function GoogleLogo({
  size = 24,
  className = '',
  style,
}: ProviderLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-label="Google"
      role="img"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
});

// Meta Logo
export const MetaLogo = memo(function MetaLogo({
  size = 24,
  className = '',
  style,
}: ProviderLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-label="Meta"
      role="img"
    >
      <path
        d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
        fill="#1877F2"
      />
    </svg>
  );
});

// Microsoft Logo
export const MicrosoftLogo = memo(function MicrosoftLogo({
  size = 24,
  className = '',
  style,
}: ProviderLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-label="Microsoft"
      role="img"
    >
      <rect width="24" height="24" rx="4" fill="#F35325"/>
      <rect x="8" y="8" width="8" height="8" fill="#81BC06"/>
      <rect x="0" y="8" width="8" height="8" fill="#05A6F0"/>
      <rect x="8" y="0" width="8" height="8" fill="#FFBA08"/>
    </svg>
  );
});

// Alibaba Logo
export const AlibabaLogo = memo(function AlibabaLogo({
  size = 24,
  className = '',
  style,
}: ProviderLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-label="Alibaba"
      role="img"
    >
      <rect width="24" height="24" rx="4" fill="#FF6A00"/>
      <path
        d="M6 8h12v2H6V8zm0 4h12v2H6v-2zm0 4h8v2H6v-2z"
        fill="white"
      />
    </svg>
  );
});

// DeepSeek Logo
export const DeepSeekLogo = memo(function DeepSeekLogo({
  size = 24,
  className = '',
  style,
}: ProviderLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-label="DeepSeek"
      role="img"
    >
      <rect width="24" height="24" rx="4" fill="#0F4C81"/>
      <circle cx="12" cy="12" r="6" fill="#00D4AA"/>
      <circle cx="12" cy="12" r="3" fill="#0F4C81"/>
    </svg>
  );
});

// Cohere Logo
export const CohereLogo = memo(function CohereLogo({
  size = 24,
  className = '',
  style,
}: ProviderLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-label="Cohere"
      role="img"
    >
      <rect width="24" height="24" rx="4" fill="#39594D"/>
      <path
        d="M7 7h10v10H7z"
        fill="#FF6B35"
      />
      <circle cx="12" cy="12" r="2" fill="#39594D"/>
    </svg>
  );
});

// HuggingFace Logo
export const HuggingFaceLogo = memo(function HuggingFaceLogo({
  size = 24,
  className = '',
  style,
}: ProviderLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-label="HuggingFace"
      role="img"
    >
      <rect width="24" height="24" rx="4" fill="#FFD21E"/>
      <path
        d="M12 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-4 8c0-2.7 2.3-5 5-5s5 2.3 5 5H8z"
        fill="#FF6B35"
      />
    </svg>
  );
});

// Mistral Logo
export const MistralLogo = memo(function MistralLogo({
  size = 24,
  className = '',
  style,
}: ProviderLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-label="Mistral"
      role="img"
    >
      <rect width="24" height="24" rx="4" fill="#FF7000"/>
      <path
        d="M6 8l6 4-6 4V8zm6 0l6 4-6 4V8z"
        fill="white"
      />
    </svg>
  );
});

// IBM Logo
export const IBMLogo = memo(function IBMLogo({
  size = 24,
  className = '',
  style,
}: ProviderLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-label="IBM"
      role="img"
    >
      <rect width="24" height="24" rx="4" fill="#0F62FE"/>
      <path
        d="M4 6h16v2H4V6zm0 4h16v2H4v-2zm0 4h12v2H4v-2z"
        fill="white"
      />
    </svg>
  );
});

// Generic AI Logo for unknown providers
export const GenericAILogo = memo(function GenericAILogo({
  size = 24,
  className = '',
  style,
}: ProviderLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-label="AI Model"
      role="img"
    >
      <rect width="24" height="24" rx="4" fill="#6B7280"/>
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill="white"
      />
    </svg>
  );
});

// Logo mapping for easy access
export const PROVIDER_LOGOS = {
  anthropic: AnthropicLogo,
  openai: OpenAILogo,
  google: GoogleLogo,
  meta: MetaLogo,
  microsoft: MicrosoftLogo,
  alibaba: AlibabaLogo,
  deepseek: DeepSeekLogo,
  cohere: CohereLogo,
  huggingface: HuggingFaceLogo,
  mistral: MistralLogo,
  ibm: IBMLogo,
  "01ai": GenericAILogo,
  lmsys: GenericAILogo,
  tii: GenericAILogo,
  upstage: GenericAILogo,
  wizardlm: GenericAILogo,
  nousresearch: GenericAILogo,
  nomic: GenericAILogo,
  mixedbread: GenericAILogo,
  snowflake: GenericAILogo,
  other: GenericAILogo,
} as const;

export type ProviderKey = keyof typeof PROVIDER_LOGOS;