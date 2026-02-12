import type { TFunction } from "i18next";
import type { FollowUpSuggestion } from "../../services/api/agent";

const INTENT_TARGET_MAP: Record<string, string> = {
  LIST_CLIENTS: "client",
  READ_CLIENT: "client",
  EXPLAIN_CLIENT_STATE: "client",
  SUMMARIZE_CLIENT: "client",
  LIST_DOSSIERS: "dossier",
  READ_DOSSIER: "dossier",
  EXPLAIN_DOSSIER_STATE: "dossier",
  SUMMARIZE_DOSSIER: "dossier",
  LIST_LAWSUITS: "lawsuit",
  READ_LAWSUIT: "lawsuit",
  EXPLAIN_LAWSUIT_STATE: "lawsuit",
  SUMMARIZE_LAWSUIT: "lawsuit",
  LIST_SESSIONS: "session",
  READ_SESSION: "session",
  EXPLAIN_SESSION_STATE: "session",
  SUMMARIZE_SESSION: "session",
  LIST_TASKS: "task",
  READ_TASK: "task",
  EXPLAIN_TASK_STATE: "task",
  SUMMARIZE_TASK: "task",
  LIST_PERSONAL_TASKS: "personal_task",
  READ_PERSONAL_TASK: "personal_task",
  EXPLAIN_PERSONAL_TASK_STATE: "personal_task",
  SUMMARIZE_PERSONAL_TASK: "personal_task",
  LIST_MISSIONS: "mission",
  READ_MISSION: "mission",
  EXPLAIN_MISSION_STATE: "mission",
  SUMMARIZE_MISSION: "mission",
  LIST_FINANCIAL_ENTRIES: "financial_entry",
  READ_FINANCIAL_ENTRY: "financial_entry",
  EXPLAIN_FINANCIAL_ENTRY_STATE: "financial_entry",
  SUMMARIZE_FINANCIAL_ENTRY: "financial_entry",
  LIST_NOTIFICATIONS: "notification",
  READ_NOTIFICATION: "notification",
  EXPLAIN_NOTIFICATION_STATE: "notification",
  SUMMARIZE_NOTIFICATION: "notification",
  LIST_HISTORY_EVENTS: "history_event",
  READ_HISTORY_EVENT: "history_event",
  EXPLAIN_HISTORY_STATE: "history_event",
  SUMMARIZE_HISTORY: "history_event",
  LIST_OVERDUE_TASKS: "task",
  LIST_UPCOMING_SESSIONS: "session",
};

const VERB_KEY_MAP: Record<string, string> = {
  list: "list",
  show: "show",
  open: "open",
  view: "view",
  summarize: "summarize",
  explain: "explain",
  review: "review",
};

const SPECIAL_LABEL_KEYS = new Set([
  "how_created",
  "review_context",
  "review_details",
  "explain_status",
]);

function humanize(value: string): string {
  return String(value || "").replace(/_/g, " ").trim();
}

function resolveTargetType(followUp: FollowUpSuggestion): string | null {
  return (
    followUp.target?.type ||
    INTENT_TARGET_MAP[String(followUp.intent || "").toUpperCase()] ||
    null
  );
}

function resolveEntityLabel(
  type: string | null,
  form: "singular" | "plural",
  t: TFunction,
): string {
  if (!type) {
    return t(`agent.followUps.entities.generic.${form}`, { defaultValue: form === "plural" ? "records" : "record" });
  }
  const key = `agent.followUps.entities.${type}.${form}`;
  const translated = t(key);
  if (translated && translated !== key) return translated;
  if (form === "plural") {
    const human = humanize(type);
    return human.endsWith("s") ? human : `${human}s`;
  }
  return humanize(type);
}

function translateValue(value: string, t: TFunction): string {
  const normalized = String(value || "").toLowerCase();
  const key = `agent.followUps.values.${normalized}`;
  const translated = t(key);
  if (translated && translated !== key) return translated;
  return humanize(normalized);
}

function buildQualifierLabel(
  filters: FollowUpSuggestion["filters"] | undefined,
  t: TFunction,
): string | null {
  if (!filters) return null;
  const qualifiers: string[] = [];

  if (filters.status) qualifiers.push(translateValue(filters.status, t));
  if (!filters.status && filters.activity === "active") {
    qualifiers.push(t("agent.followUps.qualifiers.active"));
  }
  if (filters.paymentStatus) qualifiers.push(translateValue(filters.paymentStatus, t));
  if (filters.priority) {
    const priorityValue = translateValue(filters.priority, t);
    qualifiers.push(
      t("agent.followUps.qualifiers.priority", { priority: priorityValue })
    );
  }
  if (filters.overdue) qualifiers.push(t("agent.followUps.qualifiers.overdue"));
  if (filters.timeframe) qualifiers.push(translateValue(filters.timeframe, t));
  if (filters.direction) qualifiers.push(translateValue(filters.direction, t));
  if (filters.scope) qualifiers.push(translateValue(filters.scope, t));
  if (filters.severity) qualifiers.push(translateValue(filters.severity, t));

  if (qualifiers.length === 0) return null;
  return qualifiers.join(" ");
}

function buildListTargetLabel(followUp: FollowUpSuggestion, t: TFunction): string {
  const targetType = resolveTargetType(followUp);
  const base = resolveEntityLabel(targetType, "plural", t);
  const qualifierText = buildQualifierLabel(followUp.filters, t);
  if (!qualifierText) return base;
  return t("agent.followUps.patterns.qualified", {
    qualifiers: qualifierText,
    target: base,
  });
}

function buildTargetLabel(
  followUp: FollowUpSuggestion,
  form: "singular" | "plural",
  t: TFunction,
): string {
  if (followUp.target?.label) return followUp.target.label;
  const targetType = resolveTargetType(followUp);
  return resolveEntityLabel(targetType, form, t);
}

function deriveLabelKey(intent: string): string | null {
  const normalized = String(intent || "").toUpperCase();
  if (normalized.startsWith("LIST_")) return "list";
  if (normalized.startsWith("READ_")) return "view";
  if (normalized.startsWith("SUMMARIZE_")) return "summarize";
  if (normalized.startsWith("EXPLAIN_")) return "explain";
  return null;
}

export function buildFollowUpLabel(
  followUp: FollowUpSuggestion,
  t: TFunction,
): string {
  if (!followUp) return "";
  if (followUp.category === "planning" && followUp.label) return followUp.label;

  // Special handling for context resolution
  if (followUp.intent === "RESOLVE_CONTEXT_AND_CONTINUE") {
    if (followUp.resolvedEntity?.label) {
      return followUp.resolvedEntity.label;
    }
    return followUp.label || "";
  }

  const labelKey = followUp.labelKey || deriveLabelKey(followUp.intent);

  if (labelKey && SPECIAL_LABEL_KEYS.has(labelKey)) {
    switch (labelKey) {
      case "how_created":
        return t("agent.followUps.patterns.howCreated", {
          target: buildTargetLabel(followUp, "singular", t),
        });
      case "review_context":
        return t("agent.followUps.patterns.reviewContext", {
          target: buildTargetLabel(followUp, "singular", t),
        });
      case "review_details":
        return t("agent.followUps.patterns.reviewDetails", {
          target: buildTargetLabel(followUp, "singular", t),
        });
      case "explain_status":
        return t("agent.followUps.patterns.explainStatus", {
          target: buildTargetLabel(followUp, "singular", t),
        });
      default:
        break;
    }
  }

  const verbKey = labelKey && VERB_KEY_MAP[labelKey] ? labelKey : "list";
  const verb = t(`agent.followUps.verbs.${VERB_KEY_MAP[verbKey] || "list"}`);
  const isListAction = verbKey === "list" || verbKey === "show";
  const baseTargetLabel = isListAction
    ? buildListTargetLabel(followUp, t)
    : buildTargetLabel(followUp, "singular", t);

  const count = followUp.target?.count;
  const targetLabel =
    typeof count === "number" && isListAction
      ? t("agent.followUps.patterns.withCount", {
          target: baseTargetLabel,
          count,
        })
      : baseTargetLabel;

  if (isListAction && followUp.parent?.label) {
    return t("agent.followUps.patterns.scoped", {
      verb,
      target: targetLabel,
      parent: followUp.parent.label,
    });
  }

  const built = t("agent.followUps.patterns.target", {
    verb,
    target: targetLabel,
  });

  return built || followUp.label || "";
}
