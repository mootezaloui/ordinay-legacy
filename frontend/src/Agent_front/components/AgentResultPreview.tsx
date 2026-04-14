import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Database,
  Zap,
  FolderOpen,
  Users,
  CheckSquare,
  Calendar,
  FileText,
  Wallet,
  Bell,
  History,
} from "lucide-react";
import { useData } from "../../contexts/DataContext";
import { useNotifications } from "../../contexts/NotificationContext";
import { DataAccessPermissions } from "../../services/api/agent";
import { apiClient } from "../../services/api/client";

interface DataContext {
  clients?: Array<{ id: number; name?: string; reference?: string }>;
  dossiers?: Array<{
    id: number;
    reference?: string;
    title?: string;
    status?: string;
    clientId?: number;
  }>;
  lawsuits?: Array<{ id: number; reference?: string; lawsuit_number?: string }>;
  tasks?: Array<{
    id: number;
    title?: string;
    status?: string;
    priority?: string;
    due_date?: string;
  }>;
  personalTasks?: Array<{
    id: number;
    title?: string;
    status?: string;
    due_date?: string;
  }>;
  missions?: Array<{ id: number; reference?: string; status?: string }>;
  sessions?: Array<{
    id: number;
    title?: string;
    scheduled_at?: string;
    session_date?: string;
  }>;
  financialEntries?: Array<{
    id: number;
    reference?: string;
    status?: string;
    due_date?: string;
    paid_at?: string;
  }>;
  loading?: boolean;
}

const DATA_SOURCE_CONFIG = [
  { id: "dossiers", labelKey: "dossiers", icon: FolderOpen },
  { id: "clients", labelKey: "clients", icon: Users },
  { id: "lawsuits", labelKey: "lawsuits", icon: FileText },
  { id: "tasks", labelKey: "tasks", icon: CheckSquare },
  { id: "personalTasks", labelKey: "personalTasks", icon: CheckSquare },
  { id: "missions", labelKey: "missions", icon: Zap },
  { id: "sessions", labelKey: "sessions", icon: Calendar },
  { id: "financialEntries", labelKey: "financialEntries", icon: Wallet },
  { id: "notifications", labelKey: "notifications", icon: Bell },
  { id: "history", labelKey: "history", icon: History },
  { id: "documents", labelKey: "documents", icon: FileText },
];

interface AgentResultPreviewProps {
  dataAccess: DataAccessPermissions;
  setDataAccess: React.Dispatch<React.SetStateAction<DataAccessPermissions>>;
}

export function AgentResultPreview({
  dataAccess,
  setDataAccess,
}: AgentResultPreviewProps) {
  const { t } = useTranslation("common");
  const data = useData() as DataContext;
  const { notifications = [] } = useNotifications();
  const [auxCounts, setAuxCounts] = useState<{
    history: number | null;
    documents: number | null;
  }>({
    history: null,
    documents: null,
  });

  const {
    dossiers = [],
    clients = [],
    lawsuits = [],
    tasks = [],
    personalTasks = [],
    missions = [],
    sessions = [],
    financialEntries = [],
  } = data || {};

  useEffect(() => {
    let isMounted = true;

    const fetchAuxCounts = async () => {
      try {
        const [historyRes, documentsRes] = await Promise.all([
          apiClient.get<{ count: number }>("/history/count"),
          apiClient.get<{ count: number }>("/documents/count"),
        ]);

        if (!isMounted) return;

        setAuxCounts({
          history: Number.isFinite(historyRes?.count) ? historyRes.count : 0,
          documents: Number.isFinite(documentsRes?.count)
            ? documentsRes.count
            : 0,
        });
      } catch (error) {
        console.error("[AgentResultPreview] Failed to load aux counts:", error);
        if (!isMounted) return;
        setAuxCounts((prev) => ({
          history: prev.history ?? 0,
          documents: prev.documents ?? 0,
        }));
      }
    };

    fetchAuxCounts();

    return () => {
      isMounted = false;
    };
  }, [
    clients.length,
    dossiers.length,
    lawsuits.length,
    tasks.length,
    personalTasks.length,
    missions.length,
    sessions.length,
    financialEntries.length,
  ]);

  const handleToggleSource = (id: keyof DataAccessPermissions) => {
    setDataAccess((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleToggleAll = () => {
    const allEnabled = Object.values(dataAccess).every(Boolean);
    const newState = {} as DataAccessPermissions;
    (Object.keys(dataAccess) as Array<keyof DataAccessPermissions>).forEach((key) => {
      newState[key] = !allEnabled;
    });
    setDataAccess(newState);
  };

  return (
    <div className="h-full w-full flex flex-col border-l border-black/[0.05] dark:border-white/[0.04] bg-[#f9fafb] dark:bg-[#0f172a] overflow-hidden">
      <div className="p-4 border-b border-black/[0.05] dark:border-white/[0.04] flex-shrink-0">
        <button
          type="button"
          onClick={handleToggleAll}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors w-full
            ${
              Object.values(dataAccess).some(Boolean)
                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 cursor-pointer"
                : "bg-black/[0.04] dark:bg-white/[0.05] border-slate-300 dark:border-slate-600 cursor-pointer"
            }`}
          aria-pressed={Object.values(dataAccess).some(Boolean) ? "true" : "false"}
        >
          <div
            className={`w-2 h-2 rounded-full animate-pulse
            ${
              Object.values(dataAccess).some(Boolean)
                ? "bg-green-500"
                : "bg-red-500 dark:bg-slate-600 animate-none"
            }`}
          ></div>
          <span
            className={`text-xs font-medium
            ${
              Object.values(dataAccess).some(Boolean)
                ? "text-green-700 dark:text-green-300"
                : "text-slate-500 dark:text-slate-400 line-through"
            }`}
          >
            {Object.values(dataAccess).some(Boolean)
              ? t("agent.context.connected")
              : t("agent.context.disabled")}
          </span>
        </button>
      </div>

      <div className="p-4 border-b border-black/[0.05] dark:border-white/[0.04] flex-shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          <h3 className="text-xs font-bold text-[#0f172a] dark:text-[#f1f5f9] uppercase tracking-wide">
            {t("agent.context.dataAccess")}
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {DATA_SOURCE_CONFIG.map((source) => {
            const IconComponent = source.icon;
            let value: string | number = "--";
            if (source.id === "dossiers") value = dossiers.length;
            else if (source.id === "clients") value = clients.length;
            else if (source.id === "lawsuits") value = lawsuits.length;
            else if (source.id === "tasks") value = tasks.length;
            else if (source.id === "personalTasks") value = personalTasks.length;
            else if (source.id === "missions") value = missions.length;
            else if (source.id === "sessions") value = sessions.length;
            else if (source.id === "financialEntries") value = financialEntries.length;
            else if (source.id === "notifications") value = notifications.length;
            else if (source.id === "history") value = auxCounts.history ?? "--";
            else if (source.id === "documents") value = auxCounts.documents ?? "--";
            const enabled = dataAccess[source.id as keyof DataAccessPermissions];
            return (
              <button
                key={source.id}
                type="button"
                onClick={() => handleToggleSource(source.id as keyof DataAccessPermissions)}
                className={`relative p-3 w-full text-left bg-black/[0.03] dark:bg-white/[0.04] rounded-lg transition-colors border-2 ${
                  enabled
                    ? "border-green-200 dark:border-green-800 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                    : "border-slate-300 dark:border-slate-600 opacity-60"
                }`}
                aria-pressed={enabled ? "true" : "false"}
                tabIndex={0}
              >
                <div
                  className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full ${
                    enabled ? "bg-green-500" : "bg-red-500 dark:bg-slate-600"
                  }`}
                ></div>
                <IconComponent
                  className={`w-4 h-4 mb-2 ${
                    enabled
                      ? "text-slate-600 dark:text-slate-400"
                      : "text-slate-400 dark:text-slate-600"
                  }`}
                />
                <div
                  className={`text-xs font-medium ${
                    enabled
                      ? "text-[#0f172a] dark:text-[#f1f5f9]"
                      : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {value}
                </div>
                <div
                  className={`text-xs ${
                    enabled
                      ? "text-slate-500 dark:text-slate-400"
                      : "text-slate-400 dark:text-slate-600"
                  }`}
                >
                  {t(`agent.context.sources.${source.labelKey}`)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}
