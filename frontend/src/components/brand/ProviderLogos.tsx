import type { CSSProperties } from "react";
import {
  Alibaba,
  Anthropic,
  Azure,
  Bedrock,
  Cohere,
  DeepSeek,
  Gemma,
  Gemini,
  Google,
  Groq,
  HuggingFace,
  IBM,
  Meta,
  Microsoft,
  Mistral,
  Moonshot,
  NousResearch,
  Ollama,
  OpenAI,
  OpenRouter,
  Qwen,
  Snowflake,
  SubModel,
  TII,
  Upstage,
  Yi,
  ZeroOne,
} from "@lobehub/icons";

export interface ProviderLogoProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
}

// Use official LobeHub icon set directly (https://lobehub.com/icons).
export const AnthropicLogo = Anthropic;
export const OpenAILogo = OpenAI;
export const OpenRouterLogo = OpenRouter;
export const GroqLogo = Groq;
export const GoogleLogo = Google;
export const GeminiLogo = Gemini;
export const MetaLogo = Meta;
export const MicrosoftLogo = Microsoft;
export const AzureLogo = Azure;
export const BedrockLogo = Bedrock;
export const AlibabaLogo = Alibaba;
export const DeepSeekLogo = DeepSeek;
export const CohereLogo = Cohere;
export const HuggingFaceLogo = HuggingFace;
export const MistralLogo = Mistral;
export const MoonshotLogo = Moonshot;
export const IBMLogo = IBM;
export const SnowflakeLogo = Snowflake;
export const GemmaLogo = Gemma;
export const QwenLogo = Qwen;
export const YiLogo = Yi;
export const NousResearchLogo = NousResearch;
export const UpstageLogo = Upstage;
export const TIILogo = TII;
export const ZeroOneLogo = ZeroOne;
export const OllamaLogo = Ollama;

// Generic fallback from the same icon set.
export const GenericAILogo = SubModel;
