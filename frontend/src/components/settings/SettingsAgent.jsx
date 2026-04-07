import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Brain, Cpu, Sparkles, Zap, ChevronDown, Check } from "lucide-react";
import ContentSection from "../layout/ContentSection";
import { useToast } from "../../contexts/ToastContext";
import { openExternalLink } from "../../lib/externalLink";
import { PROVIDER_LOGOS } from "../brand";
import {
  getDocumentAiSettings,
  updateDocumentAiSettings,
} from "../../services/api/documentAi";
import {
  getAIProviderConfig,
  getAgentTokenStatus,
  getOllamaStatus,
  pushAgentToken,
  saveAIProviderConfig,
  startOllamaRuntime,
  testAIProviderConfig,
} from "../../services/api/aiProvider";
import { useLicense } from "../../contexts/LicenseContext";
import {
  fetchAgentToken,
  getCachedAgentToken,
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

const FALLBACK_OPENAI_BASE_URL = "https://api.openai.com/v1";
const FALLBACK_OLLAMA_BASE_URL = "http://localhost:11434";

// ── Ollama model metadata ──────────────────────────────────
// Maps known model family prefixes to display metadata.
// Unknown models gracefully fall back to a generic entry.

const MODEL_FAMILIES = {
  llama:     { color: "bg-blue-500",    icon: PROVIDER_LOGOS.meta,    vendorKey: "meta" },
  codellama: { color: "bg-blue-600",    icon: PROVIDER_LOGOS.meta,    vendorKey: "meta" },
  mistral:   { color: "bg-orange-500",  icon: PROVIDER_LOGOS.mistral, vendorKey: "mistral" },
  mixtral:   { color: "bg-orange-400",  icon: PROVIDER_LOGOS.mistral, vendorKey: "mistral" },
  gemma:     { color: "bg-cyan-500",    icon: PROVIDER_LOGOS.google,  vendorKey: "google" },
  gemma2:    { color: "bg-cyan-500",    icon: PROVIDER_LOGOS.google,  vendorKey: "google" },
  gemma3:    { color: "bg-cyan-500",    icon: PROVIDER_LOGOS.google,  vendorKey: "google" },
  phi:       { color: "bg-teal-500",    icon: PROVIDER_LOGOS.microsoft, vendorKey: "microsoft" },
  phi3:      { color: "bg-teal-500",    icon: PROVIDER_LOGOS.microsoft, vendorKey: "microsoft" },
  phi4:      { color: "bg-teal-500",    icon: PROVIDER_LOGOS.microsoft, vendorKey: "microsoft" },
  qwen:      { color: "bg-purple-500",  icon: PROVIDER_LOGOS.alibaba, vendorKey: "alibaba" },
  qwen2:     { color: "bg-purple-500",  icon: PROVIDER_LOGOS.alibaba, vendorKey: "alibaba" },
  "qwen2.5": { color: "bg-purple-500",  icon: PROVIDER_LOGOS.alibaba, vendorKey: "alibaba" },
  qwen3:     { color: "bg-purple-500",  icon: PROVIDER_LOGOS.alibaba, vendorKey: "alibaba" },
  deepseek:  { color: "bg-indigo-500",  icon: PROVIDER_LOGOS.deepseek, vendorKey: "deepseek" },
  "deepseek-coder": { color: "bg-indigo-600", icon: PROVIDER_LOGOS.deepseek, vendorKey: "deepseek" },
  "deepseek-r1":    { color: "bg-indigo-400", icon: PROVIDER_LOGOS.deepseek, vendorKey: "deepseek" },
  command:   { color: "bg-green-500",   icon: PROVIDER_LOGOS.cohere, vendorKey: "cohere" },
  "command-r": { color: "bg-green-500", icon: PROVIDER_LOGOS.cohere, vendorKey: "cohere" },
  starcoder: { color: "bg-yellow-500",  icon: PROVIDER_LOGOS.huggingface, vendorKey: "huggingface" },
  codegemma: { color: "bg-cyan-600",    icon: PROVIDER_LOGOS.google, vendorKey: "google" },
  yi:        { color: "bg-rose-500",    icon: PROVIDER_LOGOS["01ai"], vendorKey: "01ai" },
  solar:     { color: "bg-amber-500",   icon: PROVIDER_LOGOS.upstage, vendorKey: "upstage" },
  vicuna:    { color: "bg-slate-500",   icon: PROVIDER_LOGOS.lmsys, vendorKey: "lmsys" },
  falcon:    { color: "bg-sky-500",     icon: PROVIDER_LOGOS.tii, vendorKey: "tii" },
  orca:      { color: "bg-blue-400",    icon: PROVIDER_LOGOS.microsoft, vendorKey: "microsoft" },
  wizardlm:  { color: "bg-violet-500",  icon: PROVIDER_LOGOS.wizardlm, vendorKey: "wizardlm" },
  nous:      { color: "bg-red-500",     icon: PROVIDER_LOGOS.nousresearch, vendorKey: "nousresearch" },
  "nous-hermes": { color: "bg-red-500", icon: PROVIDER_LOGOS.nousresearch, vendorKey: "nousresearch" },
  nomic:     { color: "bg-gray-500",    icon: PROVIDER_LOGOS.nomic, vendorKey: "nomic" },
  mxbai:     { color: "bg-gray-500",    icon: PROVIDER_LOGOS.mixedbread, vendorKey: "mixedbread" },
  snowflake: { color: "bg-sky-400",     icon: PROVIDER_LOGOS.snowflake, vendorKey: "snowflake" },
  granite:   { color: "bg-stone-500",   icon: PROVIDER_LOGOS.ibm, vendorKey: "ibm" },
};

const FALLBACK_FAMILY = { color: "bg-slate-400", icon: PROVIDER_LOGOS.other, vendorKey: "other" };

// Size tier thresholds in billions of parameters
const SIZE_TIERS = [
  { maxB: 3,    tierKey: "small" },
  { maxB: 10,   tierKey: "medium" },
  { maxB: 35,   tierKey: "large" },
  { maxB: 80,   tierKey: "xlarge" },
  { maxB: Infinity, tierKey: "xxlarge" },
];

function parseOllamaModel(rawName) {
  const name = String(rawName || "").trim();
  const [baseName, tag] = name.includes(":") ? name.split(":", 2) : [name, "latest"];

  // Find longest matching family key
  let familyKey = null;
  let matchLen = 0;
  for (const key of Object.keys(MODEL_FAMILIES)) {
    if (baseName.toLowerCase().startsWith(key) && key.length > matchLen) {
      familyKey = key;
      matchLen = key.length;
    }
  }

  const family = familyKey ? MODEL_FAMILIES[familyKey] : FALLBACK_FAMILY;

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

function resolveBaseUrlForSubmit(displayProvider, customPreset, baseUrl) {
  const normalized = String(baseUrl || "").trim();
  if (displayProvider === "openai") {
    return normalized || FALLBACK_OPENAI_BASE_URL;
  }
  if (displayProvider === "ollama") {
    return normalizeOllamaBaseUrl(normalized || FALLBACK_OLLAMA_BASE_URL);
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
    return (
      <div>
        <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">
          {t("agent.aiConfig.fields.model")}
        </label>
        <input
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={t(
            `agent.aiConfig.fields.placeholders.${selectedProvider.placeholderModel}`,
          )}
          className="w-full max-w-xl px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400"
        />
        {selectedProvider.modelHintKey ? (
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
              <div className="w-7 h-7 rounded-md bg-white flex items-center justify-center flex-shrink-0">
                <selectedParsed.family.icon size={20} />
              </div>
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
                  const IconComp = m.family.icon;
                  return (
                    <button
                      key={m.raw}
                      type="button"
                      onClick={() => { setModel(m.raw); setPickerOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
                    >
                      <div className="w-7 h-7 rounded-md bg-white flex items-center justify-center flex-shrink-0">
                        <IconComp size={20} />
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
  const [model, setModel] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [configSource, setConfigSource] = useState(null);
  const [ollamaStatus, setOllamaStatus] = useState(null);
  const [ollamaStatusLoading, setOllamaStatusLoading] = useState(false);
  const [ollamaActionBusy, setOllamaActionBusy] = useState(false);
  const [ollamaFastPoll, setOllamaFastPoll] = useState(false);
  const [ordinayTokenStatus, setOrdinayTokenStatus] = useState(null);
  const [ordinayAuthenticating, setOrdinayAuthenticating] = useState(false);

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
        setOllamaStatus(status);
      } catch (error) {
        setOllamaStatus({
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
    [aiMode, displayProvider, baseUrl],
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const remoteSettings = await getDocumentAiSettings();
        if (!mounted) return;
        setFormatPreference(remoteSettings.document_output_format_preference || "auto");
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
            setBaseUrl(normalizeOllamaBaseUrl(config.base_url || ""));
          } else {
            setBaseUrl(config.base_url || "");
          }
          setApiKey(config.api_key_masked || "");
          setModel(config.model || "");
        }
        setConfigSource(config.source || null);
      } catch (error) {
        console.error("[SettingsAgent] Failed to load AI config:", error);
      } finally {
        if (mounted) setAiLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (aiMode !== "byok" || displayProvider !== "ollama") {
      setOllamaStatus(null);
      setOllamaStatusLoading(false);
      return undefined;
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
      ollamaStatus?.models?.length > 0 &&
      !model
    ) {
      setModel(ollamaStatus.models[0]);
    }
  }, [displayProvider, ollamaStatus?.models, model]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateDocumentAiSettings({
        document_output_format_preference: formatPreference,
      });
      setFormatPreference(updated.document_output_format_preference || "auto");
      showToast(t("agent.toast.saved"), "success");
    } catch (error) {
      console.error("[SettingsAgent] Failed to save agent settings:", error);
      showToast(t("agent.toast.saveError"), "error");
    } finally {
      setSaving(false);
    }
  };

  const saveAiConfig = async () => {
    if (selectedProvider.disabled) {
      return;
    }
    setAiSaving(true);
    setTestResult(null);
    try {
      const submitBaseUrl = resolveBaseUrlForSubmit(displayProvider, customPreset, baseUrl);
      await saveAIProviderConfig({
        provider_type: selectedProvider.backendType,
        base_url: submitBaseUrl,
        api_key: selectedProvider.hasApiKey ? apiKey : "",
        model,
      });
      if (selectedProvider.hasBaseUrl) {
        setBaseUrl(submitBaseUrl);
      }
      setConfigSource("database");
      showToast(t("agent.aiConfig.toast.saved"), "success");
    } catch (error) {
      console.error("[SettingsAgent] Failed to save AI config:", error);
      showToast(t("agent.aiConfig.toast.saveError"), "error");
    } finally {
      setAiSaving(false);
    }
  };

  const testAiConfig = async () => {
    if (selectedProvider.disabled) {
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

  const saveOrdinayConfig = async () => {
    setAiSaving(true);
    setTestResult(null);
    try {
      await saveAIProviderConfig({
        provider_type: "ordinay",
        base_url: "",
        api_key: "",
        model: "ordinay-default",
      });
      setConfigSource("database");
      setModel("ordinay-default");
      showToast(t("agent.aiConfig.toast.saved"), "success");
    } catch (error) {
      showToast(t("agent.aiConfig.toast.saveError"), "error");
    } finally {
      setAiSaving(false);
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
    if (option.id === "ollama" && !String(baseUrl || "").trim()) {
      setBaseUrl(FALLBACK_OLLAMA_BASE_URL);
    }
  };

  const onCustomPresetChange = (nextPreset) => {
    const normalizedPreset = normalizeCustomPreset(nextPreset, "");
    setCustomPreset(normalizedPreset);
    setTestResult(null);
    if (normalizedPreset === "manual") {
      setBaseUrl("");
      return;
    }
    setBaseUrl(getCustomPresetValue(normalizedPreset));
  };

  const sourceBadge = getSourceBadge(t, configSource);
  const showBaseUrl = selectedProvider.hasBaseUrl === true;
  const showApiKey = selectedProvider.hasApiKey === true;

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
                          className={`text-sm px-3 py-2 rounded-lg border ${
                            testResult.ok
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
                        <button
                          onClick={saveOrdinayConfig}
                          disabled={aiSaving || !ordinayTokenStatus?.has_token}
                          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          {aiSaving
                            ? t("agent.aiConfig.actions.saving")
                            : t("agent.aiConfig.actions.save")}
                        </button>
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
                      <select
                        value={displayProvider}
                        onChange={(e) => onProviderChange(e.target.value)}
                        className="w-full max-w-xl px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                      >
                        {DISPLAY_PROVIDER_OPTIONS.map((provider) => (
                          <option key={provider.id} value={provider.id} disabled={provider.disabled}>
                            {t(`agent.aiConfig.provider.${provider.id}`)}
                            {provider.disabled ? ` (${t("agent.aiConfig.provider.comingSoon")})` : ""}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {t(selectedProvider.summaryKey)}
                      </p>
                    </div>

                    {displayProvider === "custom" && (
                      <div>
                        <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">
                          {t("agent.aiConfig.customPreset.label")}
                        </label>
                        <select
                          value={customPreset}
                          onChange={(e) => onCustomPresetChange(e.target.value)}
                          className="w-full max-w-xl px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                        >
                          {CUSTOM_PRESETS.map((preset) => (
                            <option key={preset.id} value={preset.id}>
                              {t(`agent.aiConfig.customPreset.${preset.id}`)}
                            </option>
                          ))}
                        </select>
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

                    {showApiKey && (
                      <div>
                        <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">
                          {t("agent.aiConfig.fields.apiKey")}
                        </label>
                        <input
                          type="password"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder={t("agent.aiConfig.fields.placeholders.apiKey")}
                          className="w-full max-w-xl px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400"
                        />
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
                      ollamaModels={ollamaStatus?.models}
                      model={model}
                      setModel={setModel}
                      selectedProvider={selectedProvider}
                    />

                    {testResult && (
                      <div
                        className={`text-sm px-3 py-2 rounded-lg border ${
                          testResult.ok
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
                        disabled={aiTesting || !model || selectedProvider.disabled}
                        className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-60"
                      >
                        {aiTesting
                          ? t("agent.aiConfig.actions.testing")
                          : t("agent.aiConfig.actions.test")}
                      </button>
                      <button
                        onClick={saveAiConfig}
                        disabled={aiSaving || !model || selectedProvider.disabled}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        {aiSaving
                          ? t("agent.aiConfig.actions.saving")
                          : t("agent.aiConfig.actions.save")}
                      </button>
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

              <div className="flex justify-end">
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? t("agent.actions.saving") : t("agent.actions.save")}
                </button>
              </div>
            </>
          )}
        </div>
      </ContentSection>
    </div>
  );
}
