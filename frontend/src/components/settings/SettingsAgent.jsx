import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Brain, Cpu, Sparkles, Zap, ChevronDown, Check, Eye, EyeOff } from "lucide-react";
import ContentSection from "../layout/ContentSection";
import { useToast } from "../../contexts/ToastContext";
import { openExternalLink } from "../../lib/externalLink";
import { PROVIDER_LOGOS, PROVIDER_LOGO_AVATARS } from "../brand";
import {
  getDocumentAiSettings,
  updateDocumentAiSettings,
} from "../../services/api/documentAi";
import {
  getAIProviderConfig,
  getProviderModels,
  getAgentTokenStatus,
  getOllamaCatalog,
  getOllamaPullJob,
  getOllamaStatus,
  pushAgentToken,
  saveAIProviderConfig,
  startOllamaPull,
  startOllamaRuntime,
  testAIProviderConfig,
} from "../../services/api/aiProvider";
import { useLicense } from "../../contexts/LicenseContext";
import {
  fetchAgentToken,
  getOrCreateDeviceId,
} from "../../services/licenseService";

const DISPLAY_PROVIDER_OPTIONS = [
  {
    id: "openai",
    backendType: "openai_compatible",
    hasBaseUrl: true,
    hasApiKey: true,
    placeholderBaseUrl: "baseUrlOpenAI",
    placeholderModel: "modelOpenAI",
    summaryKey: "agent.aiConfig.help.summary.openai",
    baseUrlHintKey: "agent.aiConfig.help.baseUrl.openai",
    apiKeyHintKey: "agent.aiConfig.help.apiKey.standard",
    modelHintKey: "agent.aiConfig.help.model.openai",
  },
  {
    id: "anthropic",
    backendType: "anthropic",
    hasBaseUrl: false,
    hasApiKey: true,
    placeholderBaseUrl: "",
    placeholderModel: "modelAnthropic",
    summaryKey: "agent.aiConfig.help.summary.anthropic",
    baseUrlHintKey: "",
    apiKeyHintKey: "agent.aiConfig.help.apiKey.anthropic",
    modelHintKey: "agent.aiConfig.help.model.anthropic",
  },
  {
    id: "gemini",
    backendType: "gemini",
    hasBaseUrl: false,
    hasApiKey: true,
    placeholderBaseUrl: "",
    placeholderModel: "modelGemini",
    summaryKey: "agent.aiConfig.help.summary.gemini",
    baseUrlHintKey: "",
    apiKeyHintKey: "agent.aiConfig.help.apiKey.gemini",
    modelHintKey: "agent.aiConfig.help.model.gemini",
  },
  {
    id: "ollama",
    backendType: "ollama",
    hasBaseUrl: true,
    hasApiKey: false,
    placeholderBaseUrl: "baseUrlOllama",
    placeholderModel: "modelOllama",
    summaryKey: "agent.aiConfig.help.summary.ollama",
    baseUrlHintKey: "agent.aiConfig.help.baseUrl.ollama",
    apiKeyHintKey: "",
    modelHintKey: "agent.aiConfig.help.model.ollama",
  },
  {
    id: "custom",
    backendType: "custom",
    hasBaseUrl: true,
    hasApiKey: true,
    placeholderBaseUrl: "baseUrlCustom",
    placeholderModel: "modelCustom",
    summaryKey: "agent.aiConfig.help.summary.custom",
    baseUrlHintKey: "agent.aiConfig.help.baseUrl.custom",
    apiKeyHintKey: "agent.aiConfig.help.apiKey.standard",
    modelHintKey: "agent.aiConfig.help.model.custom",
  },
  {
    id: "azure_openai",
    backendType: "",
    hasBaseUrl: true,
    hasApiKey: true,
    placeholderBaseUrl: "baseUrlCustom",
    placeholderModel: "modelCustom",
    summaryKey: "agent.aiConfig.help.summary.azure_openai",
    baseUrlHintKey: "",
    apiKeyHintKey: "",
    modelHintKey: "",
    disabled: true,
  },
  {
    id: "bedrock",
    backendType: "",
    hasBaseUrl: true,
    hasApiKey: true,
    placeholderBaseUrl: "baseUrlCustom",
    placeholderModel: "modelCustom",
    summaryKey: "agent.aiConfig.help.summary.bedrock",
    baseUrlHintKey: "",
    apiKeyHintKey: "",
    modelHintKey: "",
    disabled: true,
  },
];

const PROVIDER_PICKER_ICONS = {
  openai: PROVIDER_LOGOS.openai,
  anthropic: PROVIDER_LOGOS.anthropic,
  gemini: PROVIDER_LOGOS.gemini,
  ollama: PROVIDER_LOGOS.ollama,
  custom: PROVIDER_LOGOS.custom,
  azure_openai: PROVIDER_LOGOS.azure,
  bedrock: PROVIDER_LOGOS.bedrock,
};

const PROVIDER_PICKER_AVATARS = {
  openai: PROVIDER_LOGO_AVATARS.openai,
  anthropic: PROVIDER_LOGO_AVATARS.anthropic,
  gemini: PROVIDER_LOGO_AVATARS.gemini,
  ollama: PROVIDER_LOGO_AVATARS.ollama,
  custom: PROVIDER_LOGO_AVATARS.custom,
  azure_openai: PROVIDER_LOGO_AVATARS.azure,
  bedrock: PROVIDER_LOGO_AVATARS.bedrock,
};

const CUSTOM_PRESETS = [
  {
    id: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
  },
  {
    id: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
  },
  {
    id: "manual",
    baseUrl: "",
  },
];

const CUSTOM_PRESET_ICONS = {
  openrouter: PROVIDER_LOGOS.openrouter,
  groq: PROVIDER_LOGOS.groq,
  manual: PROVIDER_LOGOS.custom,
};

const CUSTOM_PRESET_AVATARS = {
  openrouter: PROVIDER_LOGO_AVATARS.openrouter,
  groq: PROVIDER_LOGO_AVATARS.groq,
  manual: PROVIDER_LOGO_AVATARS.custom,
};

const FALLBACK_OPENAI_BASE_URL = "https://api.openai.com/v1";
const FALLBACK_OLLAMA_BASE_URL = "http://localhost:11434";
const AI_PROVIDER_DRAFT_STORAGE_KEY = "ordinay:settings:ai-provider-draft:v1";
let LAST_OLLAMA_STATUS_CACHE = null;

function readAiProviderDraft() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(AI_PROVIDER_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeAiProviderDraft(payload) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      AI_PROVIDER_DRAFT_STORAGE_KEY,
      JSON.stringify({ ...payload, updated_at: Date.now() }),
    );
  } catch {
    // Ignore storage quota/availability issues.
  }
}

function getApiKeySlotKey(displayProvider, customPreset) {
  const provider = String(displayProvider || "").trim().toLowerCase();
  if (provider === "custom") {
    const preset = String(customPreset || "manual").trim().toLowerCase() || "manual";
    return `custom:${preset}`;
  }
  return provider || "openai";
}

// ── Ollama model metadata ──────────────────────────────────
// Maps known model family prefixes to display metadata.
// Unknown models gracefully fall back to a generic entry.

const MODEL_FAMILIES = {
  openai: { color: "bg-emerald-600", icon: PROVIDER_LOGOS.openai, avatar: PROVIDER_LOGO_AVATARS.openai, vendorKey: "openai" },
  "gpt-oss": { color: "bg-emerald-600", icon: PROVIDER_LOGOS.openai, avatar: PROVIDER_LOGO_AVATARS.openai, vendorKey: "openai" },
  gpt: { color: "bg-emerald-600", icon: PROVIDER_LOGOS.openai, avatar: PROVIDER_LOGO_AVATARS.openai, vendorKey: "openai" },
  chatgpt: { color: "bg-emerald-600", icon: PROVIDER_LOGOS.openai, avatar: PROVIDER_LOGO_AVATARS.openai, vendorKey: "openai" },
  o1: { color: "bg-emerald-700", icon: PROVIDER_LOGOS.openai, avatar: PROVIDER_LOGO_AVATARS.openai, vendorKey: "openai" },
  o3: { color: "bg-emerald-700", icon: PROVIDER_LOGOS.openai, avatar: PROVIDER_LOGO_AVATARS.openai, vendorKey: "openai" },
  o4: { color: "bg-emerald-700", icon: PROVIDER_LOGOS.openai, avatar: PROVIDER_LOGO_AVATARS.openai, vendorKey: "openai" },
  anthropic: { color: "bg-orange-400", icon: PROVIDER_LOGOS.anthropic, avatar: PROVIDER_LOGO_AVATARS.anthropic, vendorKey: "anthropic" },
  claude: { color: "bg-orange-400", icon: PROVIDER_LOGOS.anthropic, avatar: PROVIDER_LOGO_AVATARS.anthropic, vendorKey: "anthropic" },
  grok: { color: "bg-slate-700", icon: PROVIDER_LOGOS.other, avatar: PROVIDER_LOGO_AVATARS.other, vendorKey: "other" },
  xai: { color: "bg-slate-700", icon: PROVIDER_LOGOS.other, avatar: PROVIDER_LOGO_AVATARS.other, vendorKey: "other" },
  google: { color: "bg-cyan-500", icon: PROVIDER_LOGOS.google, avatar: PROVIDER_LOGO_AVATARS.google, vendorKey: "google" },
  gemini: { color: "bg-cyan-500", icon: PROVIDER_LOGOS.gemini, avatar: PROVIDER_LOGO_AVATARS.gemini, vendorKey: "google" },
  gemma: { color: "bg-cyan-500", icon: PROVIDER_LOGOS.gemma, avatar: PROVIDER_LOGO_AVATARS.gemma, vendorKey: "google" },
  gemma2: { color: "bg-cyan-500", icon: PROVIDER_LOGOS.gemma, avatar: PROVIDER_LOGO_AVATARS.gemma, vendorKey: "google" },
  gemma3: { color: "bg-cyan-500", icon: PROVIDER_LOGOS.gemma, avatar: PROVIDER_LOGO_AVATARS.gemma, vendorKey: "google" },
  gemma4: { color: "bg-cyan-500", icon: PROVIDER_LOGOS.gemma, avatar: PROVIDER_LOGO_AVATARS.gemma, vendorKey: "google" },
  llama: { color: "bg-blue-500", icon: PROVIDER_LOGOS.meta, avatar: PROVIDER_LOGO_AVATARS.meta, vendorKey: "meta" },
  "meta-llama": { color: "bg-blue-500", icon: PROVIDER_LOGOS.meta, avatar: PROVIDER_LOGO_AVATARS.meta, vendorKey: "meta" },
  meta: { color: "bg-blue-500", icon: PROVIDER_LOGOS.meta, avatar: PROVIDER_LOGO_AVATARS.meta, vendorKey: "meta" },
  codellama: { color: "bg-blue-600", icon: PROVIDER_LOGOS.meta, avatar: PROVIDER_LOGO_AVATARS.meta, vendorKey: "meta" },
  mistral: { color: "bg-orange-500", icon: PROVIDER_LOGOS.mistral, avatar: PROVIDER_LOGO_AVATARS.mistral, vendorKey: "mistral" },
  mistralai: { color: "bg-orange-500", icon: PROVIDER_LOGOS.mistral, avatar: PROVIDER_LOGO_AVATARS.mistral, vendorKey: "mistral" },
  mixtral: { color: "bg-orange-400", icon: PROVIDER_LOGOS.mistral, avatar: PROVIDER_LOGO_AVATARS.mistral, vendorKey: "mistral" },
  microsoft: { color: "bg-teal-500", icon: PROVIDER_LOGOS.microsoft, avatar: PROVIDER_LOGO_AVATARS.microsoft, vendorKey: "microsoft" },
  phi: { color: "bg-teal-500", icon: PROVIDER_LOGOS.microsoft, avatar: PROVIDER_LOGO_AVATARS.microsoft, vendorKey: "microsoft" },
  phi3: { color: "bg-teal-500", icon: PROVIDER_LOGOS.microsoft, avatar: PROVIDER_LOGO_AVATARS.microsoft, vendorKey: "microsoft" },
  phi4: { color: "bg-teal-500", icon: PROVIDER_LOGOS.microsoft, avatar: PROVIDER_LOGO_AVATARS.microsoft, vendorKey: "microsoft" },
  qwen: { color: "bg-purple-500", icon: PROVIDER_LOGOS.qwen, avatar: PROVIDER_LOGO_AVATARS.qwen, vendorKey: "alibaba" },
  qwen2: { color: "bg-purple-500", icon: PROVIDER_LOGOS.qwen, avatar: PROVIDER_LOGO_AVATARS.qwen, vendorKey: "alibaba" },
  "qwen2.5": { color: "bg-purple-500", icon: PROVIDER_LOGOS.qwen, avatar: PROVIDER_LOGO_AVATARS.qwen, vendorKey: "alibaba" },
  qwen3: { color: "bg-purple-500", icon: PROVIDER_LOGOS.qwen, avatar: PROVIDER_LOGO_AVATARS.qwen, vendorKey: "alibaba" },
  deepseek: { color: "bg-indigo-500", icon: PROVIDER_LOGOS.deepseek, avatar: PROVIDER_LOGO_AVATARS.deepseek, vendorKey: "deepseek" },
  "deepseek-coder": { color: "bg-indigo-600", icon: PROVIDER_LOGOS.deepseek, avatar: PROVIDER_LOGO_AVATARS.deepseek, vendorKey: "deepseek" },
  "deepseek-r1": { color: "bg-indigo-400", icon: PROVIDER_LOGOS.deepseek, avatar: PROVIDER_LOGO_AVATARS.deepseek, vendorKey: "deepseek" },
  command: { color: "bg-green-500", icon: PROVIDER_LOGOS.cohere, avatar: PROVIDER_LOGO_AVATARS.cohere, vendorKey: "cohere" },
  "command-r": { color: "bg-green-500", icon: PROVIDER_LOGOS.cohere, avatar: PROVIDER_LOGO_AVATARS.cohere, vendorKey: "cohere" },
  starcoder: { color: "bg-yellow-500", icon: PROVIDER_LOGOS.huggingface, avatar: PROVIDER_LOGO_AVATARS.huggingface, vendorKey: "huggingface" },
  codegemma: { color: "bg-cyan-600", icon: PROVIDER_LOGOS.google, avatar: PROVIDER_LOGO_AVATARS.google, vendorKey: "google" },
  kimi: { color: "bg-fuchsia-500", icon: PROVIDER_LOGOS.kimi, avatar: PROVIDER_LOGO_AVATARS.kimi, vendorKey: "moonshot" },
  moonshot: { color: "bg-fuchsia-500", icon: PROVIDER_LOGOS.moonshot, avatar: PROVIDER_LOGO_AVATARS.moonshot, vendorKey: "moonshot" },
  yi: { color: "bg-rose-500", icon: PROVIDER_LOGOS.yi, avatar: PROVIDER_LOGO_AVATARS.yi, vendorKey: "01ai" },
  solar: { color: "bg-amber-500", icon: PROVIDER_LOGOS.upstage, avatar: PROVIDER_LOGO_AVATARS.upstage, vendorKey: "upstage" },
  vicuna: { color: "bg-slate-500", icon: PROVIDER_LOGOS.lmsys, avatar: PROVIDER_LOGO_AVATARS.lmsys, vendorKey: "lmsys" },
  falcon: { color: "bg-sky-500", icon: PROVIDER_LOGOS.tii, avatar: PROVIDER_LOGO_AVATARS.tii, vendorKey: "tii" },
  orca: { color: "bg-blue-400", icon: PROVIDER_LOGOS.microsoft, avatar: PROVIDER_LOGO_AVATARS.microsoft, vendorKey: "microsoft" },
  wizardlm: { color: "bg-violet-500", icon: PROVIDER_LOGOS.wizardlm, avatar: PROVIDER_LOGO_AVATARS.wizardlm, vendorKey: "wizardlm" },
  nous: { color: "bg-red-500", icon: PROVIDER_LOGOS.nousresearch, avatar: PROVIDER_LOGO_AVATARS.nousresearch, vendorKey: "nousresearch" },
  "nous-hermes": { color: "bg-red-500", icon: PROVIDER_LOGOS.nousresearch, avatar: PROVIDER_LOGO_AVATARS.nousresearch, vendorKey: "nousresearch" },
  nomic: { color: "bg-gray-500", icon: PROVIDER_LOGOS.nomic, avatar: PROVIDER_LOGO_AVATARS.nomic, vendorKey: "nomic" },
  mxbai: { color: "bg-gray-500", icon: PROVIDER_LOGOS.mixedbread, avatar: PROVIDER_LOGO_AVATARS.mixedbread, vendorKey: "mixedbread" },
  snowflake: { color: "bg-sky-400", icon: PROVIDER_LOGOS.snowflake, avatar: PROVIDER_LOGO_AVATARS.snowflake, vendorKey: "snowflake" },
  ibm: { color: "bg-stone-500", icon: PROVIDER_LOGOS.ibm, avatar: PROVIDER_LOGO_AVATARS.ibm, vendorKey: "ibm" },
  granite: { color: "bg-stone-500", icon: PROVIDER_LOGOS.ibm, avatar: PROVIDER_LOGO_AVATARS.ibm, vendorKey: "ibm" },
};

const FALLBACK_FAMILY = { color: "bg-slate-400", icon: PROVIDER_LOGOS.other, avatar: PROVIDER_LOGO_AVATARS.other, vendorKey: "other" };
const MODEL_PROVIDER_PREFIX_FAMILY = {
  openai: MODEL_FAMILIES.openai,
  anthropic: MODEL_FAMILIES.anthropic,
  meta: MODEL_FAMILIES.meta,
  "meta-llama": MODEL_FAMILIES["meta-llama"],
  google: MODEL_FAMILIES.google,
  gemini: MODEL_FAMILIES.gemini,
  mistral: MODEL_FAMILIES.mistral,
  mistralai: MODEL_FAMILIES.mistralai,
  cohere: MODEL_FAMILIES.command,
  deepseek: MODEL_FAMILIES.deepseek,
  alibaba: MODEL_FAMILIES.qwen,
  qwen: MODEL_FAMILIES.qwen,
  moonshot: MODEL_FAMILIES.moonshot,
  kimi: MODEL_FAMILIES.kimi,
  microsoft: MODEL_FAMILIES.microsoft,
  ibm: MODEL_FAMILIES.ibm,
  snowflake: MODEL_FAMILIES.snowflake,
};

// Size tier thresholds in billions of parameters
const SIZE_TIERS = [
  { maxB: 3, tierKey: "small" },
  { maxB: 10, tierKey: "medium" },
  { maxB: 35, tierKey: "large" },
  { maxB: 80, tierKey: "xlarge" },
  { maxB: Infinity, tierKey: "xxlarge" },
];

function parseOllamaModel(rawName) {
  const name = String(rawName || "").trim();
  const [baseName, tag] = name.includes(":") ? name.split(":", 2) : [name, "latest"];
  const normalizedBaseName = baseName.toLowerCase();
  const pathParts = normalizedBaseName.split("/").filter(Boolean);
  const providerPrefix = pathParts[0] || "";
  const modelPart = pathParts.length > 1 ? pathParts.slice(1).join("/") : normalizedBaseName;

  // 1) Prefer explicit provider prefix (e.g. openai/gpt-4o, meta-llama/llama-3.3).
  let family = MODEL_PROVIDER_PREFIX_FAMILY[providerPrefix] || null;

  // 2) Match longest known family key against model segment first, then whole value.
  let familyKey = null;
  let matchLen = 0;
  for (const key of Object.keys(MODEL_FAMILIES)) {
    if (
      modelPart.startsWith(key) ||
      normalizedBaseName.startsWith(key) ||
      normalizedBaseName.includes(`/${key}`)
    ) {
      if (key.length <= matchLen) continue;
      familyKey = key;
      matchLen = key.length;
    }
  }
  if (!family && familyKey) {
    family = MODEL_FAMILIES[familyKey];
  }
  if (!family) {
    family = FALLBACK_FAMILY;
  }

  // Extract parameter count from tag (e.g. "8b", "70b", "1.5b")
  const sizeMatch = tag.match(/([\d.]+)b/i);
  const paramB = sizeMatch ? parseFloat(sizeMatch[1]) : null;
  const tier = paramB !== null
    ? SIZE_TIERS.find((t) => paramB <= t.maxB) || SIZE_TIERS[SIZE_TIERS.length - 1]
    : null;

  return {
    raw: name,
    baseName,
    tag,
    familyKey: familyKey || baseName.toLowerCase(),
    family,
    paramB,
    tier,
    displayName: baseName,
    sizeLabel: paramB !== null ? `${paramB}B` : null,
  };
}

function groupAndSortModels(modelNames) {
  const parsed = modelNames.map(parseOllamaModel);
  // Group by vendor
  const groups = {};
  for (const m of parsed) {
    const vendor = m.family.vendorKey;
    if (!groups[vendor]) groups[vendor] = [];
    groups[vendor].push(m);
  }
  // Sort models within each group by size descending
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => (b.paramB || 0) - (a.paramB || 0));
  }
  // Sort groups: put groups with more models first, "other" last
  return Object.entries(groups).sort(([a, modelsA], [b, modelsB]) => {
    if (a === "other") return 1;
    if (b === "other") return -1;
    return modelsB.length - modelsA.length;
  });
}

function normalizeOllamaBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
}

function isLocalOllamaEndpoint(value) {
  const normalized = normalizeOllamaBaseUrl(value);
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    const host = String(parsed.hostname || "").trim().toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    const raw = normalized.toLowerCase();
    return raw.includes("127.0.0.1") || raw.includes("localhost") || raw.includes("::1");
  }
}

function sanitizeOllamaBaseUrl(value) {
  const normalized = normalizeOllamaBaseUrl(value || "");
  if (!normalized) return FALLBACK_OLLAMA_BASE_URL;
  return isLocalOllamaEndpoint(normalized) ? normalized : FALLBACK_OLLAMA_BASE_URL;
}

function getCustomPresetValue(presetId) {
  const row = CUSTOM_PRESETS.find((preset) => preset.id === presetId);
  return row ? row.baseUrl : "";
}

function normalizeCustomPreset(preset, baseUrl) {
  const normalizedPreset = String(preset || "").trim().toLowerCase();
  if (normalizedPreset === "openrouter" || normalizedPreset === "groq" || normalizedPreset === "manual") {
    return normalizedPreset;
  }
  const normalizedBaseUrl = String(baseUrl || "").trim().toLowerCase();
  if (normalizedBaseUrl.includes("openrouter.ai")) return "openrouter";
  if (normalizedBaseUrl.includes("groq.com")) return "groq";
  return "manual";
}

function mapBackendToDisplayProvider(providerType) {
  const normalized = String(providerType || "").trim().toLowerCase();
  if (normalized === "openai_compatible") return "openai";
  if (normalized === "custom") return "custom";
  if (normalized === "ollama") return "ollama";
  if (normalized === "anthropic") return "anthropic";
  if (normalized === "gemini") return "gemini";
  return "openai";
}

function getSourceBadge(t, source) {
  if (source === "database") {
    return {
      label: t("agent.aiConfig.source.saved"),
      className:
        "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800",
      note: t("agent.aiConfig.source.savedNote"),
    };
  }
  if (source === "native_fallback") {
    return null;
  }
  return {
    label: t("agent.aiConfig.source.notConfigured"),
    className:
      "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    note: t("agent.aiConfig.source.notConfiguredNote"),
  };
}

function getHelpLinks(displayProvider, customPreset) {
  if (displayProvider === "openai") {
    return ["openaiKeys", "openaiModels"];
  }
  if (displayProvider === "ollama") {
    return ["ollamaInstall", "ollamaLibrary"];
  }
  if (displayProvider === "anthropic") {
    return ["anthropicKeys", "anthropicModels"];
  }
  if (displayProvider === "gemini") {
    return ["geminiKey", "geminiModels"];
  }
  if (displayProvider === "custom") {
    if (customPreset === "openrouter") return ["openrouterKeys", "openaiFormat"];
    if (customPreset === "groq") return ["groqKeys", "openaiFormat"];
    return ["openaiFormat"];
  }
  return [];
}

function getLinkUrl(linkKey) {
  if (linkKey === "openaiKeys") return "https://platform.openai.com/api-keys";
  if (linkKey === "openaiModels") return "https://platform.openai.com/docs/models";
  if (linkKey === "openrouterKeys") return "https://openrouter.ai/keys";
  if (linkKey === "groqKeys") return "https://console.groq.com/keys";
  if (linkKey === "ollamaInstall") return "https://ollama.com/download";
  if (linkKey === "ollamaLibrary") return "https://ollama.com/library";
  if (linkKey === "anthropicKeys") return "https://console.anthropic.com/settings/keys";
  if (linkKey === "anthropicModels")
    return "https://docs.anthropic.com/en/docs/about-claude/models/overview";
  if (linkKey === "geminiKey") return "https://aistudio.google.com/apikey";
  if (linkKey === "geminiModels") return "https://ai.google.dev/gemini-api/docs/models";
  return "https://platform.openai.com/docs/api-reference/chat";
}

function getOllamaStatusVariant(status) {
  if (status === "ready") {
    return "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300";
  }
  if (status === "running_no_models") {
    return "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300";
  }
  if (status === "api_mismatch") {
    return "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-300";
  }
  return "bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-300";
}

function getCompatibilityBadgeClass(level) {
  const normalized = String(level || "unknown").toLowerCase();
  if (normalized === "good") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800";
  }
  if (normalized === "limited") {
    return "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800";
  }
  if (normalized === "unlikely") {
    return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800";
  }
  if (normalized === "cloud") {
    return "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800";
  }
  return "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function resolveBaseUrlForSubmit(displayProvider, customPreset, baseUrl) {
  const normalized = String(baseUrl || "").trim();
  if (displayProvider === "openai") {
    return normalized || FALLBACK_OPENAI_BASE_URL;
  }
  if (displayProvider === "ollama") {
    return sanitizeOllamaBaseUrl(normalized || FALLBACK_OLLAMA_BASE_URL);
  }
  if (displayProvider === "custom") {
    if (customPreset === "openrouter" || customPreset === "groq") {
      return getCustomPresetValue(customPreset);
    }
    return normalized;
  }
  return "";
}

function getOllamaInstallValue(t, installed) {
  if (installed === true) return t("agent.aiConfig.ollamaStatus.values.yes");
  if (installed === false) return t("agent.aiConfig.ollamaStatus.values.no");
  return t("agent.aiConfig.ollamaStatus.values.unknown");
}

function ProviderPicker({ t, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selected =
    options.find((provider) => provider.id === value) || options[0];
  const SelectedAvatar =
    PROVIDER_PICKER_AVATARS[selected?.id] || PROVIDER_LOGO_AVATARS.other;

  return (
    <div className="relative w-full max-w-xl" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center gap-3 px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-left hover:border-slate-400 dark:hover:border-slate-500 transition-colors"
      >
        <div className="flex-shrink-0">
          <SelectedAvatar size={28} />
        </div>
        <span className="text-sm font-medium text-slate-900 dark:text-white flex-1 truncate">
          {selected ? t(`agent.aiConfig.provider.${selected.id}`) : ""}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-hidden">
          {options.map((provider) => {
            const AvatarComp =
              PROVIDER_PICKER_AVATARS[provider.id] || PROVIDER_LOGO_AVATARS.other;
            const isSelected = provider.id === value;
            const disabled = Boolean(provider.disabled);
            return (
              <button
                key={provider.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  onChange(provider.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                  disabled
                    ? "opacity-55 cursor-not-allowed"
                    : "hover:bg-slate-50 dark:hover:bg-slate-700/50"
                } ${isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
              >
                <div className="flex-shrink-0">
                  <AvatarComp size={28} />
                </div>
                <span className="text-sm text-slate-900 dark:text-white flex-1 truncate">
                  {t(`agent.aiConfig.provider.${provider.id}`)}
                </span>
                {disabled && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400">
                    {t("agent.aiConfig.provider.comingSoon")}
                  </span>
                )}
                {isSelected && (
                  <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Ollama Model Picker (rich grouped UI) ──────────────────

function OllamaModelPicker({ t, displayProvider, ollamaModels, model, setModel, selectedProvider }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef(null);

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const handleClick = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [pickerOpen]);

  const hasOllamaModels = displayProvider === "ollama" && ollamaModels?.length > 0;

  if (!hasOllamaModels) {
    const isOllama = displayProvider === "ollama";
    return (
      <div>
        <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">
          {t("agent.aiConfig.fields.model")}
        </label>
        <input
          type="text"
          value={model}
          onChange={(e) => {
            if (isOllama) return;
            setModel(e.target.value);
          }}
          readOnly={isOllama}
          disabled={isOllama}
          placeholder={t(
            `agent.aiConfig.fields.placeholders.${selectedProvider.placeholderModel}`,
          )}
          className={`w-full max-w-xl px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 ${
            isOllama
              ? "bg-slate-100 dark:bg-slate-900/50 cursor-not-allowed opacity-80"
              : "bg-white dark:bg-slate-800"
          }`}
        />
        {isOllama ? (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            {t("agent.aiConfig.ollamaCatalog.toolOnlyBlock", {
              defaultValue:
                "Only tool-capable Ollama models can be selected. Install/add one from Browse Ollama Models.",
            })}
          </p>
        ) : selectedProvider.modelHintKey ? (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t(selectedProvider.modelHintKey)}
          </p>
        ) : null}
      </div>
    );
  }

  const groups = groupAndSortModels(ollamaModels);
  const selectedParsed = model ? parseOllamaModel(model) : null;

  return (
    <div>
      <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">
        {t("agent.aiConfig.fields.model")}
      </label>

      {/* Trigger button */}
      <div className="relative max-w-xl" ref={pickerRef}>
        <button
          type="button"
          onClick={() => setPickerOpen(!pickerOpen)}
          className="w-full flex items-center gap-3 px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-left hover:border-slate-400 dark:hover:border-slate-500 transition-colors"
        >
          {selectedParsed ? (
            <>
              {(() => {
                const SelAvatar = selectedParsed.family.avatar;
                const SelIcon = selectedParsed.family.icon;
                return SelAvatar
                  ? <div className="flex-shrink-0"><SelAvatar size={28} /></div>
                  : <div className="w-7 h-7 rounded-md bg-white flex items-center justify-center flex-shrink-0"><SelIcon size={20} /></div>;
              })()}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-slate-900 dark:text-white truncate block">
                  {selectedParsed.displayName}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {t(`agent.aiConfig.modelPicker.vendor.${selectedParsed.family.vendorKey}`, selectedParsed.family.vendorKey)}
                  {selectedParsed.sizeLabel ? ` · ${selectedParsed.sizeLabel}` : ""}
                  {selectedParsed.tag !== "latest" ? ` · ${selectedParsed.tag}` : ""}
                </span>
              </div>
            </>
          ) : (
            <span className="text-sm text-slate-400">
              {t("agent.aiConfig.modelPicker.placeholder")}
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${pickerOpen ? "rotate-180" : ""}`} />
        </button>

        {/* Dropdown panel */}
        {pickerOpen && (
          <div className="absolute z-50 mt-1 w-full max-h-80 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
            {groups.map(([vendorKey, models]) => (
              <div key={vendorKey}>
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900/40 sticky top-0">
                  {t(`agent.aiConfig.modelPicker.vendor.${vendorKey}`, vendorKey)}
                </div>
                {models.map((m) => {
                  const isSelected = m.raw === model;
                  const AvatarComp = m.family.avatar || m.family.icon;
                  return (
                    <button
                      key={m.raw}
                      type="button"
                      onClick={() => { setModel(m.raw); setPickerOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
                    >
                      <div className="flex-shrink-0">
                        <AvatarComp size={28} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-slate-900 dark:text-white truncate block">
                          {m.displayName}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {m.sizeLabel ? `${m.sizeLabel} · ` : ""}
                          {m.tier ? t(`agent.aiConfig.modelPicker.tier.${m.tier.tierKey}`, m.tier.tierKey) : ""}
                          {m.tag !== "latest" ? ` · ${m.tag}` : ""}
                        </span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {t("agent.aiConfig.modelPicker.hint", { count: ollamaModels.length })}
      </p>
    </div>
  );
}

export default function SettingsAgent() {
  const { t } = useTranslation(["settings"]);
  const { showToast } = useToast();
  const { licenseState, licenseData } = useLicense();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formatPreference, setFormatPreference] = useState("auto");

  const [aiLoading, setAiLoading] = useState(true);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiMode, setAiMode] = useState("byok");
  const [displayProvider, setDisplayProvider] = useState("openai");
  const [customPreset, setCustomPreset] = useState("manual");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiKeysBySlot, setApiKeysBySlot] = useState({});
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const [model, setModel] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [configSource, setConfigSource] = useState(null);
  const [ollamaStatus, setOllamaStatus] = useState(() => LAST_OLLAMA_STATUS_CACHE);
  const [ollamaStatusLoading, setOllamaStatusLoading] = useState(false);
  const [ollamaActionBusy, setOllamaActionBusy] = useState(false);
  const [ollamaFastPoll, setOllamaFastPoll] = useState(false);
  const [ollamaCatalog, setOllamaCatalog] = useState([]);
  const [ollamaCatalogHardware, setOllamaCatalogHardware] = useState(null);
  const [ollamaCatalogLoading, setOllamaCatalogLoading] = useState(false);
  const [ollamaCatalogQuery, setOllamaCatalogQuery] = useState("");
  const [ollamaPullJobId, setOllamaPullJobId] = useState("");
  const [ollamaPullJob, setOllamaPullJob] = useState(null);
  const [ollamaPullStartingModel, setOllamaPullStartingModel] = useState("");
  const [ollamaCatalogExpanded, setOllamaCatalogExpanded] = useState({});
  const [ollamaToolModels, setOllamaToolModels] = useState([]);
  const [cloudCatalog, setCloudCatalog] = useState([]);
  const [cloudCatalogLoading, setCloudCatalogLoading] = useState(false);
  const [cloudCatalogQuery, setCloudCatalogQuery] = useState("");
  const [cloudCatalogError, setCloudCatalogError] = useState("");
  const [ordinayTokenStatus, setOrdinayTokenStatus] = useState(null);
  const [ordinayAuthenticating, setOrdinayAuthenticating] = useState(false);
  const aiDraftHydratedRef = useRef(false);
  const formatHydratedRef = useRef(false);
  const aiConfigHydratedRef = useRef(false);
  const lastAiConfigFingerprintRef = useRef("");
  const lastAiConfigFailedFingerprintRef = useRef("");
  const lastFormatSavedRef = useRef("");

  const isLicenseActive = licenseState === "ACTIVE";

  const selectedProvider = useMemo(
    () =>
      DISPLAY_PROVIDER_OPTIONS.find((provider) => provider.id === displayProvider) ||
      DISPLAY_PROVIDER_OPTIONS[0],
    [displayProvider],
  );

  const helpLinkKeys = useMemo(
    () => getHelpLinks(displayProvider, customPreset),
    [displayProvider, customPreset],
  );
  const apiKeySlotKey = useMemo(
    () => getApiKeySlotKey(displayProvider, customPreset),
    [displayProvider, customPreset],
  );
  const cloudCatalogSupported =
    aiMode === "byok" &&
    (displayProvider === "openai" ||
      displayProvider === "custom" ||
      displayProvider === "anthropic" ||
      displayProvider === "gemini");

  const setCachedOllamaStatus = useCallback((nextStatus) => {
    LAST_OLLAMA_STATUS_CACHE = nextStatus;
    setOllamaStatus(nextStatus);
  }, []);

  const refreshOllamaStatus = useCallback(
    async ({ showLoader = false } = {}) => {
      if (aiMode !== "byok" || displayProvider !== "ollama") {
        return;
      }
      if (showLoader) {
        setOllamaStatusLoading(true);
      }
      try {
        const status = await getOllamaStatus(baseUrl);
        setCachedOllamaStatus(status);
      } catch (error) {
        setCachedOllamaStatus({
          base_url: baseUrl || FALLBACK_OLLAMA_BASE_URL,
          installed: null,
          running: false,
          models: [],
          model_count: 0,
          status: "not_running",
          error: error?.message || String(error || "Unknown status error"),
        });
      } finally {
        if (showLoader) {
          setOllamaStatusLoading(false);
        }
      }
    },
    [aiMode, displayProvider, baseUrl, setCachedOllamaStatus],
  );

  const refreshOllamaCatalog = useCallback(
    async ({ showLoader = true } = {}) => {
      if (aiMode !== "byok" || displayProvider !== "ollama") {
        return;
      }
      if (showLoader) {
        setOllamaCatalogLoading(true);
      }
      try {
        const result = await getOllamaCatalog(ollamaCatalogQuery, 120, baseUrl);
        if (result?.ok) {
          setOllamaCatalog(Array.isArray(result.models) ? result.models : []);
          setOllamaCatalogHardware(result.hardware || null);
        } else {
          setOllamaCatalog([]);
          setOllamaCatalogHardware(null);
        }
      } catch {
        setOllamaCatalog([]);
        setOllamaCatalogHardware(null);
      } finally {
        if (showLoader) {
          setOllamaCatalogLoading(false);
        }
      }
    },
    [aiMode, displayProvider, ollamaCatalogQuery, baseUrl],
  );

  const refreshCloudCatalog = useCallback(
    async ({ showLoader = true } = {}) => {
      if (!cloudCatalogSupported) return;
      if (!selectedProvider.hasApiKey) return;
      if (!String(apiKey || "").trim()) {
        setCloudCatalog([]);
        setCloudCatalogError("");
        return;
      }
      if (showLoader) {
        setCloudCatalogLoading(true);
      }
      setCloudCatalogError("");
      try {
        const submitBaseUrl = resolveBaseUrlForSubmit(displayProvider, customPreset, baseUrl);
        const result = await getProviderModels({
          provider_type: selectedProvider.backendType,
          base_url: submitBaseUrl,
          api_key: apiKey,
        });
        if (result?.ok) {
          setCloudCatalog(Array.isArray(result.models) ? result.models : []);
          return;
        }
        setCloudCatalog([]);
        setCloudCatalogError(
          String(result?.error || t("agent.aiConfig.cloudCatalog.fetchFailed", { defaultValue: "Failed to fetch provider models." })),
        );
      } catch (error) {
        setCloudCatalog([]);
        setCloudCatalogError(
          String(error?.message || t("agent.aiConfig.cloudCatalog.fetchFailed", { defaultValue: "Failed to fetch provider models." })),
        );
      } finally {
        if (showLoader) {
          setCloudCatalogLoading(false);
        }
      }
    },
    [apiKey, baseUrl, cloudCatalogSupported, customPreset, displayProvider, selectedProvider.backendType, selectedProvider.hasApiKey, t],
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const remoteSettings = await getDocumentAiSettings();
        if (!mounted) return;
        const initialFormat = remoteSettings.document_output_format_preference || "auto";
        setFormatPreference(initialFormat);
        lastFormatSavedRef.current = initialFormat;
        formatHydratedRef.current = true;
      } catch (error) {
        console.error("[SettingsAgent] Failed to load agent settings:", error);
        showToast(t("agent.toast.loadError"), "error");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [showToast, t]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const config = await getAIProviderConfig();
        if (!mounted) return;

        const resolvedDisplayProvider =
          String(config.provider_display || "").trim() ||
          mapBackendToDisplayProvider(config.provider_type);
        setDisplayProvider(resolvedDisplayProvider);

        if (resolvedDisplayProvider === "custom") {
          setCustomPreset(normalizeCustomPreset(config.provider_preset, config.base_url));
        } else {
          setCustomPreset("manual");
        }

        if (config.provider_type === "ordinay") {
          setAiMode("ordinay");
          setModel("ordinay-default");
          setConfigSource(config.source || null);
          // Check token status
          try {
            const tokenStatus = await getAgentTokenStatus();
            setOrdinayTokenStatus(tokenStatus);
          } catch { /* ignore */ }
        } else if (config.provider_type || config.base_url || config.model) {
          if (resolvedDisplayProvider === "ollama") {
            setBaseUrl(sanitizeOllamaBaseUrl(config.base_url || ""));
          } else {
            setBaseUrl(config.base_url || "");
          }
          const backendApiKeyValue = String(config.api_key_masked || "");
          const initialSlotKey = getApiKeySlotKey(
            resolvedDisplayProvider,
            resolvedDisplayProvider === "custom"
              ? normalizeCustomPreset(config.provider_preset, config.base_url)
              : "manual",
          );
          setApiKeysBySlot((prev) => ({
            ...prev,
            [initialSlotKey]: backendApiKeyValue,
          }));
          setApiKey(backendApiKeyValue);
          setModel(config.model || "");
        }
        setConfigSource(config.source || null);

        const draft = readAiProviderDraft();
        if (draft && typeof draft === "object") {
          const nextMode = String(draft.aiMode || "").trim();
          if (nextMode === "byok" || nextMode === "ordinay") {
            setAiMode(nextMode);
          }

          const nextDisplayProvider = String(draft.displayProvider || "").trim();
          if (DISPLAY_PROVIDER_OPTIONS.some((row) => row.id === nextDisplayProvider && !row.disabled)) {
            setDisplayProvider(nextDisplayProvider);
          }

          const nextCustomPreset = String(draft.customPreset || "").trim();
          if (["openrouter", "groq", "manual"].includes(nextCustomPreset)) {
            setCustomPreset(nextCustomPreset);
          }

          const nextBaseUrl = String(draft.baseUrl || "").trim();
          if (nextBaseUrl) {
            if (nextDisplayProvider === "ollama") {
              setBaseUrl(sanitizeOllamaBaseUrl(nextBaseUrl));
            } else {
              setBaseUrl(nextBaseUrl);
            }
          }

          if (typeof draft.apiKey === "string") {
            setApiKey(draft.apiKey);
          }
          if (draft.apiKeysBySlot && typeof draft.apiKeysBySlot === "object") {
            setApiKeysBySlot((prev) => ({
              ...prev,
              ...draft.apiKeysBySlot,
            }));
          }

          const nextModel = String(draft.model || "").trim();
          if (nextModel) {
            setModel(nextModel);
          }
        }
      } catch (error) {
        console.error("[SettingsAgent] Failed to load AI config:", error);
      } finally {
        aiDraftHydratedRef.current = true;
        aiConfigHydratedRef.current = true;
        if (mounted) setAiLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!aiDraftHydratedRef.current) return;
    writeAiProviderDraft({
      aiMode,
      displayProvider,
      customPreset,
      baseUrl,
      apiKey,
      apiKeysBySlot,
      model,
    });
  }, [aiMode, displayProvider, customPreset, baseUrl, apiKey, apiKeysBySlot, model]);

  useEffect(() => {
    if (!aiDraftHydratedRef.current || aiLoading) return;
    const slotValue = String(apiKeysBySlot?.[apiKeySlotKey] || "");
    setApiKey(slotValue);
  }, [aiLoading, apiKeySlotKey, apiKeysBySlot]);

  useEffect(() => {
    if (!formatHydratedRef.current || loading) return undefined;
    if (formatPreference === lastFormatSavedRef.current) return undefined;

    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        const updated = await updateDocumentAiSettings({
          document_output_format_preference: formatPreference,
        });
        const savedValue = updated.document_output_format_preference || "auto";
        setFormatPreference(savedValue);
        lastFormatSavedRef.current = savedValue;
      } catch (error) {
        console.error("[SettingsAgent] Failed to auto-save agent settings:", error);
      } finally {
        setSaving(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [formatPreference, loading]);

  useEffect(() => {
    if (aiMode !== "byok" || displayProvider !== "ollama") {
      setOllamaStatus(null);
      setOllamaStatusLoading(false);
      setOllamaToolModels([]);
      setOllamaCatalog([]);
      setOllamaCatalogHardware(null);
      setOllamaCatalogLoading(false);
      setOllamaPullJobId("");
      setOllamaPullJob(null);
      setOllamaPullStartingModel("");
      return undefined;
    }

    if (LAST_OLLAMA_STATUS_CACHE) {
      setOllamaStatus(LAST_OLLAMA_STATUS_CACHE);
    }

    let cancelled = false;
    refreshOllamaStatus({ showLoader: true });

    const pollMs = ollamaFastPoll ? 1000 : 5000;
    const interval = setInterval(() => {
      if (!cancelled) {
        refreshOllamaStatus({ showLoader: false });
      }
    }, pollMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [aiMode, displayProvider, refreshOllamaStatus, ollamaFastPoll]);

  useEffect(() => {
    if (aiMode !== "byok" || displayProvider !== "ollama") {
      setOllamaToolModels([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await getProviderModels({
          provider_type: "ollama",
          base_url: sanitizeOllamaBaseUrl(baseUrl),
        });
        if (cancelled) return;
        const ids = Array.isArray(result?.models)
          ? result.models.map((m) => String(m?.id || "").trim()).filter(Boolean)
          : [];
        setOllamaToolModels(ids);
      } catch {
        if (!cancelled) setOllamaToolModels([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [aiMode, displayProvider, baseUrl, ollamaStatus?.running]);

  useEffect(() => {
    if (aiMode !== "byok" || displayProvider !== "ollama") return undefined;
    const handle = setTimeout(() => {
      refreshOllamaCatalog({ showLoader: true });
    }, 250);
    return () => clearTimeout(handle);
  }, [aiMode, displayProvider, ollamaCatalogQuery, refreshOllamaCatalog]);

  useEffect(() => {
    if (!cloudCatalogSupported) {
      setCloudCatalog([]);
      setCloudCatalogLoading(false);
      setCloudCatalogError("");
      setCloudCatalogQuery("");
      return undefined;
    }
    if (!String(apiKey || "").trim()) {
      setCloudCatalog([]);
      setCloudCatalogError("");
      return undefined;
    }
    const handle = setTimeout(() => {
      refreshCloudCatalog({ showLoader: true });
    }, 350);
    return () => clearTimeout(handle);
  }, [cloudCatalogSupported, apiKey, baseUrl, customPreset, refreshCloudCatalog]);

  useEffect(() => {
    if (!ollamaPullJobId) return undefined;
    let cancelled = false;

    const tick = async () => {
      try {
        const result = await getOllamaPullJob(ollamaPullJobId);
        if (cancelled || !result?.ok || !result.job) return;
        setOllamaPullJob(result.job);

        if (result.job.done) {
          setOllamaPullJobId("");
          if (result.job.error) {
            showToast(
              t("agent.aiConfig.ollamaCatalog.pullFailed", {
                defaultValue: `Failed to download ${result.job.model}: ${result.job.error}`,
                model: result.job.model,
                error: result.job.error,
              }),
              "error",
            );
          } else {
            showToast(
              t("agent.aiConfig.ollamaCatalog.pullSuccess", {
                defaultValue: `Downloaded ${result.job.model} successfully`,
                model: result.job.model,
              }),
              "success",
            );
            setModel(result.job.model);
          }
          setOllamaPullStartingModel("");
          await refreshOllamaStatus({ showLoader: true });
        }
      } catch {
        // Ignore transient poll errors; next tick will retry.
      }
    };

    tick();
    const interval = setInterval(tick, 1200);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [ollamaPullJobId, refreshOllamaStatus, showToast, t]);

  // Stop fast polling once Ollama is running OR after 20s timeout
  useEffect(() => {
    if (!ollamaFastPoll) return undefined;
    if (ollamaStatus?.running) {
      setOllamaFastPoll(false);
      return undefined;
    }
    const timeout = setTimeout(() => setOllamaFastPoll(false), 20000);
    return () => clearTimeout(timeout);
  }, [ollamaFastPoll, ollamaStatus?.running]);

  // Auto-select first model when models become available
  useEffect(() => {
    if (
      displayProvider === "ollama" &&
      ollamaToolModels?.length > 0 &&
      !model
    ) {
      setModel(ollamaToolModels[0]);
    }
  }, [displayProvider, ollamaToolModels, model]);

  const testAiConfig = async () => {
    if (selectedProvider.disabled) {
      return;
    }
    if (displayProvider === "ollama" && !isOllamaModelAllowed) {
      setTestResult({
        ok: false,
        error: t("agent.aiConfig.ollamaCatalog.toolOnlyBlock", {
          defaultValue:
            "Only tool-capable Ollama models can be selected. Install/add one from Browse Ollama Models.",
        }),
      });
      return;
    }
    setAiTesting(true);
    setTestResult(null);
    try {
      const submitBaseUrl = resolveBaseUrlForSubmit(displayProvider, customPreset, baseUrl);
      const result = await testAIProviderConfig({
        provider_type: selectedProvider.backendType,
        base_url: submitBaseUrl,
        api_key: selectedProvider.hasApiKey ? apiKey : "",
        model,
      });
      if (selectedProvider.hasBaseUrl) {
        setBaseUrl(submitBaseUrl);
      }
      setTestResult(result);
    } catch (error) {
      console.error("[SettingsAgent] AI config test failed:", error);
      setTestResult({
        ok: false,
        error: error.message || t("agent.aiConfig.toast.testError"),
      });
    } finally {
      setAiTesting(false);
    }
  };

  const handleInstallOllama = async () => {
    await openExternalLink("https://ollama.com/download", "settings_ollama_install");
  };

  const handleStartOllama = async () => {
    setOllamaActionBusy(true);
    try {
      const result = await startOllamaRuntime();
      if (result.ok) {
        if (result.ready) {
          showToast(t("agent.aiConfig.ollamaStatus.toast.startSuccess"), "success");
          await refreshOllamaStatus({ showLoader: true });
        } else {
          showToast(t("agent.aiConfig.ollamaStatus.toast.startRequested"), "success");
          setOllamaFastPoll(true);
        }
      } else {
        showToast(
          result.error || t("agent.aiConfig.ollamaStatus.toast.startFailed"),
          "error",
        );
      }
    } catch (error) {
      showToast(
        error?.message || t("agent.aiConfig.ollamaStatus.toast.startFailed"),
        "error",
      );
    } finally {
      setOllamaActionBusy(false);
    }
  };

  const handleDownloadOllamaModel = async (modelName) => {
    const normalizedModel = String(modelName || "").trim();
    if (!normalizedModel) return;
    if (!ollamaStatus?.running) {
      showToast(
        t("agent.aiConfig.ollamaCatalog.startFirst", {
          defaultValue: "Start Ollama first before downloading models.",
        }),
        "error",
      );
      return;
    }

    setOllamaPullStartingModel(normalizedModel);
    try {
      const result = await startOllamaPull(normalizedModel, baseUrl);
      if (!result?.ok || !result.job_id) {
        showToast(
          result?.error ||
            t("agent.aiConfig.ollamaCatalog.pullFailedGeneric", {
              defaultValue: "Failed to start model download.",
            }),
          "error",
        );
        setOllamaPullStartingModel("");
        return;
      }
      setOllamaPullJobId(result.job_id);
      setOllamaPullJob(null);
      showToast(
        t("agent.aiConfig.ollamaCatalog.pullStarted", {
          defaultValue: `Downloading ${normalizedModel}...`,
          model: normalizedModel,
        }),
        "success",
      );
    } catch (error) {
      showToast(
        error?.message ||
          t("agent.aiConfig.ollamaCatalog.pullFailedGeneric", {
            defaultValue: "Failed to start model download.",
          }),
        "error",
      );
      setOllamaPullStartingModel("");
    }
  };

  const authenticateOrdinay = async () => {
    if (!isLicenseActive || !licenseData) return;
    setOrdinayAuthenticating(true);
    try {
      const deviceId = await getOrCreateDeviceId();
      const result = await fetchAgentToken(deviceId, licenseData.license_id);
      if (result.ok && result.token) {
        await pushAgentToken(result.token, result.expires_in || 3600);
        const status = await getAgentTokenStatus();
        setOrdinayTokenStatus(status);
        showToast(t("agent.aiConfig.ordinay.toast.authenticated"), "success");
      } else {
        showToast(result.error || t("agent.aiConfig.ordinay.toast.authFailed"), "error");
      }
    } catch (error) {
      showToast(error?.message || t("agent.aiConfig.ordinay.toast.authFailed"), "error");
    } finally {
      setOrdinayAuthenticating(false);
    }
  };

  const testOrdinayConfig = async () => {
    setAiTesting(true);
    setTestResult(null);
    try {
      const result = await testAIProviderConfig({
        provider_type: "ordinay",
        base_url: "",
        api_key: "",
        model: "ordinay-default",
      });
      setTestResult(result);
    } catch (error) {
      setTestResult({ ok: false, error: error?.message || "Test failed" });
    } finally {
      setAiTesting(false);
    }
  };

  const onProviderChange = (nextProvider) => {
    const option = DISPLAY_PROVIDER_OPTIONS.find((provider) => provider.id === nextProvider);
    if (!option || option.disabled) {
      return;
    }
    setDisplayProvider(option.id);
    setTestResult(null);
    setCloudCatalog([]);
    setCloudCatalogError("");
    setCloudCatalogQuery("");

    if (option.id === "custom") {
      const inferredPreset = normalizeCustomPreset(undefined, baseUrl);
      setCustomPreset(inferredPreset);
      if (inferredPreset !== "manual") {
        setBaseUrl(getCustomPresetValue(inferredPreset));
      }
      return;
    }

    setCustomPreset("manual");
    if (!option.hasBaseUrl) {
      setBaseUrl("");
      return;
    }
    if (option.id === "openai" && !String(baseUrl || "").trim()) {
      setBaseUrl(FALLBACK_OPENAI_BASE_URL);
      return;
    }
    if (option.id === "ollama") {
      setBaseUrl(sanitizeOllamaBaseUrl(baseUrl));
      return;
    }
  };

  const onCustomPresetChange = (nextPreset) => {
    const normalizedPreset = normalizeCustomPreset(nextPreset, "");
    setCustomPreset(normalizedPreset);
    setTestResult(null);
    setCloudCatalog([]);
    setCloudCatalogError("");
    setCloudCatalogQuery("");
    if (normalizedPreset === "manual") {
      setBaseUrl("");
      return;
    }
    setBaseUrl(getCustomPresetValue(normalizedPreset));
  };

  const sourceBadge = getSourceBadge(t, configSource);
  const showBaseUrl = selectedProvider.hasBaseUrl === true;
  const showApiKey = selectedProvider.hasApiKey === true;
  const installedModelSet = useMemo(
    () =>
      new Set(
        (Array.isArray(ollamaStatus?.models) ? ollamaStatus.models : [])
          .map((m) => String(m || "").trim().toLowerCase())
          .filter(Boolean),
      ),
    [ollamaStatus?.models],
  );
  const toolCapableCloudModelSet = useMemo(
    () =>
      new Set(
        (Array.isArray(ollamaCatalog) ? ollamaCatalog : [])
          .filter((row) => row?.source === "cloud" && row?.supports_tools === true)
          .map((row) => String(row?.name || "").trim().toLowerCase())
          .filter(Boolean),
      ),
    [ollamaCatalog],
  );
  const effectiveOllamaModels = useMemo(() => {
    const localModels = Array.isArray(ollamaToolModels) ? ollamaToolModels : [];
    const merged = new Set(
      localModels
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    );
    // Keep selected cloud model visible only when it is tool-capable.
    if (displayProvider === "ollama") {
      const selectedModel = String(model || "").trim();
      if (
        selectedModel &&
        selectedModel.toLowerCase().includes("-cloud") &&
        toolCapableCloudModelSet.has(selectedModel.toLowerCase())
      ) {
        merged.add(selectedModel);
      }
    }
    return Array.from(merged);
  }, [displayProvider, model, ollamaToolModels, toolCapableCloudModelSet]);
  const filteredCloudCatalog = useMemo(() => {
    const normalized = String(cloudCatalogQuery || "").trim().toLowerCase();
    const rows = Array.isArray(cloudCatalog) ? cloudCatalog : [];
    if (!normalized) return rows;
    return rows.filter((row) => String(row?.id || "").toLowerCase().includes(normalized));
  }, [cloudCatalog, cloudCatalogQuery]);
  const isOllamaModelAllowed = useMemo(() => {
    if (displayProvider !== "ollama") return true;
    const selected = String(model || "").trim().toLowerCase();
    if (!selected) return false;
    return effectiveOllamaModels.some(
      (m) => String(m || "").trim().toLowerCase() === selected,
    );
  }, [displayProvider, model, effectiveOllamaModels]);

  useEffect(() => {
    if (!aiConfigHydratedRef.current || aiLoading) return undefined;
    const selectedModel = String(model || "").trim();
    const isOllamaModelAllowedForSave =
      displayProvider !== "ollama" ||
      !selectedModel ||
      effectiveOllamaModels.some((m) => String(m || "").trim().toLowerCase() === selectedModel.toLowerCase());

    const canAutoSaveByok =
      aiMode === "byok" &&
      !selectedProvider.disabled &&
      selectedModel.length > 0 &&
      isOllamaModelAllowedForSave &&
      (!selectedProvider.hasApiKey || String(apiKey || "").trim().length > 0);
    const canAutoSaveOrdinay =
      aiMode === "ordinay" &&
      Boolean(ordinayTokenStatus?.has_token);

    if (!canAutoSaveByok && !canAutoSaveOrdinay) return undefined;

    const submitBaseUrl = canAutoSaveByok
      ? resolveBaseUrlForSubmit(displayProvider, customPreset, baseUrl)
      : "";
    const fingerprint = JSON.stringify({
      mode: aiMode,
      provider_type: canAutoSaveByok ? selectedProvider.backendType : "ordinay",
      base_url: canAutoSaveByok ? (selectedProvider.hasBaseUrl ? submitBaseUrl : "") : "",
      api_key: canAutoSaveByok ? (selectedProvider.hasApiKey ? apiKey : "") : "",
      model: canAutoSaveByok ? model : "ordinay-default",
    });

    if (!lastAiConfigFingerprintRef.current) {
      lastAiConfigFingerprintRef.current = fingerprint;
      return undefined;
    }

    if (fingerprint === lastAiConfigFingerprintRef.current) return undefined;
    if (fingerprint === lastAiConfigFailedFingerprintRef.current) return undefined;

    const timer = setTimeout(async () => {
      setAiSaving(true);
      setTestResult(null);
      try {
        if (canAutoSaveByok) {
          await saveAIProviderConfig({
            provider_type: selectedProvider.backendType,
            base_url: selectedProvider.hasBaseUrl ? submitBaseUrl : "",
            api_key: selectedProvider.hasApiKey ? apiKey : "",
            model,
          });
          if (selectedProvider.hasBaseUrl) {
            setBaseUrl(submitBaseUrl);
          }
        } else {
          await saveAIProviderConfig({
            provider_type: "ordinay",
            base_url: "",
            api_key: "",
            model: "ordinay-default",
          });
          setModel("ordinay-default");
        }
        setConfigSource("database");
        lastAiConfigFingerprintRef.current = fingerprint;
        lastAiConfigFailedFingerprintRef.current = "";
      } catch (error) {
        console.error("[SettingsAgent] Failed to auto-save AI config:", error);
        lastAiConfigFailedFingerprintRef.current = fingerprint;
      } finally {
        setAiSaving(false);
      }
    }, 900);

    return () => clearTimeout(timer);
  }, [
    aiLoading,
    aiMode,
    apiKey,
    baseUrl,
    customPreset,
    displayProvider,
    model,
    ordinayTokenStatus?.has_token,
    selectedProvider.backendType,
    selectedProvider.disabled,
    selectedProvider.hasApiKey,
    selectedProvider.hasBaseUrl,
    effectiveOllamaModels,
  ]);

  return (
    <div className="space-y-6">
      <ContentSection title={t("agent.aiConfig.sectionTitle")} allowOverflow={true}>
        <div className="p-6 space-y-6">
          {aiLoading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("agent.aiConfig.loading")}
            </p>
          ) : (
            <>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("agent.aiConfig.guide.title")}
                  </h3>
                  {sourceBadge?.label ? (
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full border ${sourceBadge.className}`}
                    >
                      {sourceBadge.label}
                    </span>
                  ) : null}
                </div>
                {sourceBadge?.note ? (
                  <p className="text-xs text-slate-600 dark:text-slate-300">{sourceBadge.note}</p>
                ) : null}
                <ol className="text-xs text-slate-700 dark:text-slate-300 space-y-1 list-decimal list-inside">
                  <li>{t("agent.aiConfig.guide.step1")}</li>
                  <li>{t("agent.aiConfig.guide.step2")}</li>
                  <li>{t("agent.aiConfig.guide.step3")}</li>
                </ol>
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-900 dark:text-white">
                  {t("agent.aiConfig.mode.label")}
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="aiMode"
                      value="byok"
                      checked={aiMode === "byok"}
                      onChange={() => setAiMode("byok")}
                      className="accent-blue-600"
                    />
                    <span className="text-sm text-slate-900 dark:text-white">
                      {t("agent.aiConfig.mode.byok")}
                    </span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="aiMode"
                      value="ordinay"
                      checked={aiMode === "ordinay"}
                      onChange={() => setAiMode("ordinay")}
                      className="accent-blue-600"
                    />
                    <span className="text-sm text-slate-900 dark:text-white">
                      {t("agent.aiConfig.mode.ordinay")}
                    </span>
                  </label>
                </div>
              </div>

              {aiMode === "ordinay" && (
                <div className="space-y-4">
                  {!isLicenseActive ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 px-4 py-3 space-y-2">
                      <p className="text-sm text-amber-800 dark:text-amber-300">
                        {t("agent.aiConfig.ordinay.requiresLicense")}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20 px-4 py-3">
                        <p className="text-sm text-blue-800 dark:text-blue-300">
                          {t("agent.aiConfig.ordinay.description")}
                        </p>
                      </div>

                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/30 px-4 py-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${ordinayTokenStatus?.has_token && !ordinayTokenStatus?.expired ? "bg-green-500" : "bg-red-500"}`} />
                          <span className="text-sm font-medium text-slate-900 dark:text-white">
                            {ordinayTokenStatus?.has_token && !ordinayTokenStatus?.expired
                              ? t("agent.aiConfig.ordinay.status.connected")
                              : t("agent.aiConfig.ordinay.status.notConnected")}
                          </span>
                        </div>
                        <button
                          onClick={authenticateOrdinay}
                          disabled={ordinayAuthenticating}
                          className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-60"
                        >
                          {ordinayAuthenticating
                            ? t("agent.aiConfig.ordinay.actions.authenticating")
                            : t("agent.aiConfig.ordinay.actions.authenticate")}
                        </button>
                      </div>

                      {testResult && (
                        <div
                          className={`text-sm px-3 py-2 rounded-lg border ${testResult.ok
                              ? "bg-green-50 border-green-200 dark:bg-green-900/20 text-green-700 dark:text-green-400 dark:border-green-800"
                              : "bg-red-50 border-red-200 dark:bg-red-900/20 text-red-700 dark:text-red-400 dark:border-red-800"
                            }`}
                        >
                          {testResult.ok
                            ? `${t("agent.aiConfig.test.success")} — ${t("agent.aiConfig.test.latency", { ms: testResult.latency_ms })}`
                            : `${t("agent.aiConfig.test.failed")}: ${testResult.error}`}
                        </div>
                      )}

                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          onClick={testOrdinayConfig}
                          disabled={aiTesting || !ordinayTokenStatus?.has_token}
                          className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-60"
                        >
                          {aiTesting
                            ? t("agent.aiConfig.actions.testing")
                            : t("agent.aiConfig.actions.test")}
                        </button>
                        {aiSaving ? (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {t("agent.aiConfig.actions.saving")}
                          </span>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              )}

              {aiMode === "byok" && (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]">
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">
                        {t("agent.aiConfig.provider.label")}
                      </label>
                      <ProviderPicker
                        t={t}
                        options={DISPLAY_PROVIDER_OPTIONS}
                        value={displayProvider}
                        onChange={onProviderChange}
                      />
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {t(selectedProvider.summaryKey)}
                      </p>
                    </div>

                    {displayProvider === "custom" && (
                      <div>
                        <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">
                          {t("agent.aiConfig.customPreset.label")}
                        </label>
                        <div className="w-full max-w-xl grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {CUSTOM_PRESETS.map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => onCustomPresetChange(preset.id)}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                                customPreset === preset.id
                                  ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                                  : "border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700/40"
                              }`}
                            >
                              {(() => {
                                const PresetAvatar = CUSTOM_PRESET_AVATARS[preset.id] || PROVIDER_LOGO_AVATARS.other;
                                return <PresetAvatar size={22} />;
                              })()}
                              <span className="truncate">{t(`agent.aiConfig.customPreset.${preset.id}`)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {showBaseUrl && (
                      <div>
                        <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">
                          {t("agent.aiConfig.fields.baseUrl")}
                        </label>
                        <input
                          type="text"
                          value={baseUrl}
                          onChange={(e) => setBaseUrl(e.target.value)}
                          placeholder={t(
                            `agent.aiConfig.fields.placeholders.${selectedProvider.placeholderBaseUrl}`,
                          )}
                          className="w-full max-w-xl px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400"
                        />
                        {selectedProvider.baseUrlHintKey ? (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {t(selectedProvider.baseUrlHintKey)}
                          </p>
                        ) : null}
                      </div>
                    )}

                    {displayProvider === "ollama" && (
                      <div
                        className={`rounded-lg border px-3 py-3 text-xs space-y-2 ${getOllamaStatusVariant(
                          ollamaStatus?.status,
                        )}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">
                            {t("agent.aiConfig.ollamaStatus.title")}
                          </span>
                          <span className="opacity-80">
                            {ollamaStatusLoading
                              ? t("agent.aiConfig.ollamaStatus.refreshing")
                              : ollamaFastPoll
                                ? t("agent.aiConfig.ollamaStatus.connecting")
                                : t("agent.aiConfig.ollamaStatus.autoRefresh")}
                          </span>
                        </div>

                        <div>
                          {ollamaActionBusy ? (
                            <span>{t("agent.aiConfig.ollamaStatus.states.starting")}</span>
                          ) : ollamaStatusLoading && !ollamaStatus ? (
                            <span>{t("agent.aiConfig.ollamaStatus.checking")}</span>
                          ) : (
                            <span>
                              {t(`agent.aiConfig.ollamaStatus.states.${ollamaStatus?.status || "not_running"}`)}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <span className="font-medium">
                              {t("agent.aiConfig.ollamaStatus.labels.installed")}:
                            </span>{" "}
                            {getOllamaInstallValue(t, ollamaStatus?.installed)}
                          </div>
                          <div>
                            <span className="font-medium">
                              {t("agent.aiConfig.ollamaStatus.labels.running")}:
                            </span>{" "}
                            {ollamaStatus?.running
                              ? t("agent.aiConfig.ollamaStatus.values.yes")
                              : t("agent.aiConfig.ollamaStatus.values.no")}
                          </div>
                          <div>
                            <span className="font-medium">
                              {t("agent.aiConfig.ollamaStatus.labels.models")}:
                            </span>{" "}
                            {Number(ollamaStatus?.model_count || 0)}
                          </div>
                        </div>

                        {ollamaStatus?.base_url ? (
                          <div>
                            <span className="font-medium">
                              {t("agent.aiConfig.ollamaStatus.labels.endpoint")}:
                            </span>{" "}
                            <code>{ollamaStatus.base_url}</code>
                          </div>
                        ) : null}

                        {ollamaStatus?.status === "not_installed" && (
                          <div className="space-y-1">
                            <div>{t("agent.aiConfig.ollamaStatus.hints.install")}</div>
                          </div>
                        )}

                        {ollamaStatus?.status === "not_running" && (
                          <div className="space-y-1">
                            <div>{t("agent.aiConfig.ollamaStatus.hints.start")}</div>
                          </div>
                        )}

                        {ollamaStatus?.status === "running_no_models" && (
                          <div className="space-y-1">
                            <div>{t("agent.aiConfig.ollamaStatus.hints.pullModel")}</div>
                          </div>
                        )}

                        {ollamaStatus?.status === "api_mismatch" && (
                          <div className="space-y-1">
                            <div>{t("agent.aiConfig.ollamaStatus.hints.apiMismatch")}</div>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2 pt-1">
                          {(ollamaStatus?.status === "not_installed" ||
                            ollamaStatus?.status === "running_no_models") && (
                              <button
                                type="button"
                                onClick={handleInstallOllama}
                                className="px-2.5 py-1 rounded border border-current/30 hover:bg-white/30 dark:hover:bg-black/20"
                              >
                                {t("agent.aiConfig.ollamaStatus.actions.install")}
                              </button>
                            )}

                          {(ollamaStatus?.status === "not_installed" ||
                            ollamaStatus?.status === "not_running" ||
                            ollamaStatus?.status === "running_no_models") && (
                              <button
                                type="button"
                                onClick={handleStartOllama}
                                disabled={ollamaActionBusy}
                                className="px-2.5 py-1 rounded border border-current/30 hover:bg-white/30 dark:hover:bg-black/20 disabled:opacity-60"
                              >
                                {ollamaActionBusy
                                  ? t("agent.aiConfig.ollamaStatus.actions.starting")
                                  : t("agent.aiConfig.ollamaStatus.actions.start")}
                              </button>
                            )}

                          {ollamaStatus?.status === "running_no_models" && (
                            <button
                              type="button"
                              onClick={() =>
                                openExternalLink(
                                  "https://ollama.com/library",
                                  "settings_ollama_library",
                                )
                              }
                              className="px-2.5 py-1 rounded border border-current/30 hover:bg-white/30 dark:hover:bg-black/20"
                            >
                              {t("agent.aiConfig.ollamaStatus.actions.openLibrary")}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => refreshOllamaStatus({ showLoader: true })}
                            disabled={ollamaStatusLoading}
                            className="px-2.5 py-1 rounded border border-current/30 hover:bg-white/30 dark:hover:bg-black/20 disabled:opacity-60"
                          >
                            {t("agent.aiConfig.ollamaStatus.actions.refresh")}
                          </button>
                        </div>

                        {ollamaStatus?.error ? (
                          <div className="opacity-80">{String(ollamaStatus.error)}</div>
                        ) : null}
                      </div>
                    )}

                    {displayProvider === "ollama" && (
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">
                            {t("agent.aiConfig.ollamaCatalog.title", { defaultValue: "Browse Ollama Models" })}
                          </div>
                          <button
                            type="button"
                            onClick={() => refreshOllamaCatalog({ showLoader: true })}
                            disabled={ollamaCatalogLoading}
                            className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-60"
                          >
                            {t("agent.aiConfig.ollamaCatalog.refresh", { defaultValue: "Refresh" })}
                          </button>
                        </div>

                        <input
                          type="text"
                          value={ollamaCatalogQuery}
                          onChange={(e) => { setOllamaCatalogQuery(e.target.value); setOllamaCatalogExpanded({}); }}
                          placeholder={t("agent.aiConfig.ollamaCatalog.searchPlaceholder", {
                            defaultValue: "Search model name (e.g. gpt-oss, kimi, qwen, llama)",
                          })}
                          className="w-full max-w-xl px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder-slate-400"
                        />

                        {ollamaPullJobId && ollamaPullJob ? (
                          <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-900/20 px-3 py-2 text-xs space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-blue-800 dark:text-blue-300">
                                {t("agent.aiConfig.ollamaCatalog.downloading", {
                                  defaultValue: "Downloading {{model}}",
                                  model: ollamaPullJob.model,
                                })}
                              </span>
                              <span className="text-blue-700 dark:text-blue-300">
                                {Math.round(Number(ollamaPullJob.progress || 0))}%
                              </span>
                            </div>
                            <div className="h-1.5 rounded bg-blue-200/70 dark:bg-blue-950/60 overflow-hidden">
                              <div
                                className="h-full bg-blue-600 transition-all"
                                style={{ width: `${Math.round(Number(ollamaPullJob.progress || 0))}%` }}
                              />
                            </div>
                            <div className="text-blue-700 dark:text-blue-300 opacity-90">
                              {String(ollamaPullJob.status || "pulling")}
                            </div>
                          </div>
                        ) : null}

                        {ollamaCatalogHardware ? (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {t("agent.aiConfig.ollamaCatalog.hardware", {
                              defaultValue: "Hardware: {{ram}} GB RAM · {{cpu}} CPU cores · {{vram}} GB max VRAM",
                              ram: ollamaCatalogHardware.ram_gb,
                              cpu: ollamaCatalogHardware.cpu_cores,
                              vram: ollamaCatalogHardware.gpu_max_vram_gb || 0,
                            })}
                          </div>
                        ) : null}

                        {ollamaCatalogLoading ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t("agent.aiConfig.ollamaCatalog.loading", { defaultValue: "Loading model catalog..." })}
                          </p>
                        ) : ollamaCatalog.length === 0 ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t("agent.aiConfig.ollamaCatalog.empty", { defaultValue: "No models found for this search." })}
                          </p>
                        ) : (
                          <div className="max-h-80 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                            {(() => {
                              // Group catalog models by base name (e.g. "gemma4")
                              const groups = [];
                              const groupMap = new Map();
                              for (const catalogModel of ollamaCatalog) {
                                const fullName = String(catalogModel?.name || "").trim();
                                const baseName = fullName.split(":")[0].toLowerCase();
                                if (!groupMap.has(baseName)) {
                                  const group = { baseName, variants: [] };
                                  groupMap.set(baseName, group);
                                  groups.push(group);
                                }
                                groupMap.get(baseName).variants.push(catalogModel);
                              }

                              return groups.map((group) => {
                                const firstVariant = group.variants[0];
                                const parsed = parseOllamaModel(group.baseName);
                                const IconComp = parsed.family.icon;
                                const capabilities = Array.isArray(firstVariant?.capabilities) ? firstVariant.capabilities : [];
                                const isExpanded = Boolean(ollamaCatalogExpanded[group.baseName]);
                                const hasInstalledVariant = group.variants.some((v) => Boolean(v?.installed) || installedModelSet.has(String(v?.name || "").toLowerCase()));
                                const variantCount = group.variants.length;
                                const isSingleVariant = variantCount === 1;

                                return (
                                  <div key={group.baseName} className="border-b border-slate-100 dark:border-slate-700 last:border-b-0">
                                    {/* ── Group header (clickable to expand) ── */}
                                    <button
                                      type="button"
                                      onClick={() => setOllamaCatalogExpanded((prev) => ({ ...prev, [group.baseName]: !prev[group.baseName] }))}
                                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                                    >
                                      {(() => {
                                        const AvatarComp = parsed.family.avatar;
                                        return AvatarComp
                                          ? <div className="flex-shrink-0"><AvatarComp size={28} /></div>
                                          : <div className="w-7 h-7 rounded-md bg-white dark:bg-slate-700 flex items-center justify-center flex-shrink-0"><IconComp size={18} /></div>;
                                      })()}
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-semibold text-slate-900 dark:text-white">
                                            {group.baseName}
                                          </span>
                                          <span className="text-[10px] text-slate-400 dark:text-slate-500">
                                            {t("agent.aiConfig.ollamaCatalog.variantCount", {
                                              defaultValue: "{{count}} variant(s)",
                                              count: variantCount,
                                            })}
                                          </span>
                                        </div>
                                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                                          {t(
                                            `agent.aiConfig.modelPicker.vendor.${parsed.family.vendorKey}`,
                                            parsed.family.vendorKey,
                                          )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1">
                                          {hasInstalledVariant ? (
                                            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                                              {t("agent.aiConfig.ollamaCatalog.installed", { defaultValue: "Installed" })}
                                            </span>
                                          ) : null}
                                          {capabilities.includes("tools") ? (
                                            <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
                                              {t("agent.aiConfig.ollamaCatalog.capTools", { defaultValue: "Tools" })}
                                            </span>
                                          ) : null}
                                          {capabilities.includes("vision") ? (
                                            <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-300">
                                              {t("agent.aiConfig.ollamaCatalog.capVision", { defaultValue: "Vision" })}
                                            </span>
                                          ) : null}
                                          {capabilities.includes("thinking") ? (
                                            <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-300">
                                              {t("agent.aiConfig.ollamaCatalog.capThinking", { defaultValue: "Thinking" })}
                                            </span>
                                          ) : null}
                                          {capabilities.includes("audio") ? (
                                            <span className="inline-flex items-center rounded-full border border-pink-200 bg-pink-50 px-1.5 py-0.5 text-[10px] font-medium text-pink-700 dark:border-pink-800 dark:bg-pink-900/20 dark:text-pink-300">
                                              {t("agent.aiConfig.ollamaCatalog.capAudio", { defaultValue: "Audio" })}
                                            </span>
                                          ) : null}
                                        </div>
                                      </div>
                                      <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                                    </button>

                                    {/* ── Expanded variant table ── */}
                                    {isExpanded ? (
                                      <div className="bg-slate-50/50 dark:bg-slate-800/50">
                                        {/* Table header */}
                                        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 px-4 py-1.5 text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider border-t border-slate-100 dark:border-slate-700">
                                          <span>{t("agent.aiConfig.ollamaCatalog.colName", { defaultValue: "Name" })}</span>
                                          <span className="w-16 text-right">{t("agent.aiConfig.ollamaCatalog.colSize", { defaultValue: "Size" })}</span>
                                          <span className="w-14 text-right">{t("agent.aiConfig.ollamaCatalog.colContext", { defaultValue: "Context" })}</span>
                                          <span className="w-24 text-right">{t("agent.aiConfig.ollamaCatalog.colInput", { defaultValue: "Input" })}</span>
                                          <span className="w-24"></span>
                                        </div>
                                        {/* Variant rows */}
                                        {group.variants.map((catalogModel) => {
                                          const variantName = String(catalogModel?.name || "").trim();
                                          const variantTag = variantName.includes(":") ? variantName.split(":").slice(1).join(":") : "latest";
                                          const variantKey = variantName.toLowerCase();
                                          const installed = Boolean(catalogModel?.installed) || installedModelSet.has(variantKey);
                                          const source = String(catalogModel?.source || "local");
                                          const canUseCloud = source === "cloud";
                                          const showDownload = !installed && catalogModel?.downloadable !== false;
                                          const pullingThisModel =
                                            (ollamaPullJobId && ollamaPullJob?.model === variantName) ||
                                            (!ollamaPullJobId && ollamaPullStartingModel === variantName);
                                          const sizeLabel = String(catalogModel?.size_label || "").trim();
                                          const contextLength = String(catalogModel?.context_length || "").trim();
                                          const inputModalities = String(catalogModel?.input_modalities || "").trim();
                                          const compatibilityLevel = String(catalogModel?.compatibility?.level || "unknown");

                                          return (
                                            <div
                                              key={`${source}:${variantName}`}
                                              className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 items-center px-4 py-1.5 border-t border-slate-100 dark:border-slate-700/50 hover:bg-white dark:hover:bg-slate-700/30 transition-colors"
                                            >
                                              <div className="min-w-0 flex items-center gap-1.5">
                                                <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                                                  :{variantTag}
                                                </span>
                                                {installed ? (
                                                  <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[9px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                                                    {t("agent.aiConfig.ollamaCatalog.installed", { defaultValue: "Installed" })}
                                                  </span>
                                                ) : null}
                                                {canUseCloud ? (
                                                  <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0 text-[9px] font-medium text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300">
                                                    {t("agent.aiConfig.ollamaCatalog.cloud", { defaultValue: "Cloud" })}
                                                  </span>
                                                ) : null}
                                                {compatibilityLevel && compatibilityLevel !== "unknown" && compatibilityLevel !== "cloud" ? (
                                                  <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[9px] font-medium ${getCompatibilityBadgeClass(compatibilityLevel)}`}>
                                                    {t(`agent.aiConfig.ollamaCatalog.compat.${compatibilityLevel}`, { defaultValue: compatibilityLevel })}
                                                  </span>
                                                ) : null}
                                              </div>
                                              <span className="w-16 text-right text-[11px] text-slate-600 dark:text-slate-300 tabular-nums">
                                                {sizeLabel || "—"}
                                              </span>
                                              <span className="w-14 text-right text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                                                {contextLength || "—"}
                                              </span>
                                              <span className="w-24 text-right text-[11px] text-slate-500 dark:text-slate-400">
                                                {inputModalities || "—"}
                                              </span>
                                              <div className="w-24 flex justify-end">
                                                {installed ? (
                                                  <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); setModel(variantName); }}
                                                    className="px-2 py-0.5 text-[11px] rounded border border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                                  >
                                                    {t("agent.aiConfig.ollamaCatalog.useModel", { defaultValue: "Use" })}
                                                  </button>
                                                ) : canUseCloud ? (
                                                  <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); setModel(variantName); }}
                                                    className="px-2 py-0.5 text-[11px] rounded border border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                                                  >
                                                    {t("agent.aiConfig.ollamaCatalog.addCloud", { defaultValue: "Add" })}
                                                  </button>
                                                ) : showDownload ? (
                                                  <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); handleDownloadOllamaModel(variantName); }}
                                                    disabled={Boolean(ollamaPullJobId) || pullingThisModel}
                                                    className="px-2 py-0.5 text-[11px] rounded border border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-60"
                                                  >
                                                    {pullingThisModel
                                                      ? t("agent.aiConfig.ollamaCatalog.downloadingShort", { defaultValue: "Downloading..." })
                                                      : t("agent.aiConfig.ollamaCatalog.download", { defaultValue: "Download" })}
                                                  </button>
                                                ) : (
                                                  <span className="text-[10px] text-slate-400">
                                                    {t("agent.aiConfig.ollamaCatalog.notDownloadable", { defaultValue: "N/A" })}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        )}
                      </div>
                    )}

                    {showApiKey && (
                      <div>
                        <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">
                          {t("agent.aiConfig.fields.apiKey")}
                        </label>
                        <div className="relative w-full max-w-xl">
                          <input
                            type={isApiKeyVisible ? "text" : "password"}
                            value={apiKey}
                            onChange={(e) => {
                              const value = e.target.value;
                              setApiKey(value);
                              setApiKeysBySlot((prev) => ({
                                ...prev,
                                [apiKeySlotKey]: value,
                              }));
                            }}
                            placeholder={t("agent.aiConfig.fields.placeholders.apiKey")}
                            className="w-full pr-10 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400"
                          />
                          <button
                            type="button"
                            onClick={() => setIsApiKeyVisible((prev) => !prev)}
                            className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                            aria-label={isApiKeyVisible
                              ? t("agent.aiConfig.fields.hideApiKey", { defaultValue: "Hide API key" })
                              : t("agent.aiConfig.fields.showApiKey", { defaultValue: "Show API key" })}
                            title={isApiKeyVisible
                              ? t("agent.aiConfig.fields.hideApiKey", { defaultValue: "Hide API key" })
                              : t("agent.aiConfig.fields.showApiKey", { defaultValue: "Show API key" })}
                          >
                            {isApiKeyVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        {selectedProvider.apiKeyHintKey ? (
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {t(selectedProvider.apiKeyHintKey)}
                            {apiKey === "****"
                              ? ` ${t("agent.aiConfig.help.apiKey.savedMaskHint")}`
                              : ""}
                          </p>
                        ) : null}
                      </div>
                    )}

                    <OllamaModelPicker
                      t={t}
                      displayProvider={displayProvider}
                      ollamaModels={effectiveOllamaModels}
                      model={model}
                      setModel={setModel}
                      selectedProvider={selectedProvider}
                    />
                    {displayProvider === "ollama" && String(model || "").trim() && !isOllamaModelAllowed ? (
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        {t("agent.aiConfig.ollamaCatalog.invalidSelectedModel", {
                          defaultValue:
                            "This selected model is blocked because it is not verified as tool-capable. Please pick a tool-capable model.",
                        })}
                      </p>
                    ) : null}

                    {cloudCatalogSupported && (
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">
                            {t("agent.aiConfig.cloudCatalog.title", {
                              defaultValue: "Browse Tool-Capable Cloud Models",
                            })}
                          </div>
                          <button
                            type="button"
                            onClick={() => refreshCloudCatalog({ showLoader: true })}
                            disabled={cloudCatalogLoading || !String(apiKey || "").trim()}
                            className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-60"
                          >
                            {t("agent.aiConfig.cloudCatalog.refresh", { defaultValue: "Refresh" })}
                          </button>
                        </div>

                        <input
                          type="text"
                          value={cloudCatalogQuery}
                          onChange={(e) => setCloudCatalogQuery(e.target.value)}
                          placeholder={t("agent.aiConfig.cloudCatalog.searchPlaceholder", {
                            defaultValue: "Search provider model name",
                          })}
                          className="w-full max-w-xl px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder-slate-400"
                        />

                        {!String(apiKey || "").trim() ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t("agent.aiConfig.cloudCatalog.needApiKey", {
                              defaultValue: "Enter your API key to load available cloud models.",
                            })}
                          </p>
                        ) : null}

                        {cloudCatalogError ? (
                          <p className="text-xs text-rose-600 dark:text-rose-300">{cloudCatalogError}</p>
                        ) : null}

                        {cloudCatalogLoading ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t("agent.aiConfig.cloudCatalog.loading", { defaultValue: "Loading cloud models..." })}
                          </p>
                        ) : filteredCloudCatalog.length === 0 && String(apiKey || "").trim() ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {t("agent.aiConfig.cloudCatalog.empty", { defaultValue: "No cloud models found for this search." })}
                          </p>
                        ) : (
                          <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                            {filteredCloudCatalog.map((cloudModel) => {
                              const modelId = String(cloudModel?.id || "").trim();
                              if (!modelId) return null;
                              const parsed = parseOllamaModel(modelId);
                              const CloudAvatarComp = parsed.family.avatar || parsed.family.icon;
                              const isSelected = model === modelId;
                              return (
                                <div
                                  key={modelId}
                                  className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 dark:border-slate-700 last:border-b-0"
                                >
                                  <div className="flex-shrink-0">
                                    <CloudAvatarComp size={28} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                                      {modelId}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                      <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300">
                                        {t("agent.aiConfig.ollamaCatalog.cloud", { defaultValue: "Cloud" })}
                                      </span>
                                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
                                        {t("agent.aiConfig.cloudCatalog.toolCapable", {
                                          defaultValue: "Tool-capable",
                                        })}
                                      </span>
                                      {cloudModel?.owned_by ? (
                                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                          {String(cloudModel.owned_by)}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setModel(modelId)}
                                    className={`px-2.5 py-1 text-xs rounded border ${
                                      isSelected
                                        ? "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300"
                                        : "border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                                    }`}
                                  >
                                    {isSelected
                                      ? t("agent.aiConfig.ollamaCatalog.useModel", { defaultValue: "Use" })
                                      : t("agent.aiConfig.ollamaCatalog.addCloud", { defaultValue: "Add" })}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {testResult && (
                      <div
                        className={`text-sm px-3 py-2 rounded-lg border ${testResult.ok
                            ? "bg-green-50 border-green-200 dark:bg-green-900/20 text-green-700 dark:text-green-400 dark:border-green-800"
                            : "bg-red-50 border-red-200 dark:bg-red-900/20 text-red-700 dark:text-red-400 dark:border-red-800"
                          }`}
                      >
                        {testResult.ok
                          ? `${t("agent.aiConfig.test.success")} — ${t(
                            "agent.aiConfig.test.latency",
                            { ms: testResult.latency_ms },
                          )}`
                          : `${t("agent.aiConfig.test.failed")}: ${testResult.error}`}
                      </div>
                    )}

                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        onClick={testAiConfig}
                        disabled={aiTesting || !model || selectedProvider.disabled || (displayProvider === "ollama" && !isOllamaModelAllowed)}
                        className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-60"
                      >
                        {aiTesting
                          ? t("agent.aiConfig.actions.testing")
                          : t("agent.aiConfig.actions.test")}
                      </button>
                      {aiSaving ? (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {t("agent.aiConfig.actions.saving")}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <aside className="space-y-4">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/30 p-4">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                        {t("agent.aiConfig.help.providerHelpTitle")}
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">
                        {t(`agent.aiConfig.provider.${displayProvider}`)}
                      </p>
                      <div className="space-y-2">
                        {helpLinkKeys.map((linkKey) => (
                          <a
                            key={linkKey}
                            href={getLinkUrl(linkKey)}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-xs text-blue-700 dark:text-blue-400 hover:underline break-all"
                          >
                            {t(`agent.aiConfig.links.${linkKey}`)}
                          </a>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/30 p-4">
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                        {t("agent.aiConfig.help.fieldMeaningTitle")}
                      </h4>
                      <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                        <li>
                          <span className="font-medium text-slate-800 dark:text-slate-100">
                            {t("agent.aiConfig.fields.baseUrl")}:
                          </span>{" "}
                          {t("agent.aiConfig.help.fieldMeaning.baseUrl")}
                        </li>
                        <li>
                          <span className="font-medium text-slate-800 dark:text-slate-100">
                            {t("agent.aiConfig.fields.apiKey")}:
                          </span>{" "}
                          {t("agent.aiConfig.help.fieldMeaning.apiKey")}
                        </li>
                        <li>
                          <span className="font-medium text-slate-800 dark:text-slate-100">
                            {t("agent.aiConfig.fields.model")}:
                          </span>{" "}
                          {t("agent.aiConfig.help.fieldMeaning.model")}
                        </li>
                      </ul>
                    </div>
                  </aside>
                </div>
              )}

              {!model && aiMode === "byok" && (
                <div className="text-xs px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                  {t("agent.aiConfig.help.missingModelWarning")}
                </div>
              )}
            </>
          )}
        </div>
      </ContentSection>

      <ContentSection title={t("agent.sectionTitle")}>
        <div className="p-6 space-y-6">
          {loading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("agent.loading")}
            </p>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">
                  {t("agent.preferredOutputFormat.label")}
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  {t("agent.preferredOutputFormat.description")}
                </p>
                <select
                  value={formatPreference}
                  onChange={(e) => setFormatPreference(e.target.value)}
                  className="w-full md:w-72 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="auto">{t("agent.options.auto")}</option>
                  <option value="pdf">{t("agent.options.pdf")}</option>
                  <option value="docx">{t("agent.options.docx")}</option>
                  <option value="xlsx">{t("agent.options.xlsx")}</option>
                  <option value="html">{t("agent.options.html")}</option>
                </select>
              </div>

              {saving ? (
                <div className="flex justify-end">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {t("agent.actions.saving")}
                  </span>
                </div>
              ) : null}
            </>
          )}
        </div>
      </ContentSection>
    </div>
  );
}
