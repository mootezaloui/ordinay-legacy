import { useEffect, useState } from "react";
import TemplateManagement from "./TemplateManagement";
import ContentSection from "../layout/ContentSection";
import { useToast } from "../../contexts/ToastContext";
import {
  getDocumentAiSettings,
  updateDocumentAiSettings,
  listDocumentAiAuditLogs,
} from "../../services/api/documentAi";

export default function SettingsDocuments() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    document_ai_enabled: false,
    document_ai_provider: "local",
    document_ai_redaction_mode: "none",
    document_ai_retain_artifacts_days: 30,
    document_output_format_preference: "auto",
  });
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [remoteSettings, auditLogs] = await Promise.all([
          getDocumentAiSettings(),
          listDocumentAiAuditLogs(20),
        ]);
        if (!mounted) return;
        setSettings({
          document_ai_enabled: Boolean(remoteSettings.document_ai_enabled),
          document_ai_provider: remoteSettings.document_ai_provider || "local",
          document_ai_redaction_mode: remoteSettings.document_ai_redaction_mode || "none",
          document_ai_retain_artifacts_days:
            Number(remoteSettings.document_ai_retain_artifacts_days) || 30,
          document_output_format_preference:
            remoteSettings.document_output_format_preference || "auto",
        });
        setLogs(auditLogs);
      } catch (error) {
        console.error("[SettingsDocuments] Failed to load document AI settings:", error);
        showToast("Failed to load document AI settings", "error");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [showToast]);

  const onChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateDocumentAiSettings(settings);
      setSettings({
        document_ai_enabled: Boolean(updated.document_ai_enabled),
        document_ai_provider: updated.document_ai_provider || "local",
        document_ai_redaction_mode: updated.document_ai_redaction_mode || "none",
        document_ai_retain_artifacts_days:
          Number(updated.document_ai_retain_artifacts_days) || 30,
        document_output_format_preference:
          updated.document_output_format_preference || "auto",
      });
      setLogs(await listDocumentAiAuditLogs(20));
      showToast("Document AI settings saved", "success");
    } catch (error) {
      console.error("[SettingsDocuments] Failed to save document AI settings:", error);
      showToast("Failed to save document AI settings", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <ContentSection title="Document AI">
        <div className="p-6 space-y-6">
          {loading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Loading settings...</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    Enable cloud document understanding
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    If disabled, all extraction stays local only.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.document_ai_enabled}
                  onChange={(e) => onChange("document_ai_enabled", e.target.checked)}
                  className="h-4 w-4"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Provider
                  </label>
                  <select
                    value={settings.document_ai_provider}
                    onChange={(e) => onChange("document_ai_provider", e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="local">local</option>
                    <option value="openai">openai</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Redaction mode
                  </label>
                  <select
                    value={settings.document_ai_redaction_mode}
                    onChange={(e) => onChange("document_ai_redaction_mode", e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="none">none</option>
                    <option value="basic">basic</option>
                    <option value="strict">strict</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Retention days
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={settings.document_ai_retain_artifacts_days}
                    onChange={(e) =>
                      onChange(
                        "document_ai_retain_artifacts_days",
                        Number.parseInt(e.target.value || "30", 10),
                      )
                    }
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Preferred output format
                  </label>
                  <select
                    value={settings.document_output_format_preference}
                    onChange={(e) => onChange("document_output_format_preference", e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="auto">Auto</option>
                    <option value="pdf">PDF</option>
                    <option value="docx">DOCX</option>
                    <option value="xlsx">XLSX</option>
                    <option value="html">HTML</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save settings"}
                </button>
              </div>
            </>
          )}
        </div>
      </ContentSection>

      <ContentSection title="Document AI Audit (Latest)">
        <div className="p-6 space-y-3">
          {logs.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No audit entries yet.</p>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="p-3 border border-slate-200 dark:border-slate-700 rounded text-xs"
              >
                <div className="font-medium text-slate-900 dark:text-white">
                  {log.action} ({log.provider})
                </div>
                <div className="text-slate-500 dark:text-slate-400 mt-1">
                  policy={log.policy_mode} | document={log.document_id ?? "n/a"} | {log.created_at}
                </div>
                {log.detail ? (
                  <div className="text-slate-600 dark:text-slate-300 mt-1 break-words">{log.detail}</div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </ContentSection>

      <TemplateManagement />
    </div>
  );
}
