import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ContentSection from "../layout/ContentSection";
import { useToast } from "../../contexts/ToastContext";
import {
  getDocumentAiSettings,
  updateDocumentAiSettings,
} from "../../services/api/documentAi";
import {
  getAIProviderConfig,
  saveAIProviderConfig,
  testAIProviderConfig,
} from "../../services/api/aiProvider";

const PROVIDER_TYPES = ["openai_compatible", "ollama", "custom", "anthropic", "gemini"];

const PLACEHOLDERS = {
  openai_compatible: {
    baseUrl: "baseUrlOpenAI",
    model: "modelOpenAI",
  },
  ollama: {
    baseUrl: "baseUrlOllama",
    model: "modelOllama",
  },
  custom: {
    baseUrl: "baseUrlCustom",
    model: "modelCustom",
  },
  anthropic: {
    baseUrl: "",
    model: "modelAnthropic",
  },
  gemini: {
    baseUrl: "",
    model: "modelGemini",
  },
};

const PROVIDERS_WITHOUT_BASE_URL = ["anthropic", "gemini"];

export default function SettingsAgent() {
  const { t } = useTranslation(["settings"]);
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formatPreference, setFormatPreference] = useState("auto");

  // AI config state
  const [aiLoading, setAiLoading] = useState(true);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiMode, setAiMode] = useState("byok");
  const [providerType, setProviderType] = useState("openai_compatible");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const remoteSettings = await getDocumentAiSettings();
        if (!mounted) return;
        setFormatPreference(
          remoteSettings.document_output_format_preference || "auto"
        );
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
        if (config.configured) {
          setProviderType(config.provider_type || "openai_compatible");
          setBaseUrl(config.base_url || "");
          setApiKey(config.api_key_masked || "");
          setModel(config.model || "");
        }
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
    setAiSaving(true);
    setTestResult(null);
    try {
      await saveAIProviderConfig({
        provider_type: providerType,
        base_url: baseUrl,
        api_key: apiKey,
        model,
      });
      showToast(t("agent.aiConfig.toast.saved"), "success");
    } catch (error) {
      console.error("[SettingsAgent] Failed to save AI config:", error);
      showToast(t("agent.aiConfig.toast.saveError"), "error");
    } finally {
      setAiSaving(false);
    }
  };

  const testAiConfig = async () => {
    setAiTesting(true);
    setTestResult(null);
    try {
      const result = await testAIProviderConfig({
        provider_type: providerType,
        base_url: baseUrl,
        api_key: apiKey,
        model,
      });
      setTestResult(result);
    } catch (error) {
      console.error("[SettingsAgent] AI config test failed:", error);
      setTestResult({ ok: false, error: error.message || t("agent.aiConfig.toast.testError") });
    } finally {
      setAiTesting(false);
    }
  };

  const ph = PLACEHOLDERS[providerType] || PLACEHOLDERS.openai_compatible;
  const showApiKey = providerType !== "ollama";
  const showBaseUrl = !PROVIDERS_WITHOUT_BASE_URL.includes(providerType);

  return (
    <div className="space-y-6">
      {/* AI Configuration */}
      <ContentSection title={t("agent.aiConfig.sectionTitle")}>
        <div className="p-6 space-y-6">
          {aiLoading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("agent.aiConfig.loading")}
            </p>
          ) : (
            <>
              {/* Mode selection */}
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
                  <label className="flex items-center gap-3 opacity-50 cursor-not-allowed">
                    <input
                      type="radio"
                      name="aiMode"
                      value="ordinay"
                      disabled
                      className="accent-blue-600"
                    />
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {t("agent.aiConfig.mode.ordinay")}
                      <span className="ml-2 text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                        {t("agent.aiConfig.mode.ordinayComingSoon")}
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              {aiMode === "byok" && (
                <>
                  {/* Provider type */}
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">
                      {t("agent.aiConfig.provider.label")}
                    </label>
                    <select
                      value={providerType}
                      onChange={(e) => {
                        setProviderType(e.target.value);
                        setTestResult(null);
                      }}
                      className="w-full md:w-96 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    >
                      {PROVIDER_TYPES.map((pt) => (
                        <option key={pt} value={pt}>
                          {t(`agent.aiConfig.provider.${pt}`)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Base URL (hidden for Anthropic/Gemini) */}
                  {showBaseUrl && (
                    <div>
                      <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">
                        {t("agent.aiConfig.fields.baseUrl")}
                      </label>
                      <input
                        type="text"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                        placeholder={t(`agent.aiConfig.fields.placeholders.${ph.baseUrl}`)}
                        className="w-full md:w-96 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400"
                      />
                    </div>
                  )}

                  {/* API Key (hidden for Ollama) */}
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
                        className="w-full md:w-96 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400"
                      />
                    </div>
                  )}

                  {/* Model */}
                  <div>
                    <label className="block text-sm font-medium text-slate-900 dark:text-white mb-1">
                      {t("agent.aiConfig.fields.model")}
                    </label>
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder={t(`agent.aiConfig.fields.placeholders.${ph.model}`)}
                      className="w-full md:w-96 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400"
                    />
                  </div>

                  {/* Test result */}
                  {testResult && (
                    <div
                      className={`text-sm px-3 py-2 rounded ${
                        testResult.ok
                          ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                          : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                      }`}
                    >
                      {testResult.ok
                        ? `${t("agent.aiConfig.test.success")} — ${t("agent.aiConfig.test.latency", { ms: testResult.latency_ms })}`
                        : `${t("agent.aiConfig.test.failed")}: ${testResult.error}`}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={testAiConfig}
                      disabled={aiTesting || !model}
                      className="px-4 py-2 rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-60"
                    >
                      {aiTesting
                        ? t("agent.aiConfig.actions.testing")
                        : t("agent.aiConfig.actions.test")}
                    </button>
                    <button
                      onClick={saveAiConfig}
                      disabled={aiSaving || !model}
                      className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {aiSaving
                        ? t("agent.aiConfig.actions.saving")
                        : t("agent.aiConfig.actions.save")}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </ContentSection>

      {/* Agent Preferences (existing) */}
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

