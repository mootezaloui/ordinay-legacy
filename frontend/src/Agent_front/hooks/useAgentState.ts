import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AgentMessage, AgentMessageData } from "../types/agentMessage";
import { useAgentSessions } from "./useAgentSessions";
import { getAIProviderConfig } from "../../services/api/aiProvider";
import {
  streamAgentMessage,
  ActionProposal,
  AssistSuggestionItem,
  AssistSuggestionsOutput,
  ChatMutationLifecycleEvent,
  ContextScope,
  ExecutionResult,
  AgentVersion,
  DataAccessPermissions,
  AgentRequestMetadata,
  AgentModelPreference,
  FollowUpSuggestion,
  FollowUpIntent,
  ExplanationOutput,
  CollectionOutput,
  CommentaryOutput,
  ConfirmationPreviewCascadeGroup,
  ConfirmationPreviewChange,
  PlanArtifactEventData,
  PlanExecutedEventData,
  ProposalOutput,
  StructuredProposal,
  StructuredProposalField,
  StatusEventData,
  SuggestionArtifactEventData,
  WebSearchResultsOutput,
} from "../../services/api/agent";
import { uploadAttachments } from "../../services/api/agentDocuments";
import type { AttachedFile } from "../components/AgentInput";
import { buildFollowUpLabel } from "../utils/followUpLabels";
import {
  attachChatbotTurn,
  chatbotTurnReducer,
  resolveChatbotMutationStateFromAssistantResult,
  resolveChatbotMutationStateFromDone,
} from "../utils/chatbotTurnReducer";
import {
  emitEntityMutationFromAgentOutcome,
  emitEntityMutationFromBackendEvent,
} from "../../core/mutationSync";

// Default data access - all domains enabled
const DEFAULT_DATA_ACCESS: DataAccessPermissions = {
  clients: true,
  dossiers: true,
  lawsuits: true,
  tasks: true,
  personalTasks: true,
  missions: true,
  sessions: true,
  financialEntries: true,
  notifications: true,
  history: true,
  documents: true,
};

// Storage key for persisting data access permissions
const DATA_ACCESS_STORAGE_KEY = 'ordinay_agent_data_access';
const MODEL_PREFERENCE_STORAGE_KEY = "ordinay_agent_model_preference";
const HISTORY_SIDEBAR_BREAKPOINT = 1024; // lg
const CONTEXT_SIDEBAR_BREAKPOINT = 1536; // 2xl
const HISTORY_SIDEBAR_STORAGE_KEY = "ordinay_agent_history_sidebar";
const CONTEXT_SIDEBAR_STORAGE_KEY = "ordinay_agent_context_sidebar";

const streamRegistry: {
  abortController: AbortController | null;
  sessionId: string | null;
  isStreaming: boolean;
} = {
  abortController: null,
  sessionId: null,
  isStreaming: false,
};

type StreamListener = (state: { isStreaming: boolean; sessionId: string | null }) => void;

const streamListeners = new Set<StreamListener>();

const notifyStreamListeners = () => {
  const snapshot = {
    isStreaming: streamRegistry.isStreaming,
    sessionId: streamRegistry.sessionId,
  };
  streamListeners.forEach((listener) => listener(snapshot));
};

type TransientStatus = {
  sessionId: string;
  action: string;
  phase?: string;
};

function getInitialSidebarVisibility() {
  if (typeof window === "undefined") {
    return { showHistory: true, showContext: true };
  }

  const defaultHistory = window.matchMedia(
    `(min-width: ${HISTORY_SIDEBAR_BREAKPOINT}px)`
  ).matches;
  const defaultContext = window.matchMedia(
    `(min-width: ${CONTEXT_SIDEBAR_BREAKPOINT}px)`
  ).matches;

  try {
    const storedHistory = localStorage.getItem(HISTORY_SIDEBAR_STORAGE_KEY);
    const storedContext = localStorage.getItem(CONTEXT_SIDEBAR_STORAGE_KEY);

    return {
      showHistory:
        storedHistory === null ? defaultHistory : storedHistory === "true",
      showContext:
        storedContext === null ? defaultContext : storedContext === "true",
    };
  } catch {
    return { showHistory: defaultHistory, showContext: defaultContext };
  }
}

/**
 * Load data access permissions from localStorage
 * Returns DEFAULT_DATA_ACCESS if no saved state exists
 */
function loadDataAccessFromStorage(): DataAccessPermissions {
  try {
    const stored = localStorage.getItem(DATA_ACCESS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate structure - ensure all required keys exist
      const validated: DataAccessPermissions = { ...DEFAULT_DATA_ACCESS };
      for (const key of Object.keys(DEFAULT_DATA_ACCESS) as Array<keyof DataAccessPermissions>) {
        if (typeof parsed[key] === 'boolean') {
          validated[key] = parsed[key];
        }
      }
      return validated;
    }
  } catch {
    // Ignore parse errors, return default
  }
  return DEFAULT_DATA_ACCESS;
}

/**
 * Save data access permissions to localStorage
 */
function saveDataAccessToStorage(dataAccess: DataAccessPermissions): void {
  try {
    localStorage.setItem(DATA_ACCESS_STORAGE_KEY, JSON.stringify(dataAccess));
  } catch {
    // Ignore storage errors
  }
}

function loadModelPreferenceFromStorage(): AgentModelPreference {
  try {
    const stored = String(localStorage.getItem(MODEL_PREFERENCE_STORAGE_KEY) || "").trim();
    if (stored) return stored;
  } catch {
    // Ignore storage errors
  }
  return "";
}

function saveModelPreferenceToStorage(value: AgentModelPreference): void {
  try {
    localStorage.setItem(MODEL_PREFERENCE_STORAGE_KEY, value);
  } catch {
    // Ignore storage errors
  }
}

function createMessageId(prefix: "u" | "a" | "i"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function mergeUniqueCommentaryLines(existingMessage: string, incomingMessage: string): string {
  const lines = `${String(existingMessage || "").trim()}\n${String(incomingMessage || "").trim()}`
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const uniqueLines: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const dedupeKey = line.replace(/\s+/g, " ").toLowerCase();
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      uniqueLines.push(line);
    }
  }

  return uniqueLines.join("\n");
}

type ProposalUiState = NonNullable<ActionProposal["uiState"]>;

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toPlanActionType(operation: string): ActionProposal["actionType"] {
  const normalized = String(operation || "").trim().toLowerCase();
  if (normalized === "create") return "CREATE_ENTITY";
  if (normalized === "delete") return "DELETE_ENTITY";
  return "UPDATE_ENTITY";
}

function normalizePlanChanges(
  value: unknown,
): Record<string, { from: unknown; to: unknown }> | undefined {
  const record = toRecord(value);
  if (!record) return undefined;
  const normalized: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, raw] of Object.entries(record)) {
    if (!key) continue;
    const row = toRecord(raw);
    if (row && ("from" in row || "to" in row)) {
      normalized[key] = { from: row.from, to: row.to };
      continue;
    }
    normalized[key] = { from: undefined, to: raw };
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

const PLAN_FIELD_LABELS: Record<string, string> = {
  status: "Status",
  phone: "Phone",
  email: "Email",
  name: "Name",
  title: "Title",
  priority: "Priority",
  type: "Type",
  due_date: "Due date",
  dueDate: "Due date",
  hearing_date: "Hearing date",
  hearingDate: "Hearing date",
  client_id: "Client",
  clientId: "Client",
  dossier_id: "Dossier",
  dossierId: "Dossier",
  lawsuit_id: "Lawsuit",
  lawsuitId: "Lawsuit",
};

function toTitleCase(value: string): string {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function humanizePlanField(key: string): string {
  const normalized = String(key || "").trim();
  if (!normalized) return "Field";
  return PLAN_FIELD_LABELS[normalized] || toTitleCase(normalized);
}

function formatPlanValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Current";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  const text = String(value).trim();
  if (!text) return "Current";
  return text;
}

function formatPlanDiffValue(from: unknown, to: unknown): string {
  const before = formatPlanValue(from);
  const after = formatPlanValue(to);
  return `${before} -> ${after}`;
}

interface PlanPreviewLinkingCandidateValue {
  entityType: string;
  entityId: number | string;
  label?: string;
  source?: string;
}

interface PlanPreviewLinkingValue {
  status: string;
  source?: string;
  userSpecified?: boolean;
  resolutionLabel?: string;
  target?: {
    entityType: string;
    entityId: number | string;
    label?: string;
    field?: string;
  };
  ambiguousCandidates?: PlanPreviewLinkingCandidateValue[];
}

function normalizePlanPreviewLinking(value: unknown): PlanPreviewLinkingValue | undefined {
  const row = toRecord(value);
  if (!row) return undefined;
  const status = String(row.status || "").trim().toLowerCase();
  if (!["unchanged", "resolved", "ambiguous", "unresolved"].includes(status)) {
    return undefined;
  }
  const targetRow = toRecord(row.target);
  const targetEntityType = String(targetRow?.entityType || "").trim().toLowerCase();
  const targetEntityId = targetRow?.entityId;
  const target =
    targetEntityType && (typeof targetEntityId === "number" || typeof targetEntityId === "string")
      ? {
          entityType: targetEntityType,
          entityId: targetEntityId,
          ...(typeof targetRow?.label === "string" && targetRow.label.trim().length > 0
            ? { label: targetRow.label.trim() }
            : {}),
          ...(typeof targetRow?.field === "string" && targetRow.field.trim().length > 0
            ? { field: targetRow.field.trim() }
            : {}),
        }
      : undefined;
  const candidates = Array.isArray(row.ambiguousCandidates)
    ? row.ambiguousCandidates
        .map((entry) => {
          const item = toRecord(entry);
          if (!item) return null;
          const entityType = String(item.entityType || "").trim().toLowerCase();
          const entityId = item.entityId;
          if (!entityType || (typeof entityId !== "number" && typeof entityId !== "string")) {
            return null;
          }
          return {
            entityType,
            entityId,
            ...(typeof item.label === "string" && item.label.trim().length > 0
              ? { label: item.label.trim() }
              : {}),
            ...(typeof item.source === "string" && item.source.trim().length > 0
              ? { source: item.source.trim().toLowerCase() }
              : {}),
          };
        })
        .filter((entry): entry is PlanPreviewLinkingCandidateValue => Boolean(entry))
    : [];
  return {
    status,
    ...(typeof row.source === "string" && row.source.trim().length > 0
      ? { source: row.source.trim().toLowerCase() }
      : {}),
    ...(typeof row.userSpecified === "boolean" ? { userSpecified: row.userSpecified } : {}),
    ...(typeof row.resolutionLabel === "string" && row.resolutionLabel.trim().length > 0
      ? { resolutionLabel: row.resolutionLabel.trim() }
      : {}),
    ...(target ? { target } : {}),
    ...(candidates.length > 0 ? { ambiguousCandidates: candidates } : {}),
  };
}

function formatPlanLinkingTarget(linking?: PlanPreviewLinkingValue): string | null {
  if (!linking?.target) return null;
  const target = linking.target;
  const typeLabel = toTitleCase(String(target.entityType || "").replace(/_/g, " ")) || "Record";
  const label =
    typeof target.label === "string" && target.label.trim().length > 0
      ? target.label.trim()
      : `${typeLabel} #${String(target.entityId)}`;
  return `${typeLabel}: ${label}`;
}

function formatPlanLinkingSource(linking?: PlanPreviewLinkingValue): string | null {
  if (!linking) return null;
  if (typeof linking.resolutionLabel === "string" && linking.resolutionLabel.trim().length > 0) {
    return linking.resolutionLabel.trim();
  }
  if (linking.userSpecified === true || linking.source === "payload") {
    return "User-specified in your request";
  }
  if (linking.status === "resolved") {
    if (linking.source === "draft_context") return "Auto-resolved from current draft context";
    if (linking.source === "active_entities") return "Auto-resolved from active session context";
    return "Auto-resolved from available context";
  }
  if (linking.status === "ambiguous") {
    return "Needs parent-link clarification";
  }
  if (linking.status === "unresolved") {
    return "Missing parent-link context";
  }
  return null;
}

function sanitizePlanEffectLine(value: string): string {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/execution is paused until an explicit domain decision is provided/i.test(text)) {
    return "Execution will continue after you choose one of the required decisions.";
  }
  return text;
}

function entityTypeLabel(entityType: string): string {
  const normalized = String(entityType || "").trim().toLowerCase();
  if (!normalized) return "record";
  if (normalized === "financial_entry") return "financial entry";
  if (normalized === "personal_task") return "personal task";
  return toTitleCase(normalized).toLowerCase();
}

function pluralizeEntityType(entityType: string, count: number): string {
  const base = entityTypeLabel(entityType);
  if (count === 1) return base;
  if (base.endsWith("y")) return `${base.slice(0, -1)}ies`;
  if (base.endsWith("s")) return base;
  return `${base}s`;
}

function buildPlanStructuredProposal(input: {
  operation: string;
  entityType: string;
  entityId?: number;
  summary: string;
  previewSubtitle?: string;
  rootLabel?: string;
  rootType?: string;
  rootId?: number;
  reversible: boolean;
  linking?: PlanPreviewLinkingValue;
  primaryChanges: Array<{
    field: string;
    from: unknown;
    to: unknown;
  }>;
  cascadeSummary: ConfirmationPreviewCascadeGroup[];
  warnings: string[];
  decisions: string[];
}): StructuredProposal {
  const {
    operation,
    entityType,
    entityId,
    summary,
    previewSubtitle,
    rootLabel,
    rootType,
    rootId,
    reversible,
    linking,
    primaryChanges,
    cascadeSummary,
    warnings,
    decisions,
  } = input;

  const fields: StructuredProposalField[] = primaryChanges.slice(0, 6).map((change) => ({
    key: change.field,
    label: humanizePlanField(change.field),
    value: formatPlanDiffValue(change.from, change.to),
  }));

  if (fields.length === 0) {
    fields.push({
      key: "planned_change",
      label: "Main change",
      value: summary || "Apply the requested change",
    });
  }

  const linkedTarget = formatPlanLinkingTarget(linking);
  if (linkedTarget) {
    fields.push({
      key: "linked_to",
      label: "Linked to",
      value: linkedTarget,
    });
  }
  const linkingSource = formatPlanLinkingSource(linking);
  if (linkingSource) {
    fields.push({
      key: "link_source",
      label: "Link source",
      value: linkingSource,
    });
  }

  const relatedLines: string[] = [];
  for (const group of cascadeSummary) {
    const count = Number(group.totalCount || 0);
    if (!Number.isFinite(count) || count <= 0) continue;
    const fieldSummary = Array.isArray(group.changedFields)
      ? group.changedFields.map((row) => humanizePlanField(String(row || ""))).filter(Boolean)
      : [];
    const fieldsText =
      fieldSummary.length > 0
        ? ` (fields: ${fieldSummary.slice(0, 3).join(", ")}${fieldSummary.length > 3 ? ` +${fieldSummary.length - 3} more` : ""})`
        : "";
    relatedLines.push(
      `${count} ${pluralizeEntityType(String(group.entityType || ""), count)} will be updated${fieldsText}.`,
    );
  }

  for (const line of warnings) {
    const text = sanitizePlanEffectLine(String(line || "").trim());
    if (!text) continue;
    relatedLines.push(text);
  }
  for (const line of decisions) {
    const text = String(line || "").trim();
    if (!text) continue;
    relatedLines.push(`Decision required: ${text}`);
  }

  const dedupedRelatedLines = [...new Set(relatedLines)];
  const derivedRootType = String(rootType || entityType || "").trim().toLowerCase();
  const derivedRootId =
    Number.isFinite(rootId) && Number(rootId) > 0
      ? Number(rootId)
      : Number.isFinite(entityId) && Number(entityId) > 0
      ? Number(entityId)
      : undefined;
  const derivedRootLabel = String(rootLabel || "").trim();

  return {
    verb: operation || "update",
    entityType: entityType || "record",
    reversible,
    title: summary || `Confirm ${toTitleCase(operation || "update")} ${entityTypeLabel(entityType)}`,
    subtitle: previewSubtitle || undefined,
    fields,
    ...(dedupedRelatedLines.length > 0
      ? {
          contentPreview: {
            label: "Required related changes",
            text: dedupedRelatedLines.map((line) => `- ${line}`).join("\n"),
          },
        }
      : {}),
    ...(derivedRootType && (derivedRootLabel || derivedRootId != null)
      ? {
          resultTarget: {
            type: derivedRootType,
            ...(derivedRootId != null ? { id: derivedRootId } : {}),
            label:
              derivedRootLabel ||
              `${toTitleCase(entityTypeLabel(derivedRootType))}${
                derivedRootId != null ? ` #${String(derivedRootId)}` : ""
              }`,
          },
        }
      : {}),
  };
}

function mapPlanArtifactToProposalOutput(
  artifact: PlanArtifactEventData,
  sessionId: string,
): ProposalOutput {
  const operation = String(artifact?.operation?.operation || "update").trim().toLowerCase();
  const entityType = String(artifact?.operation?.entityType || "").trim().toLowerCase();
  const entityIdRaw = artifact?.operation?.entityId;
  const numericEntityId = Number(entityIdRaw);
  const hasNumericEntityId = Number.isInteger(numericEntityId) && numericEntityId > 0;
  const operationPayload = toRecord(artifact?.operation?.payload) || undefined;
  const normalizedChanges = normalizePlanChanges(artifact?.operation?.changes);
  const preview = toRecord(artifact?.preview);
  const workflow = toRecord(artifact?.workflow);
  const previewTitle = String(preview?.title || "").trim();
  const previewScope = String(preview?.scope || "").trim().toLowerCase();
  const workflowTotalSteps = Number(workflow?.totalSteps || 0);
  const isWorkflowPreview = previewScope === "workflow" || workflowTotalSteps > 1;
  const warnings = Array.isArray(preview?.warnings)
    ? preview.warnings.map((row) => String(row || "").trim()).filter(Boolean)
    : [];
  const effects = Array.isArray(preview?.effects)
    ? preview.effects.map((row) => String(row || "").trim()).filter(Boolean)
    : [];
  const mergedWarnings = [...new Set([...warnings, ...effects])];
  const previewFields = Array.isArray(preview?.fields) ? preview.fields : [];
  const incomingPrimaryChanges = Array.isArray(preview?.primaryChanges)
    ? (preview.primaryChanges
        .map((row) => {
          const item = toRecord(row);
          if (!item) return null;
          const field = String(item.field || "").trim();
          if (!field) return null;
          return {
            entityType: String(item.entityType || entityType || "").trim().toLowerCase(),
            entityId:
              typeof item.entityId === "number"
                ? item.entityId
                : hasNumericEntityId
                ? numericEntityId
                : null,
            entityLabel:
              typeof item.entityLabel === "string" && item.entityLabel.trim().length > 0
                ? item.entityLabel.trim()
                : undefined,
            field,
            from: Object.prototype.hasOwnProperty.call(item, "from") ? item.from : undefined,
            to: Object.prototype.hasOwnProperty.call(item, "to") ? item.to : undefined,
          };
        })
        .filter(Boolean) as ConfirmationPreviewChange[])
    : [];
  const incomingCascadeSummary = Array.isArray(preview?.cascadeSummary)
    ? (preview.cascadeSummary
        .map((row) => {
          const item = toRecord(row);
          if (!item) return null;
          const groupEntityType = String(item.entityType || "").trim().toLowerCase();
          const totalCount = Number(item.totalCount || 0);
          if (!groupEntityType || !Number.isFinite(totalCount) || totalCount <= 0) return null;
          const changedFields = Array.isArray(item.changedFields)
            ? item.changedFields.map((entry) => String(entry || "").trim()).filter(Boolean)
            : [];
          const examples = Array.isArray(item.examples)
            ? (item.examples
                .map((entry) => {
                  const example = toRecord(entry);
                  if (!example) return null;
                  const field = String(example.field || "").trim();
                  if (!field) return null;
                  return {
                    entityType: String(example.entityType || groupEntityType).trim().toLowerCase(),
                    entityId:
                      typeof example.entityId === "number"
                        ? example.entityId
                        : undefined,
                    entityLabel:
                      typeof example.entityLabel === "string" && example.entityLabel.trim().length > 0
                        ? example.entityLabel.trim()
                        : undefined,
                    field,
                    from: Object.prototype.hasOwnProperty.call(example, "from")
                      ? example.from
                      : undefined,
                    to: Object.prototype.hasOwnProperty.call(example, "to")
                      ? example.to
                      : undefined,
                  };
                })
                .filter(Boolean) as ConfirmationPreviewChange[])
            : [];
          return {
            entityType: groupEntityType,
            totalCount,
            ...(changedFields.length > 0 ? { changedFields } : {}),
            ...(examples.length > 0 ? { examples } : {}),
          };
        })
        .filter(Boolean) as ConfirmationPreviewCascadeGroup[])
    : [];
  const previewLinking = normalizePlanPreviewLinking(preview?.linking);
  const previewDecisions = Array.isArray(preview?.decisions)
    ? preview.decisions
        .map((row) => {
          const item = toRecord(row);
          if (!item) return null;
          const title = String(item.title || "").trim();
          const description = String(item.description || "").trim();
          if (!title || !description) return null;
          return `${title}: ${description}`;
        })
        .filter((row): row is string => typeof row === "string" && row.length > 0)
    : [];

  const primaryChangesRaw =
    incomingPrimaryChanges.length > 0
      ? incomingPrimaryChanges
      : previewFields.length > 0
      ? previewFields
          .map((row) => {
            const field = String((row as { key?: unknown })?.key || "").trim();
            if (!field) return null;
            const change = row as { from?: unknown; to?: unknown };
            return {
              entityType,
              entityId: hasNumericEntityId ? numericEntityId : null,
              field,
              from: "from" in change ? change.from : undefined,
              to: "to" in change ? change.to : undefined,
            };
          })
          .filter(Boolean)
      : Object.entries(normalizedChanges || {}).map(([field, change]) => ({
          entityType,
          entityId: hasNumericEntityId ? numericEntityId : null,
          field,
          from: change.from,
          to: change.to,
        }));
  const primaryChanges = primaryChangesRaw as Array<{
    entityType: string;
    entityId: number | null;
    field: string;
    from: unknown;
    to: unknown;
  }>;
  const summary =
    String(artifact?.summary || "").trim() ||
    `Confirm ${operation || "update"} request`;
  const previewRoot = toRecord(preview?.root);
  const previewRootType = String(previewRoot?.type || entityType || "").trim().toLowerCase();
  const previewRootId = Number(previewRoot?.id);
  const previewRootLabel = String(previewRoot?.label || previewTitle || "").trim();
  const previewReversibility = String(preview?.reversibility || "").trim();
  const actionType: ActionProposal["actionType"] = isWorkflowPreview
    ? "EXECUTE_MUTATION_WORKFLOW"
    : toPlanActionType(operation);

  const proposal: ActionProposal = {
    proposalId: String(artifact?.pendingActionId || ""),
    status: "PENDING_CONFIRMATION",
    action: `plan_${operation || "update"}`,
    description: summary,
    requiresConfirmation: true,
    sessionId,
    actionType,
    toolCategory: "PLAN",
    params: {
      entityType,
      ...(hasNumericEntityId ? { entityId: numericEntityId } : {}),
      ...(operationPayload ? { payload: operationPayload } : {}),
      ...(normalizedChanges ? { changes: normalizedChanges } : {}),
      ...(previewTitle ? { entityLabel: previewTitle } : {}),
      ...(isWorkflowPreview
        ? {
            workflow: {
              totalSteps: Number.isFinite(workflowTotalSteps) ? workflowTotalSteps : undefined,
              steps: Array.isArray(workflow?.steps) ? workflow.steps : [],
              rootEntity: {
                type: previewRootType || entityType || undefined,
                id:
                  Number.isFinite(previewRootId) && previewRootId > 0
                    ? previewRootId
                    : hasNumericEntityId
                    ? numericEntityId
                    : undefined,
                label: previewRootLabel || undefined,
              },
            },
          }
        : {}),
    },
    reversible:
      previewReversibility === "not_reversible"
        ? false
        : previewReversibility === "reversible"
        ? true
        : operation !== "delete",
    humanReadableSummary: summary,
    structured: buildPlanStructuredProposal({
      operation,
      entityType,
      entityId: hasNumericEntityId ? numericEntityId : undefined,
      summary,
      previewSubtitle: String(preview?.subtitle || "").trim() || undefined,
      rootLabel: previewRootLabel || undefined,
      rootType: previewRootType || undefined,
      rootId:
        Number.isFinite(previewRootId) && previewRootId > 0
          ? previewRootId
          : hasNumericEntityId
          ? numericEntityId
          : undefined,
      reversible:
        previewReversibility === "not_reversible"
          ? false
          : previewReversibility === "reversible"
          ? true
          : operation !== "delete",
      ...(previewLinking ? { linking: previewLinking } : {}),
      primaryChanges: primaryChanges.map((row) => ({
        field: row.field,
        from: row.from,
        to: row.to,
      })),
      cascadeSummary: incomingCascadeSummary,
      warnings: mergedWarnings,
      decisions: previewDecisions,
    }),
    confirmation: {
      extraRiskAck: operation === "delete",
      ...(mergedWarnings.length > 0 ? { warnings: mergedWarnings, impactSummary: mergedWarnings } : {}),
      preview: {
        version: "v1",
        scope: isWorkflowPreview ? "workflow" : "single_entity",
        root: {
          type: previewRootType || entityType || undefined,
          id:
            Number.isFinite(previewRootId) && previewRootId > 0
              ? previewRootId
              : hasNumericEntityId
              ? numericEntityId
              : null,
          label: previewRootLabel || undefined,
          operation: String(previewRoot?.operation || operation || "update"),
        },
        ...(primaryChanges.length > 0 ? { primaryChanges } : {}),
        ...(incomingCascadeSummary.length > 0 ? { cascadeSummary: incomingCascadeSummary } : {}),
        ...(mergedWarnings.length > 0 ? { effects: mergedWarnings } : {}),
        ...(previewLinking ? { linking: previewLinking } : {}),
        reversibility:
          previewReversibility ||
          (operation === "delete" ? "not_reversible" : "reversible"),
      },
    },
    ...(entityType && hasNumericEntityId
      ? { affectedEntities: [{ type: entityType, id: numericEntityId }] }
      : {}),
  };
  if (previewDecisions.length > 0) {
    proposal.confirmation = {
      ...proposal.confirmation,
      impactSummary: [...(proposal.confirmation?.impactSummary || []), ...previewDecisions],
    };
  }

  return {
    type: "proposal",
    proposals: [proposal],
    sessionId,
  };
}

function mapSuggestionActionType(
  actionType: SuggestionArtifactEventData["actionType"],
): AssistSuggestionsOutput["suggestions"][number]["actionType"] {
  if (actionType === "create") return "CREATE_ENTITY";
  if (actionType === "draft") return "GENERATE_DOCUMENT";
  if (actionType === "delete") return "DELETE_ENTITY";
  return "ENRICH_FIELD";
}

function toSuggestionText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toSuggestionInlineValue(value: unknown): string {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? `"${normalized}"` : "updated value";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (value === null) return "null";
  if (Array.isArray(value)) return "updated list";
  if (value && typeof value === "object") return "updated value";
  return "updated value";
}

function buildSuggestionEntityReference(
  entityType: string | null | undefined,
  entityId: number | string | null | undefined,
): string {
  const type = toSuggestionText(entityType) || "record";
  if (typeof entityId === "number" && Number.isFinite(entityId)) {
    return `${type} ${entityId}`;
  }
  const idText = toSuggestionText(entityId);
  if (idText) {
    return `${type} "${idText}"`;
  }
  return type;
}

function buildExecuteSuggestionChangeHint(prefill: Record<string, unknown> | null): string {
  const changes = toRecord(prefill?.changes);
  if (changes) {
    const firstKey = Object.keys(changes)[0];
    if (firstKey) {
      const row = toRecord(changes[firstKey]);
      if (row && "to" in row) {
        return ` set ${firstKey} to ${toSuggestionInlineValue(row.to)}.`;
      }
      return ` update ${firstKey}.`;
    }
  }
  const payload = toRecord(prefill?.payload);
  if (payload) {
    const firstKey = Object.keys(payload)[0];
    if (firstKey) {
      return ` with ${firstKey} ${toSuggestionInlineValue(payload[firstKey])}.`;
    }
  }
  return ".";
}

function buildSuggestionFollowUpPrompt(
  artifact: SuggestionArtifactEventData,
  draftType: string | null,
): string {
  const prefill = toRecord(artifact?.prefillData);
  if (artifact.domain === "draft") {
    const normalizedDraftType = String(
      draftType || artifact.targetType || "document",
    ).replace(/_/g, " ");
    const tone = toSuggestionText(prefill?.tone);
    const language = toSuggestionText(prefill?.language);
    const purpose = toSuggestionText(prefill?.purpose);
    const entityRef = buildSuggestionEntityReference(
      artifact.linkedEntityType || null,
      artifact.linkedEntityId ?? null,
    );
    const descriptor = [tone, language].filter(Boolean).join(" ");
    const descriptorPrefix = descriptor ? `${descriptor} ` : "";
    const purposeSuffix = purpose ? ` Purpose: ${purpose}.` : "";
    return `Create a ${descriptorPrefix}${normalizedDraftType} draft for ${entityRef}.${purposeSuffix}`;
  }

  const operation =
    toSuggestionText(prefill?.operation)?.toLowerCase() ||
    (artifact.actionType === "create" || artifact.actionType === "delete"
      ? artifact.actionType
      : "update");
  const entityType =
    toSuggestionText(prefill?.entityType) ||
    toSuggestionText(artifact.targetType) ||
    toSuggestionText(artifact.linkedEntityType) ||
    "record";
  const entityId =
    (typeof prefill?.entityId === "number" || typeof prefill?.entityId === "string"
      ? (prefill.entityId as number | string)
      : null) ??
    artifact.linkedEntityId ??
    null;
  const entityRef = buildSuggestionEntityReference(entityType, entityId);

  if (operation === "create") {
    return `Create ${entityRef}${buildExecuteSuggestionChangeHint(prefill)}`
      .replace(/\s+\./g, ".");
  }
  if (operation === "delete") {
    return `Delete ${entityRef}.`;
  }
  return `Update ${entityRef}${buildExecuteSuggestionChangeHint(prefill)}`
    .replace(/\s+\./g, ".");
}

function mapSuggestionArtifactToAssistSuggestions(
  artifact: SuggestionArtifactEventData,
): AssistSuggestionsOutput {
  const prefill = toRecord(artifact?.prefillData);
  const firstPrefillKey = prefill ? Object.keys(prefill)[0] : undefined;
  const draftType =
    typeof prefill?.draftType === "string"
      ? prefill.draftType
      : typeof prefill?.documentType === "string"
      ? prefill.documentType
      : null;

  return {
    type: "assist_suggestions",
    generatedAt: new Date().toISOString(),
    suggestions: [
      {
        actionType: mapSuggestionActionType(artifact.actionType),
        targetEntityType: String(artifact?.targetType || "").trim() || null,
        sourceEntityType:
          String(artifact?.linkedEntityType || artifact?.targetType || "assistant")
            .trim()
            .toLowerCase(),
        sourceEntityId: artifact?.linkedEntityId ?? null,
        label: String(artifact?.title || "").trim() || "Suggested action",
        reason: String(artifact?.reason || "").trim() || "Suggested based on current context.",
        field: artifact?.actionType === "update" ? firstPrefillKey || null : null,
        documentType: artifact?.actionType === "draft" ? draftType : null,
        domain: artifact.domain,
        trigger: artifact.trigger,
        prefillData: prefill || undefined,
        followUpPrompt: buildSuggestionFollowUpPrompt(artifact, draftType),
        relevanceScore: 0.75,
        finalScore: 0.75,
      } satisfies AssistSuggestionItem,
    ],
  };
}

function inferSuggestionArtifactFromConfirmationText(
  content: string,
): SuggestionArtifactEventData | null {
  const normalized = String(content || "").trim();
  if (!normalized) return null;
  const lower = normalized.toLowerCase();

  if (
    lower === "i can help you create this draft. continue?" ||
    lower === "je peux vous aider à créer ce brouillon. voulez-vous continuer ?" ||
    lower === "يمكنني مساعدتك في إنشاء هذه المسودة. هل تريد المتابعة؟"
  ) {
    return {
      version: "v1",
      domain: "draft",
      trigger: "implicit_intent",
      actionType: "draft",
      targetType: "document",
      title: "Suggested Draft Next Step",
      reason: "Inferred suggestion fallback from confirmation text.",
      prefillData: { draftType: "document" },
    };
  }

  if (
    lower === "i can prepare a targeted plan for this update. continue?" ||
    lower === "je peux préparer un plan de mise à jour ciblé. voulez-vous continuer ?" ||
    lower === "يمكنني إعداد خطة تحديث مناسبة. هل تريد المتابعة؟"
  ) {
    return {
      version: "v1",
      domain: "execute",
      trigger: "implicit_intent",
      actionType: "update",
      targetType: "record",
      title: "Suggested Plan Next Step",
      reason: "Inferred suggestion fallback from confirmation text.",
      prefillData: { operation: "update", entityType: "record", payload: {} },
    };
  }

  return null;
}

function toSafeExecutionErrorMessage(raw: string): string {
  const message = String(raw || "").trim();
  if (!message) return "I could not apply that change. Please review and try again.";
  const lower = message.toLowerCase();
  if (
    lower.includes("constraint failed") ||
    lower.includes("sqlite") ||
    lower.includes("sql") ||
    lower.includes("not null") ||
    lower.includes("foreign key") ||
    lower.includes("unique")
  ) {
    return "I could not apply that change because one or more values are not valid.";
  }
  if (message.length > 220) {
    return "I could not apply that change. Please review and try again.";
  }
  return message;
}

function mapPlanExecutedArtifactToExecutionResult(
  artifact: PlanExecutedEventData,
): ExecutionResult {
  const executedAt = new Date().toISOString();
  if (artifact?.ok !== true) {
    const details = toRecord(artifact?.errorDetails);
    const hint = String(details?.hint || "").trim();
    const baseMessage = String(artifact?.errorMessage || "").trim();
    const message =
      baseMessage ||
      hint ||
      "Could not apply that change.";
    return {
      type: "execution_result",
      proposalId: String(artifact?.pendingActionId || ""),
      status: "failed",
      error: {
        code: String(artifact?.errorCode || "PLAN_EXECUTION_FAILED"),
        message,
        safeMessage: toSafeExecutionErrorMessage(message),
        requiresReproposal: false,
        ...(details ? { details } : {}),
      },
      audit: {
        executedAt,
      },
    };
  }

  const result = toRecord(artifact?.result) || {};
  const operation = String(result.operation || "update").trim().toLowerCase();
  const actionType =
    operation === "create"
      ? "CREATE_ENTITY"
      : operation === "delete"
      ? "DELETE_ENTITY"
      : "UPDATE_ENTITY";
  const executedActions =
    Object.keys(result).length > 0
      ? [
          {
            actionType,
            result,
            executedAt,
          },
        ]
      : undefined;

  return {
    type: "execution_result",
    proposalId: String(artifact?.pendingActionId || ""),
    status: "success",
    ...(executedActions ? { executedActions } : {}),
    audit: {
      executedAt,
    },
  };
}

function mapPlanExecutedArtifactToUiState(artifact: PlanExecutedEventData): ProposalUiState {
  const executionResult = mapPlanExecutedArtifactToExecutionResult(artifact);
  if (executionResult.status === "success") {
    return {
      status: "confirmed",
      executionResult,
    };
  }
  return {
    status: "failed",
    error:
      executionResult.error?.safeMessage ||
      executionResult.error?.message ||
      "Could not apply that change.",
    executionResult,
  };
}

function applyProposalUiStateUpdate(
  messages: AgentMessage[],
  proposalId: string,
  uiState: ProposalUiState,
  decorateAgentMessage: (message: AgentMessage) => AgentMessage,
): { nextMessages: AgentMessage[]; changed: boolean } {
  let changed = false;
  const nextMessages = messages.map((message) => {
    if (message?.data?.type !== "proposal" || !message.data.proposal) {
      return message;
    }
    const proposals = Array.isArray(message.data.proposal.proposals)
      ? message.data.proposal.proposals
      : [];
    let proposalChanged = false;
    const nextProposals = proposals.map((proposal) => {
      if (String(proposal?.proposalId || "") !== proposalId) {
        return proposal;
      }
      proposalChanged = true;
      return {
        ...proposal,
        uiState,
      };
    });
    if (!proposalChanged) {
      return message;
    }
    changed = true;
    return decorateAgentMessage({
      ...message,
      data: {
        ...message.data,
        proposal: {
          ...message.data.proposal,
          proposals: nextProposals,
        },
      },
    });
  });
  return { nextMessages, changed };
}

export function useAgentState() {
  const { t } = useTranslation("common");
  const {
    activeSessionId,
    activeSession,
    updateSessionMessages,
    updateSessionDraft,
    getRelativeTime,
    createSession,
  } = useAgentSessions();

  const [inputBySession, setInputBySession] = useState<Record<string, string>>(
    {}
  );
  const initialVisibility = useMemo(() => getInitialSidebarVisibility(), []);
  const [showHistorySidebar, setShowHistorySidebar] = useState(
    initialVisibility.showHistory
  );
  const [showContextSidebar, setShowContextSidebar] = useState(
    initialVisibility.showContext
  );
  const [isLoading, setIsLoading] = useState(streamRegistry.isStreaming);
  const [transientStatus, setTransientStatus] = useState<TransientStatus | null>(null);
  const [agentVersion, setAgentVersion] = useState<AgentVersion>("v1");
  const [contextScope, setContextScope] = useState<ContextScope>("GLOBAL");
  // CRITICAL: Load data access permissions from localStorage on init
  const [dataAccess, setDataAccess] = useState<DataAccessPermissions>(loadDataAccessFromStorage);
  const [modelPreference, setModelPreference] = useState<AgentModelPreference>(
    loadModelPreferenceFromStorage,
  );
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef<Record<string, number>>({});
  const streamAbortRef = useRef<AbortController | null>(null);
  const streamSessionRef = useRef<string | null>(null);
  const lastMessageContentRef = useRef<string>("");
  const isUserScrolledUpRef = useRef(false);
  const isSessionSwitchingRef = useRef(false);
  const isMountedRef = useRef(true);

  const pendingSessionKey = "__pending__";
  const inputKey = activeSessionId || pendingSessionKey;
  const input = inputBySession[inputKey] ?? activeSession?.draft ?? "";

  const setInput = useCallback(
    (value: string) => {
      setInputBySession((prev) => ({ ...prev, [inputKey]: value }));
    },
    [inputKey]
  );

  // Get messages from active session
  const conversation = useMemo(
    () => activeSession?.messages ?? [],
    [activeSession?.messages]
  );

  const activeTransientStatus = useMemo(() => {
    if (!transientStatus || transientStatus.sessionId !== activeSessionId) return null;
    const { sessionId, ...rest } = transientStatus;
    return rest;
  }, [transientStatus, activeSessionId]);

  const safeSetIsLoading = useCallback((value: boolean) => {
    if (isMountedRef.current) {
      setIsLoading(value);
    }
  }, []);

  const safeSetTransientStatus = useCallback((value: TransientStatus | null) => {
    if (isMountedRef.current) {
      setTransientStatus(value);
    }
  }, []);

  // Scroll to bottom utility
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = scrollContainerRef.current;
    if (container) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior,
        });
      });
    }
  }, []);

  // Track user scroll position — only RE-ENABLE auto-scroll when user reaches bottom
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (isUserScrolledUpRef.current && distanceFromBottom <= 50) {
      isUserScrolledUpRef.current = false;
    }
  }, []);

  // Detect intentional user scroll-up and cancel any ongoing smooth scroll
  const handleUserScrollUp = useCallback(() => {
    if (isUserScrolledUpRef.current) return;
    isUserScrolledUpRef.current = true;
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollTop });
    }
  }, []);

  // Sync with any in-flight stream and avoid aborting on unmount/navigation
  useEffect(() => {
    isMountedRef.current = true;

    const handleStreamUpdate = (state: { isStreaming: boolean; sessionId: string | null }) => {
      if (!isMountedRef.current) return;
      if (state.isStreaming && streamRegistry.abortController) {
        streamAbortRef.current = streamRegistry.abortController;
        streamSessionRef.current = state.sessionId;
        safeSetIsLoading(true);
      } else {
        streamAbortRef.current = null;
        streamSessionRef.current = null;
        safeSetIsLoading(false);
        safeSetTransientStatus(null);
      }
    };

    streamListeners.add(handleStreamUpdate);
    handleStreamUpdate({
      isStreaming: streamRegistry.isStreaming,
      sessionId: streamRegistry.sessionId,
    });

    return () => {
      isMountedRef.current = false;
      streamListeners.delete(handleStreamUpdate);
    };
  }, [safeSetIsLoading, safeSetTransientStatus]);

  // CRITICAL: Persist data access permissions to localStorage on change
  useEffect(() => {
    saveDataAccessToStorage(dataAccess);
  }, [dataAccess]);

  useEffect(() => {
    saveModelPreferenceToStorage(modelPreference);
  }, [modelPreference]);

  // Load model from AI provider config on mount
  useEffect(() => {
    let mounted = true;
    getAIProviderConfig()
      .then((config) => {
        if (!mounted) return;
        if (config.model) {
          setModelPreference(config.model);
        }
      })
      .catch(() => {
        // Ignore — fall back to localStorage value
      });
    return () => { mounted = false; };
  }, []);

  // Persist sidebar visibility
  useEffect(() => {
    try {
      localStorage.setItem(
        HISTORY_SIDEBAR_STORAGE_KEY,
        String(showHistorySidebar)
      );
      localStorage.setItem(
        CONTEXT_SIDEBAR_STORAGE_KEY,
        String(showContextSidebar)
      );
    } catch {
      // Ignore storage errors
    }
  }, [showHistorySidebar, showContextSidebar]);

  const registerStream = useCallback((sessionId: string, controller: AbortController) => {
    streamRegistry.abortController = controller;
    streamRegistry.sessionId = sessionId;
    streamRegistry.isStreaming = true;
    streamAbortRef.current = controller;
    streamSessionRef.current = sessionId;
    notifyStreamListeners();
  }, []);

  const clearStreamRegistry = useCallback(() => {
    streamRegistry.abortController = null;
    streamRegistry.sessionId = null;
    streamRegistry.isStreaming = false;
    streamAbortRef.current = null;
    streamSessionRef.current = null;
    notifyStreamListeners();
  }, []);

  // Cancel current stream (can be called from UI)
  const cancelStream = useCallback(() => {
    const controller = streamAbortRef.current || streamRegistry.abortController;
    if (controller) {
      controller.abort();
    }
    clearStreamRegistry();
    safeSetIsLoading(false);
    safeSetTransientStatus(null);
  }, [clearStreamRegistry, safeSetIsLoading, safeSetTransientStatus]);

  // Save scroll position before switching sessions
  const saveScrollPosition = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container && activeSessionId) {
      scrollPositions.current[activeSessionId] = container.scrollTop;
    }
  }, [activeSessionId]);

  // Attach scroll listener to track user scroll position
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) handleUserScrollUp();
    };
    const onTouchStart = () => handleUserScrollUp();

    container.addEventListener("scroll", handleScroll, { passive: true });
    container.addEventListener("wheel", onWheel, { passive: true });
    container.addEventListener("touchstart", onTouchStart, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("touchstart", onTouchStart);
    };
  }, [handleScroll, handleUserScrollUp]);

  // Always scroll to bottom instantly when switching sessions
  useEffect(() => {
    if (!activeSessionId) return;

    isSessionSwitchingRef.current = true;
    isUserScrolledUpRef.current = false;

    const container = scrollContainerRef.current;
    if (container) {
      // Disable scroll-smooth so the jump is truly instant
      container.style.scrollBehavior = "auto";
      container.scrollTop = container.scrollHeight;
    }

    // Re-check after messages render, then restore smooth scrolling
    const raf = requestAnimationFrame(() => {
      if (container) {
        container.scrollTop = container.scrollHeight;
        container.style.scrollBehavior = "";
      }
      isSessionSwitchingRef.current = false;
    });

    return () => {
      cancelAnimationFrame(raf);
      if (container) container.style.scrollBehavior = "";
      isSessionSwitchingRef.current = false;
    };
  }, [activeSessionId]);

  // Scroll to bottom when new messages are added (not during streaming or session switch)
  useEffect(() => {
    if (isSessionSwitchingRef.current) return;
    if (conversation.length > 0 && !isLoading) {
      if (!isUserScrolledUpRef.current) {
        scrollToBottom("smooth");
      }
    }
  }, [conversation.length, isLoading, scrollToBottom]);

  // Auto-scroll during streaming when content grows
  useEffect(() => {
    if (isSessionSwitchingRef.current) return;
    if (!isLoading || conversation.length === 0) {
      lastMessageContentRef.current = "";
      return;
    }

    const lastMessage = conversation[conversation.length - 1];
    const currentContent = lastMessage?.content || "";

    // Only scroll if content has changed and user hasn't scrolled up
    if (currentContent !== lastMessageContentRef.current && !isUserScrolledUpRef.current) {
      lastMessageContentRef.current = currentContent;
      scrollToBottom("smooth");
    }
  }, [conversation, isLoading, scrollToBottom]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeSessionId]);

  const buildFollowUpIntent = useCallback(
    (followUp: FollowUpSuggestion): FollowUpIntent => ({
      type: "FOLLOW_UP_INTENT",
      intent: followUp.intent,
      entityType: followUp.entityType,
      entityId: followUp.entityId,
      origin: followUp.origin || {
        entity: followUp.entityType.toUpperCase(),
        entityId: followUp.entityId,
      },
      scope: followUp.scope || {},
      filters: followUp.filters,

      // Context resolution fields (for RESOLVE_CONTEXT_AND_CONTINUE)
      originalIntent: followUp.originalIntent,
      originalDraftType: followUp.originalDraftType,
      originalMessage: followUp.originalMessage,
      pendingOperationId: followUp.pendingOperationId,
      resolutionInput: followUp.resolutionInput,
      resolvedEntity: followUp.resolvedEntity,
      selectionId: followUp.selectionId,
      selectionCategory: followUp.selectionCategory,
      resolution: followUp.resolution,
    }),
    []
  );

  const setSessionStatus = useCallback(
    (sessionId: string, status: Omit<TransientStatus, "sessionId">) => {
      if (!isMountedRef.current) return;
      setTransientStatus({ sessionId, ...status });
    },
    [],
  );

  const clearSessionStatus = useCallback((sessionId: string) => {
    if (!isMountedRef.current) return;
    setTransientStatus((prev) => {
      if (!prev) return prev;
      if (prev.sessionId !== sessionId) return prev;
      return null;
    });
  }, []);

  const withModelPreference = useCallback(
    (metadata?: AgentRequestMetadata): AgentRequestMetadata => ({
      ...(metadata || {}),
      modelPreference,
    }),
    [modelPreference],
  );

  const withRequestTrace = useCallback(
    (metadata: AgentRequestMetadata | undefined, requestSource: string): AgentRequestMetadata => ({
      ...(metadata || {}),
      requestSource,
      requestTriggerId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    }),
    [],
  );

  // Collapse sidebars when the viewport gets too small.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const historyQuery = window.matchMedia(`(min-width: ${HISTORY_SIDEBAR_BREAKPOINT}px)`);
    const contextQuery = window.matchMedia(`(min-width: ${CONTEXT_SIDEBAR_BREAKPOINT}px)`);

    const handleChange = () => {
      if (!historyQuery.matches) {
        setShowHistorySidebar(false);
      }
      if (!contextQuery.matches) {
        setShowContextSidebar(false);
      }
    };

    handleChange();
    if (historyQuery.addEventListener) {
      historyQuery.addEventListener("change", handleChange);
      contextQuery.addEventListener("change", handleChange);
    } else {
      historyQuery.addListener(handleChange);
      contextQuery.addListener(handleChange);
    }

    return () => {
      if (historyQuery.removeEventListener) {
        historyQuery.removeEventListener("change", handleChange);
        contextQuery.removeEventListener("change", handleChange);
      } else {
        historyQuery.removeListener(handleChange);
        contextQuery.removeListener(handleChange);
      }
    };
  }, []);

  // Save draft on input change (debounced)
  useEffect(() => {
    if (!activeSessionId) return;
    const timeout = setTimeout(() => {
      updateSessionDraft(activeSessionId, input);
    }, 300);
    return () => clearTimeout(timeout);
  }, [input, activeSessionId, updateSessionDraft]);

  const handleSubmit = useCallback((e: React.SyntheticEvent, attachments?: AttachedFile[], metadata?: AgentRequestMetadata) => {
    e.preventDefault();
    const trimmed = input.trim();
    // Allow send if there's text OR attachments
    if ((!trimmed && (!attachments || attachments.length === 0)) || isLoading || streamRegistry.isStreaming) return;

    // Use existing session if we have an activeSessionId, otherwise create new
    let sessionId = activeSessionId;
    let currentMessages = conversation;
    if (!activeSessionId || !activeSession) {
      const newSession = createSession();
      sessionId = newSession.id;
      currentMessages = [];
    }

    // Build attachment metadata for visual rendering in chat
    const messageAttachments = attachments && attachments.length > 0
      ? attachments.map(a => ({ id: a.id, name: a.name, type: a.type, size: a.size, preview: a.preview }))
      : undefined;

    const userMessage: AgentMessage = {
      id: createMessageId("u"),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
      attachments: messageAttachments,
    };

    // ========== STAGE 1: IMMEDIATE ACKNOWLEDGEMENT (EPHEMERAL) ==========
    // Show ACK status instantly, but do not persist it in the conversation.
    const agentMessageId = createMessageId("a");
    const intentMessageId = agentMessageId;
    // Capture current messages for updates
    const baseMessages = [...currentMessages, userMessage];
    let workingMessages = [...baseMessages];
    updateSessionMessages(sessionId, workingMessages);
    setInput("");
    updateSessionDraft(sessionId, "");
    safeSetIsLoading(true);

    // ========== ATTACHMENT UPLOAD + STREAM ORCHESTRATION ==========
    // Upload attachments (if any), then start the agent stream.
    // Document IDs are passed to the stream so the backend can load their text.
    let pendingDocumentIds: number[] = [];

    const launchStream = async () => {
      if (attachments && attachments.length > 0) {
        setSessionStatus(sessionId, { action: "Uploading documents…", phase: "uploading" });
        try {
          const uploadedDocs = await uploadAttachments(
            sessionId,
            attachments.map(a => ({
              type: a.type,
              file: a.file,
              documentId: a.documentId,
              name: a.name,
            })),
            userMessage.id,
          );
          pendingDocumentIds = uploadedDocs.map(d => d.document_id);
        } catch (err) {
          console.error('[Agent] Attachment upload failed:', err);
          // Continue without documents — agent will handle gracefully
        }
      }
      setSessionStatus(sessionId, { action: "Analyzing your request…", phase: "init" });
      beginStreaming();
    };

    // Define beginStreaming below (uses pendingDocumentIds from closure)
    const beginStreaming = () => {

    // Reset user scroll tracking and scroll to bottom immediately when sending a message
    isUserScrolledUpRef.current = false;
    // Use a small delay to ensure DOM has updated with new messages
    setTimeout(() => scrollToBottom("smooth"), 50);

    // Track which session this stream belongs to
    streamSessionRef.current = sessionId;

    // Accumulated content for streaming
    let streamedContent = "";
    let intent = "GENERAL_CHAT";
    let agentData: AgentMessageData | undefined;
    let deferredFollowUps: FollowUpSuggestion[] | null = null;
    let commentary: CommentaryOutput | undefined;
    let hasAgentMessage = false;
    let hasIntentMessage = false;
    let chatbotTurnState: AgentMessage["chatbotTurn"] | undefined;
    // Track streaming intent framing content
    let streamedIntentContent = "";
    // Track streaming commentary content
    let streamedCommentaryContent = "";

    const decorateAgentMessage = (message: AgentMessage) =>
      attachChatbotTurn(message, chatbotTurnState);

    const appendMessage = (message: AgentMessage) => {
      const nextMessage = decorateAgentMessage(message);
      const idx = workingMessages.findIndex((m) => m.id === message.id);
      if (idx !== -1) {
        workingMessages = workingMessages.map((m) =>
          m.id === message.id ? nextMessage : m
        );
      } else {
        workingMessages = [...workingMessages, nextMessage];
      }
      updateSessionMessages(sessionId, workingMessages);
    };

    const updateMessage = (message: AgentMessage) => {
      const nextMessage = decorateAgentMessage(message);
      const previous = workingMessages.find((msg) => msg.id === message.id);
      const mergedMessage =
        previous && !nextMessage.proactiveSuggestions && previous.proactiveSuggestions
          ? { ...nextMessage, proactiveSuggestions: previous.proactiveSuggestions }
          : nextMessage;
      workingMessages = workingMessages.map((msg) =>
        msg.id === message.id ? mergedMessage : msg
      );
      updateSessionMessages(sessionId, workingMessages);
    };

    const upsertIntentMessage = (
      content: string,
      intentOverride?: string,
      structured?: import("../../services/api/agent").IntentFramingOutput
    ) => {
      const trimmedContent = content.trim();
      if (!trimmedContent) return;
      const intentMessage: AgentMessage = {
        id: intentMessageId,
        role: "agent",
        content: trimmedContent,
        timestamp: new Date(),
        stage: "intent",
        intent: intentOverride || intent,
        messageType: "AGENT_INTENT_MESSAGE",
        intentFraming: structured,
      };
      const exists = workingMessages.some((msg) => msg.id === intentMessageId);
      if (exists) {
        updateMessage(intentMessage);
      } else {
        appendMessage(intentMessage);
      }
      hasIntentMessage = true;
    };

    const applyProposalUiState = (proposalId: string, uiState: ProposalUiState) => {
      if (!proposalId) return;
      const { nextMessages, changed } = applyProposalUiStateUpdate(
        workingMessages,
        proposalId,
        uiState,
        decorateAgentMessage,
      );
      if (!changed) return;
      workingMessages = nextMessages;
      updateSessionMessages(sessionId, workingMessages);
      if (agentData?.type === "proposal" && agentData.proposal) {
        agentData = {
          ...agentData,
          proposal: {
            ...agentData.proposal,
            proposals: (agentData.proposal.proposals || []).map((proposal) =>
              proposal.proposalId === proposalId ? { ...proposal, uiState } : proposal,
            ),
          },
        } as AgentMessageData;
      }
    };

    // Start streaming
      const abortController = streamAgentMessage(
        trimmed,
        {
          contextScope,
          agentVersion,
          dataAccess,
          metadata: withModelPreference(withRequestTrace(metadata, "handle_submit")),
          sessionId,
          documentIds: pendingDocumentIds,
        },
        {
        onStart: (data) => {
          intent = data.intent;
          if (streamSessionRef.current !== sessionId) return;
        },
        onIntentFraming: (data) => {
          if (streamSessionRef.current !== sessionId) return;
          if (data.visibility === "metadata") return;
          if (!data.message || data.message.trim().length === 0) return;
          // Complete intent framing message - use this as final
          streamedIntentContent = data.message;
          upsertIntentMessage(data.message, undefined, data.structured);
        },
        onIntentFramingChunk: (chunk) => {
          // Streaming intent framing - accumulate and update in real-time
          if (streamSessionRef.current !== sessionId) return;
          streamedIntentContent += chunk;
          upsertIntentMessage(streamedIntentContent);
        },
        onStatus: (data: StatusEventData) => {
          // ========== STAGE 2: STATUS UPDATES ==========
          // Update status action text as processing progresses
          if (streamSessionRef.current !== sessionId) return;
          setSessionStatus(sessionId, { action: data.action, phase: data.phase });
        },
        onChatMutationLifecycle: (action: ChatMutationLifecycleEvent) => {
          if (streamSessionRef.current !== sessionId) return;
          chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
            type: "mutation_execution",
            action,
          });
          if (hasAgentMessage) {
            const existing = workingMessages.find((msg) => msg.id === agentMessageId);
            if (existing) updateMessage(existing);
          } else {
            appendMessage({
              id: agentMessageId,
              role: "agent",
              content: "",
              timestamp: new Date(),
              status: "sending",
              stage: "artifact",
              intent,
              data: agentData,
            });
            hasAgentMessage = true;
          }
          clearSessionStatus(sessionId);
        },
        onMutationEvent: (event) => {
          emitEntityMutationFromBackendEvent(event);
        },
        onChunk: (content) => {
          // Ignore if session changed
          if (streamSessionRef.current !== sessionId) return;

          streamedContent += content;
          const updatedMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            stage: agentData ? "artifact" : "commentary",
            intent,
            data: agentData,
          };
          if (hasAgentMessage) {
            updateMessage(updatedMessage);
          } else {
            appendMessage(updatedMessage);
            hasAgentMessage = true;
          }
          clearSessionStatus(sessionId);
        },
        onDraftArtifact: (artifact) => {
          if (streamSessionRef.current !== sessionId) return;
          const draftV2 = {
            ...artifact,
            type: "draft_v2",
          } as import("../../services/api/agent").DraftArtifactData;
          agentData = { type: "draft_v2", draftV2 } as AgentMessageData;
          console.info("[AGENT_ARTIFACT_TRACE_STATE_ON_ARTIFACT]", {
            sessionId,
            agentMessageId,
            dataType: agentData?.type,
            hasDraftV2Field: Boolean((agentData as AgentMessageData | undefined)?.draftV2),
            artifactTitle: artifact?.title,
            artifactVersion: artifact?.version,
          });
          streamedContent = "";
          const updatedMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: "",
            timestamp: new Date(),
            status: "sending",
            stage: "artifact",
            intent,
            data: agentData,
            chatbotTurn: chatbotTurnState,
          };
          if (hasAgentMessage) {
            updateMessage(updatedMessage);
          } else {
            appendMessage(updatedMessage);
            hasAgentMessage = true;
          }
        },
        onPlanArtifact: (artifact) => {
          if (streamSessionRef.current !== sessionId) return;
          const proposal = mapPlanArtifactToProposalOutput(artifact, sessionId);
          agentData = { type: "proposal", proposal };
          streamedContent = "";
          const updatedMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: "",
            timestamp: new Date(),
            status: "sending",
            stage: "artifact",
            intent,
            data: agentData,
            chatbotTurn: chatbotTurnState,
          };
          if (hasAgentMessage) {
            updateMessage(updatedMessage);
          } else {
            appendMessage(updatedMessage);
            hasAgentMessage = true;
          }
          clearSessionStatus(sessionId);
        },
        onPlanExecuted: (artifact) => {
          if (streamSessionRef.current !== sessionId) return;
          applyProposalUiState(
            String(artifact?.pendingActionId || ""),
            mapPlanExecutedArtifactToUiState(artifact),
          );
          setSessionStatus(sessionId, {
            action: artifact.ok ? "Planned action executed." : "Planned action failed.",
            phase: "plan_executed",
          });
        },
        onPlanRejected: (artifact) => {
          if (streamSessionRef.current !== sessionId) return;
          applyProposalUiState(String(artifact?.pendingActionId || ""), { status: "cancelled" });
          setSessionStatus(sessionId, {
            action: "Planned action cancelled.",
            phase: "plan_rejected",
          });
        },
        onSuggestionArtifact: (artifact) => {
          if (streamSessionRef.current !== sessionId) return;
          console.info("[AGENT_SUGGESTION_EVENT_RECEIVED]", {
            sessionId,
            agentMessageId,
            domain: artifact?.domain,
            actionType: artifact?.actionType,
            targetType: artifact?.targetType,
          });
          const suggestions = mapSuggestionArtifactToAssistSuggestions(artifact);
          if (hasAgentMessage) {
            const existing = workingMessages.find((msg) => msg.id === agentMessageId);
            if (existing) {
              updateMessage({
                ...existing,
                proactiveSuggestions: suggestions,
              });
            } else {
              appendMessage({
                id: agentMessageId,
                role: "agent",
                content: streamedContent,
                timestamp: new Date(),
                status: "sending",
                stage: agentData ? "artifact" : "commentary",
                intent,
                data: agentData,
                proactiveSuggestions: suggestions,
              });
            }
            clearSessionStatus(sessionId);
            return;
          }
          agentData = {
            type: "assist_suggestions",
            assistSuggestions: suggestions,
          };
          streamedContent = "";
          appendMessage({
            id: agentMessageId,
            role: "agent",
            content: "",
            timestamp: new Date(),
            status: "sending",
            stage: "artifact",
            intent,
            data: agentData,
          });
          hasAgentMessage = true;
          clearSessionStatus(sessionId);
        },
        onResult: (data) => {
          // ========== STAGE 3: ARTIFACT ==========
          // Non-streaming structured result (for non-chat intents)
          if (streamSessionRef.current !== sessionId) return;
          emitEntityMutationFromAgentOutcome((data as { mutationOutcome?: unknown })?.mutationOutcome);

          const output = data.output;
          intent = data.intent;
          const mutationResolution = resolveChatbotMutationStateFromAssistantResult({
            mutationOutcome: (data as { mutationOutcome?: { status?: string | null } | null })
              ?.mutationOutcome,
            outputType: output?.type,
          });
          if (mutationResolution) {
            chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
              type: "mutation_resolved",
              state: mutationResolution,
            });
          }

          // TURN COMPLETION INVARIANT: Handle chat outputs defensively
          // The backend should send chat via chunks, but if it arrives as result, handle it
          if (output.type === "chat") {
            const chatMessage = (output as import("../../services/api/agent").ChatOutput).message || "";
            if (agentData) {
              // Preserve already-emitted artifact payloads (for example draft_v2).
              // The chat text is treated as commentary instead of replacing the artifact view.
              if (chatMessage.trim().length > 0 && !commentary) {
                commentary = {
                  message: chatMessage,
                  source: "llm",
                  signals: [],
                };
              }
              streamedContent = "";
            } else {
              streamedContent = chatMessage;
            }
          } else if (output.type === "explanation") {
            const explanation = output as ExplanationOutput;
            if (Array.isArray(explanation.followUps) && explanation.followUps.length > 0) {
              deferredFollowUps = explanation.followUps;
              agentData = {
                type: "explanation",
                explanation: { ...explanation, followUps: [] },
              };
            } else {
              agentData = { type: "explanation", explanation };
            }
            streamedContent = "";
          } else if (output.type === "clarification") {
            agentData = { type: "clarification", clarification: output };
            streamedContent = "";
          } else if (output.type === "operational_risk_analysis") {
            agentData = { type: "risks", risks: output };
            streamedContent = "";
          } else if (["INVITATION", "CLIENT_EMAIL", "HEARING_SUMMARY", "INTERNAL_NOTE"].includes(output.type)) {
            agentData = { type: "draft", draft: output as import("../../services/api/agent").DraftOutput };
            streamedContent = "";
          } else if (output.type === "collection") {
            agentData = { type: "collection", collection: output as CollectionOutput };
            streamedContent = "";
          } else if (output.type === "context_suggestion") {
            agentData = { type: "context_suggestion", contextSuggestion: output as import("../../services/api/agent").ContextSuggestionOutput };
            streamedContent = "";
          } else if (output.type === "proposal") {
            agentData = { type: "proposal", proposal: output };
            streamedContent = "";
          } else if (output.type === "entity_creation_form") {
            agentData = {
              type: "entity_creation_form",
              entityCreationForm: output as import("../../services/api/agent").EntityCreationFormOutput,
            };
            streamedContent = "";
          } else if (output.type === "document_draft") {
            const proposalArtifact =
              (data as { mutationOutcome?: { proposalArtifact?: unknown } | null })?.mutationOutcome
                ?.proposalArtifact;
            agentData = {
              type: "document_draft",
              documentDraft: output as import("../../services/api/agent").DocumentDraftOutput,
              proposal:
                proposalArtifact && typeof proposalArtifact === "object" && (proposalArtifact as { type?: unknown }).type === "proposal"
                  ? (proposalArtifact as import("../../services/api/agent").ProposalOutput)
                  : undefined,
            };
            streamedContent = "";
          } else if (output.type === "document_generation_preview") {
            agentData = {
              type: "document_generation_preview",
              documentGenerationPreview: output,
            };
            streamedContent = "";
          } else if (output.type === "document_generation_missing_fields") {
            agentData = {
              type: "document_generation_missing_fields",
              documentGenerationMissingFields: output,
            };
            streamedContent = "";
          } else if (output.type === "web_search_results") {
            agentData = {
              type: output.type,
              webSearchResults: output as WebSearchResultsOutput,
            };
            const preservedChatSummary = String(streamedContent || "").trim();
            if (preservedChatSummary.length > 0 && !commentary) {
              commentary = {
                message: preservedChatSummary,
                source: "llm",
                signals: [],
              };
            }
            streamedContent = "";
          } else if (output.type === "chat_context_summary") {
            agentData = {
              type: "chat_context_summary",
              chatContextSummary: output as import("../../services/api/agent").ChatContextSummaryOutput,
            };
          } else if (output.type === "recovery") {
            agentData = {
              type: "recovery",
              recovery: output,
            };
            streamedContent = "";
          } else if (output.type === "assist_suggestions") {
            if (hasAgentMessage) {
              const _existing = workingMessages.find((m) => m.id === agentMessageId);
              if (_existing) updateMessage({ ..._existing, proactiveSuggestions: output as import("../../services/api/agent").AssistSuggestionsOutput });
              clearSessionStatus(sessionId);
              return;
            }
            agentData = {
              type: "assist_suggestions",
              assistSuggestions: output as import("../../services/api/agent").AssistSuggestionsOutput,
            };
            streamedContent = "";
          } else if (output.type === "action_plan") {
            agentData = { type: "actions", actionProposals: output.actions };
            streamedContent = "";
          }

          const resultMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            stage: "artifact",
            intent,
            data: agentData,
          };
          if (hasAgentMessage) {
            updateMessage(resultMessage);
          } else {
            appendMessage(resultMessage);
            hasAgentMessage = true;
          }
          clearSessionStatus(sessionId);
        },
        onCommentary: (data) => {
          // ========== STAGE 4: COMMENTARY ==========
          // Receive complete conversational commentary about the artifact
          if (streamSessionRef.current !== sessionId) return;
          if (data.visibility === "metadata") return;
          const mergedMessage = mergeUniqueCommentaryLines(
            String(commentary?.message || ""),
            String(data?.message || ""),
          );
          commentary = {
            ...(commentary || {}),
            ...(data || {}),
            message: mergedMessage,
          };
          // Reset streaming content since we have complete commentary
          streamedCommentaryContent = mergedMessage;

          // Update message with commentary (artifact already rendered)
          const messageWithCommentary: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            stage: "artifact", // Keep as artifact, commentary is additional
            intent,
            data: agentData,
            commentary,
          };
          if (hasAgentMessage) {
            updateMessage(messageWithCommentary);
          } else {
            appendMessage(messageWithCommentary);
            hasAgentMessage = true;
          }
        },
        onCommentaryChunk: (chunk) => {
          // Streaming commentary - accumulate and update in real-time
          if (streamSessionRef.current !== sessionId) return;
          streamedCommentaryContent += chunk;

          // Create temporary commentary object for display
          const streamingCommentary: CommentaryOutput = {
            message: streamedCommentaryContent,
            source: "llm",
            signals: [],
          };

          // Update message with streaming commentary
          const messageWithStreamingCommentary: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            stage: "artifact",
            intent,
            data: agentData,
            commentary: streamingCommentary,
          };
          if (hasAgentMessage) {
            updateMessage(messageWithStreamingCommentary);
          } else {
            appendMessage(messageWithStreamingCommentary);
            hasAgentMessage = true;
          }
        },
        onDone: (data) => {
          if (streamSessionRef.current !== sessionId) return;
          emitEntityMutationFromAgentOutcome((data as { mutationOutcome?: unknown })?.mutationOutcome);
          const mutationResolution = resolveChatbotMutationStateFromDone({
            mutationOutcome: (data as { mutationOutcome?: { status?: string | null } | null })
              ?.mutationOutcome,
            hasPendingMutation: chatbotTurnState?.mutation?.state === "pending",
          });
          if (mutationResolution) {
            chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
              type: "mutation_resolved",
              state: mutationResolution,
            });
          }

          if (deferredFollowUps && agentData?.type === "explanation" && agentData.explanation) {
            agentData = {
              ...agentData,
              explanation: { ...agentData.explanation, followUps: deferredFollowUps },
            };
          }

          let proactiveSuggestions: AssistSuggestionsOutput | undefined;
          const existingMessage = workingMessages.find((msg) => msg.id === agentMessageId);
          const hasExistingSuggestions = Boolean(
            existingMessage?.proactiveSuggestions?.suggestions?.length,
          );
          if (!hasExistingSuggestions) {
            const inferredArtifact = inferSuggestionArtifactFromConfirmationText(streamedContent);
            if (inferredArtifact) {
              proactiveSuggestions = mapSuggestionArtifactToAssistSuggestions(inferredArtifact);
              if (agentData?.type !== "assist_suggestions") {
                agentData = {
                  type: "assist_suggestions",
                  assistSuggestions: proactiveSuggestions,
                };
              }
              console.info("[AGENT_SUGGESTION_FALLBACK_INFERRED]", {
                sessionId,
                agentMessageId,
                domain: inferredArtifact.domain,
                actionType: inferredArtifact.actionType,
              });
            }
          }

          const finalMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "success",
            stage: agentData ? "artifact" : "commentary",
            intent,
            data: agentData,
            proactiveSuggestions,
            commentary,
          };
          if (hasAgentMessage) {
            updateMessage(finalMessage);
          } else {
            appendMessage(finalMessage);
            hasAgentMessage = true;
          }
          safeSetIsLoading(false);
          clearStreamRegistry();
          clearSessionStatus(sessionId);
        },
        onError: (error) => {
          if (streamSessionRef.current !== sessionId) return;
          if (chatbotTurnState?.mutation?.state === "pending") {
            chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
              type: "mutation_resolved",
              state: "error",
            });
          }

          const errorMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: "",
            timestamp: new Date(),
            status: "success",
            stage: "artifact",
            data: {
              type: "recovery",
              recovery: {
                type: "recovery",
                message: "I could not complete that request.",
                whatHappened: String(error || "The request failed during processing."),
                canRetry: true,
                alternatives: [
                  { label: "Retry request", action: "retry", prompt: "Retry the same request" },
                ],
                suggestedPrompts: ["Retry the same request"],
                context: null,
                severity: "temporary",
              },
            },
          };
          if (hasAgentMessage) {
            updateMessage(errorMessage);
          } else {
            appendMessage(errorMessage);
            hasAgentMessage = true;
          }
          safeSetIsLoading(false);
          clearStreamRegistry();
          clearSessionStatus(sessionId);
        },
        onCancelled: () => {
          safeSetIsLoading(false);
          clearStreamRegistry();
          clearSessionStatus(sessionId);
        },
      }
      );

      registerStream(sessionId, abortController);
    }; // end beginStreaming

    // Launch the async upload + stream pipeline
    launchStream();
  }, [
    input,
    activeSessionId,
    activeSession,
    conversation,
    updateSessionMessages,
    updateSessionDraft,
    createSession,
    isLoading,
    contextScope,
    agentVersion,
    dataAccess,
    setInput,
    scrollToBottom,
    setSessionStatus,
    clearSessionStatus,
    safeSetIsLoading,
    withModelPreference,
    withRequestTrace,
    registerStream,
    clearStreamRegistry,
  ]);

  const startFollowUpIntent = useCallback((followUp: FollowUpSuggestion) => {
    if (!followUp || isLoading || streamRegistry.isStreaming) return;
    const followUpLabel = buildFollowUpLabel(followUp, t);

    // Use existing session if we have an activeSessionId, otherwise create new
    let sessionId = activeSessionId;
    let currentMessages = conversation;
    if (!activeSessionId || !activeSession) {
      const newSession = createSession();
      sessionId = newSession.id;
      currentMessages = [];
    }

    const userMessage: AgentMessage = {
      id: createMessageId("u"),
      role: "user",
      content: followUpLabel,
      timestamp: new Date(),
      followUpIntent: buildFollowUpIntent(followUp),
    };

    // ========== STAGE 1: IMMEDIATE ACKNOWLEDGEMENT (EPHEMERAL) ==========
    const agentMessageId = createMessageId("a");
    const intentMessageId = agentMessageId;
    const baseMessages = [...currentMessages, userMessage];
    let workingMessages = [...baseMessages];
    updateSessionMessages(sessionId, workingMessages);
    safeSetIsLoading(true);
    // Show immediate loading indicator while waiting for backend
    setSessionStatus(sessionId, { action: "Processing follow-up…", phase: "init" });

    const appendMessage = (message: AgentMessage) => {
      const nextMessage = decorateAgentMessage(message);
      const idx = workingMessages.findIndex((m) => m.id === message.id);
      if (idx !== -1) {
        workingMessages = workingMessages.map((m) =>
          m.id === message.id ? nextMessage : m
        );
      } else {
        workingMessages = [...workingMessages, nextMessage];
      }
      updateSessionMessages(sessionId, workingMessages);
    };

    const updateMessage = (message: AgentMessage) => {
      const nextMessage = decorateAgentMessage(message);
      const previous = workingMessages.find((msg) => msg.id === message.id);
      const mergedMessage =
        previous && !nextMessage.proactiveSuggestions && previous.proactiveSuggestions
          ? { ...nextMessage, proactiveSuggestions: previous.proactiveSuggestions }
          : nextMessage;
      workingMessages = workingMessages.map((msg) =>
        msg.id === message.id ? mergedMessage : msg
      );
      updateSessionMessages(sessionId, workingMessages);
    };

    // Reset user scroll tracking and scroll to bottom
    isUserScrolledUpRef.current = false;
    setTimeout(() => scrollToBottom("smooth"), 50);

    streamSessionRef.current = sessionId;

    let streamedContent = "";
    let intent = followUp.intent || "READ_DATA";
    let agentData: AgentMessageData | undefined;
    let deferredFollowUps: FollowUpSuggestion[] | null = null;
    let commentary: CommentaryOutput | undefined;
    let hasAgentMessage = false;
    let hasIntentMessage = false;
    let chatbotTurnState: AgentMessage["chatbotTurn"] | undefined;
    let streamedIntentContent = "";
    let streamedCommentaryContent = "";

    const decorateAgentMessage = (message: AgentMessage) =>
      attachChatbotTurn(message, chatbotTurnState);

    const upsertIntentMessage = (
      content: string,
      intentOverride?: string,
      structured?: import("../../services/api/agent").IntentFramingOutput
    ) => {
      const trimmedContent = content.trim();
      if (!trimmedContent) return;
      const intentMessage: AgentMessage = {
        id: intentMessageId,
        role: "agent",
        content: trimmedContent,
        timestamp: new Date(),
        stage: "intent",
        intent: intentOverride || intent,
        messageType: "AGENT_INTENT_MESSAGE",
        intentFraming: structured,
      };
      const exists = workingMessages.some((msg) => msg.id === intentMessageId);
      if (exists) {
        updateMessage(intentMessage);
      } else {
        appendMessage(intentMessage);
      }
      hasIntentMessage = true;
    };

    const applyProposalUiState = (proposalId: string, uiState: ProposalUiState) => {
      if (!proposalId) return;
      const { nextMessages, changed } = applyProposalUiStateUpdate(
        workingMessages,
        proposalId,
        uiState,
        decorateAgentMessage,
      );
      if (!changed) return;
      workingMessages = nextMessages;
      updateSessionMessages(sessionId, workingMessages);
      if (agentData?.type === "proposal" && agentData.proposal) {
        agentData = {
          ...agentData,
          proposal: {
            ...agentData.proposal,
            proposals: (agentData.proposal.proposals || []).map((proposal) =>
              proposal.proposalId === proposalId ? { ...proposal, uiState } : proposal,
            ),
          },
        } as AgentMessageData;
      }
    };

    const abortController = streamAgentMessage(
      followUpLabel,
      {
        contextScope,
        agentVersion,
        dataAccess,
        followUpIntent: userMessage.followUpIntent,
        metadata: withModelPreference(withRequestTrace(undefined, "follow_up_intent")),
        sessionId,
      },
        {
          onStart: (data) => {
            intent = data.intent;
            if (streamSessionRef.current !== sessionId) return;
          },
          onIntentFraming: (data) => {
            if (streamSessionRef.current !== sessionId) return;
            if (data.visibility === "metadata") return;
            if (!data.message || data.message.trim().length === 0) return;
            streamedIntentContent = data.message;
            upsertIntentMessage(data.message, undefined, data.structured);
          },
          onIntentFramingChunk: (chunk) => {
            if (streamSessionRef.current !== sessionId) return;
            streamedIntentContent += chunk;
            upsertIntentMessage(streamedIntentContent);
          },
        onStatus: (data: StatusEventData) => {
          // ========== STAGE 2: STATUS UPDATES ==========
          if (streamSessionRef.current !== sessionId) return;
          setSessionStatus(sessionId, { action: data.action, phase: data.phase });
        },
        onChatMutationLifecycle: (action: ChatMutationLifecycleEvent) => {
          if (streamSessionRef.current !== sessionId) return;
          chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
            type: "mutation_execution",
            action,
          });
          if (hasAgentMessage) {
            const existing = workingMessages.find((msg) => msg.id === agentMessageId);
            if (existing) updateMessage(existing);
          } else {
            appendMessage({
              id: agentMessageId,
              role: "agent",
              content: "",
              timestamp: new Date(),
              status: "sending",
              stage: "artifact",
              intent,
              data: agentData,
            });
            hasAgentMessage = true;
          }
          clearSessionStatus(sessionId);
        },
        onMutationEvent: (event) => {
          emitEntityMutationFromBackendEvent(event);
        },
        onChunk: (content) => {
          if (streamSessionRef.current !== sessionId) return;

          streamedContent += content;
          const updatedMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            stage: agentData ? "artifact" : "commentary",
            intent,
            data: agentData,
          };
          if (hasAgentMessage) {
            updateMessage(updatedMessage);
          } else {
            appendMessage(updatedMessage);
            hasAgentMessage = true;
          }
          clearSessionStatus(sessionId);
        },
        onDraftArtifact: (artifact) => {
          if (streamSessionRef.current !== sessionId) return;
          const draftV2 = {
            ...artifact,
            type: "draft_v2",
          } as import("../../services/api/agent").DraftArtifactData;
          agentData = { type: "draft_v2", draftV2 } as AgentMessageData;
          console.info("[AGENT_ARTIFACT_TRACE_STATE_ON_ARTIFACT]", {
            sessionId,
            agentMessageId,
            dataType: agentData?.type,
            hasDraftV2Field: Boolean((agentData as AgentMessageData | undefined)?.draftV2),
            artifactTitle: artifact?.title,
            artifactVersion: artifact?.version,
          });
          streamedContent = "";
          const updatedMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: "",
            timestamp: new Date(),
            status: "sending",
            stage: "artifact",
            intent,
            data: agentData,
            chatbotTurn: chatbotTurnState,
          };
          if (hasAgentMessage) {
            updateMessage(updatedMessage);
          } else {
            appendMessage(updatedMessage);
            hasAgentMessage = true;
          }
        },
        onPlanArtifact: (artifact) => {
          if (streamSessionRef.current !== sessionId) return;
          const proposal = mapPlanArtifactToProposalOutput(artifact, sessionId);
          agentData = { type: "proposal", proposal };
          streamedContent = "";
          const updatedMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: "",
            timestamp: new Date(),
            status: "sending",
            stage: "artifact",
            intent,
            data: agentData,
            chatbotTurn: chatbotTurnState,
          };
          if (hasAgentMessage) {
            updateMessage(updatedMessage);
          } else {
            appendMessage(updatedMessage);
            hasAgentMessage = true;
          }
          clearSessionStatus(sessionId);
        },
        onPlanExecuted: (artifact) => {
          if (streamSessionRef.current !== sessionId) return;
          applyProposalUiState(
            String(artifact?.pendingActionId || ""),
            mapPlanExecutedArtifactToUiState(artifact),
          );
          setSessionStatus(sessionId, {
            action: artifact.ok ? "Planned action executed." : "Planned action failed.",
            phase: "plan_executed",
          });
        },
        onPlanRejected: (artifact) => {
          if (streamSessionRef.current !== sessionId) return;
          applyProposalUiState(String(artifact?.pendingActionId || ""), { status: "cancelled" });
          setSessionStatus(sessionId, {
            action: "Planned action cancelled.",
            phase: "plan_rejected",
          });
        },
        onSuggestionArtifact: (artifact) => {
          if (streamSessionRef.current !== sessionId) return;
          console.info("[AGENT_SUGGESTION_EVENT_RECEIVED]", {
            sessionId,
            agentMessageId,
            domain: artifact?.domain,
            actionType: artifact?.actionType,
            targetType: artifact?.targetType,
          });
          const suggestions = mapSuggestionArtifactToAssistSuggestions(artifact);
          if (hasAgentMessage) {
            const existing = workingMessages.find((msg) => msg.id === agentMessageId);
            if (existing) {
              updateMessage({
                ...existing,
                proactiveSuggestions: suggestions,
              });
            } else {
              appendMessage({
                id: agentMessageId,
                role: "agent",
                content: streamedContent,
                timestamp: new Date(),
                status: "sending",
                stage: agentData ? "artifact" : "commentary",
                intent,
                data: agentData,
                proactiveSuggestions: suggestions,
              });
            }
            clearSessionStatus(sessionId);
            return;
          }
          agentData = {
            type: "assist_suggestions",
            assistSuggestions: suggestions,
          };
          streamedContent = "";
          appendMessage({
            id: agentMessageId,
            role: "agent",
            content: "",
            timestamp: new Date(),
            status: "sending",
            stage: "artifact",
            intent,
            data: agentData,
          });
          hasAgentMessage = true;
          clearSessionStatus(sessionId);
        },
        onResult: (data) => {
          // ========== STAGE 3: ARTIFACT ==========
          if (streamSessionRef.current !== sessionId) return;
          emitEntityMutationFromAgentOutcome((data as { mutationOutcome?: unknown })?.mutationOutcome);

          const output = data.output;
          intent = data.intent;
          const mutationResolution = resolveChatbotMutationStateFromAssistantResult({
            mutationOutcome: (data as { mutationOutcome?: { status?: string | null } | null })
              ?.mutationOutcome,
            outputType: output?.type,
          });
          if (mutationResolution) {
            chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
              type: "mutation_resolved",
              state: mutationResolution,
            });
          }

          // TURN COMPLETION INVARIANT: Handle chat outputs defensively
          if (output.type === "chat") {
            const chatMessage = (output as import("../../services/api/agent").ChatOutput).message || "";
            if (agentData) {
              // Preserve already-emitted artifact payloads (for example draft_v2).
              // The chat text is treated as commentary instead of replacing the artifact view.
              if (chatMessage.trim().length > 0 && !commentary) {
                commentary = {
                  message: chatMessage,
                  source: "llm",
                  signals: [],
                };
              }
              streamedContent = "";
            } else {
              streamedContent = chatMessage;
            }
          } else if (output.type === "explanation") {
            const explanation = output as ExplanationOutput;
            if (Array.isArray(explanation.followUps) && explanation.followUps.length > 0) {
              deferredFollowUps = explanation.followUps;
              agentData = {
                type: "explanation",
                explanation: { ...explanation, followUps: [] },
              };
            } else {
              agentData = { type: "explanation", explanation };
            }
            streamedContent = "";
          } else if (output.type === "clarification") {
            agentData = { type: "clarification", clarification: output };
            streamedContent = "";
          } else if (output.type === "operational_risk_analysis") {
            agentData = { type: "risks", risks: output };
            streamedContent = "";
          } else if (
            ["INVITATION", "CLIENT_EMAIL", "HEARING_SUMMARY", "INTERNAL_NOTE"].includes(
              output.type
            )
          ) {
            agentData = {
              type: "draft",
              draft: output as import("../../services/api/agent").DraftOutput,
            };
            streamedContent = "";
          } else if (output.type === "collection") {
            agentData = { type: "collection", collection: output as CollectionOutput };
            streamedContent = "";
          } else if (output.type === "context_suggestion") {
            agentData = { type: "context_suggestion", contextSuggestion: output as import("../../services/api/agent").ContextSuggestionOutput };
            streamedContent = "";
          } else if (output.type === "proposal") {
            agentData = { type: "proposal", proposal: output };
            streamedContent = "";
          } else if (output.type === "entity_creation_form") {
            agentData = {
              type: "entity_creation_form",
              entityCreationForm: output as import("../../services/api/agent").EntityCreationFormOutput,
            };
            streamedContent = "";
          } else if (output.type === "document_draft") {
            const proposalArtifact =
              (data as { mutationOutcome?: { proposalArtifact?: unknown } | null })?.mutationOutcome
                ?.proposalArtifact;
            agentData = {
              type: "document_draft",
              documentDraft: output as import("../../services/api/agent").DocumentDraftOutput,
              proposal:
                proposalArtifact && typeof proposalArtifact === "object" && (proposalArtifact as { type?: unknown }).type === "proposal"
                  ? (proposalArtifact as import("../../services/api/agent").ProposalOutput)
                  : undefined,
            };
            streamedContent = "";
          } else if (output.type === "document_generation_preview") {
            agentData = {
              type: "document_generation_preview",
              documentGenerationPreview: output,
            };
            streamedContent = "";
          } else if (output.type === "document_generation_missing_fields") {
            agentData = {
              type: "document_generation_missing_fields",
              documentGenerationMissingFields: output,
            };
            streamedContent = "";
          } else if (output.type === "web_search_results") {
            agentData = {
              type: output.type,
              webSearchResults: output as WebSearchResultsOutput,
            };
            const preservedChatSummary = String(streamedContent || "").trim();
            if (preservedChatSummary.length > 0 && !commentary) {
              commentary = {
                message: preservedChatSummary,
                source: "llm",
                signals: [],
              };
            }
            streamedContent = "";
          } else if (output.type === "chat_context_summary") {
            agentData = {
              type: "chat_context_summary",
              chatContextSummary: output as import("../../services/api/agent").ChatContextSummaryOutput,
            };
          } else if (output.type === "recovery") {
            agentData = {
              type: "recovery",
              recovery: output,
            };
            streamedContent = "";
          } else if (output.type === "assist_suggestions") {
            if (hasAgentMessage) {
              const _existing = workingMessages.find((m) => m.id === agentMessageId);
              if (_existing) updateMessage({ ..._existing, proactiveSuggestions: output as import("../../services/api/agent").AssistSuggestionsOutput });
              clearSessionStatus(sessionId);
              return;
            }
            agentData = {
              type: "assist_suggestions",
              assistSuggestions: output as import("../../services/api/agent").AssistSuggestionsOutput,
            };
            streamedContent = "";
          } else if (output.type === "action_plan") {
            agentData = { type: "actions", actionProposals: output.actions };
            streamedContent = "";
          }

          const resultMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            stage: "artifact",
            intent,
            data: agentData,
          };
          if (hasAgentMessage) {
            updateMessage(resultMessage);
          } else {
            appendMessage(resultMessage);
            hasAgentMessage = true;
          }
          clearSessionStatus(sessionId);
        },
        onCommentary: (data) => {
          // ========== STAGE 4: COMMENTARY ==========
          if (streamSessionRef.current !== sessionId) return;
          if (data.visibility === "metadata") return;
          const mergedMessage = mergeUniqueCommentaryLines(
            String(commentary?.message || ""),
            String(data?.message || ""),
          );
          commentary = {
            ...(commentary || {}),
            ...(data || {}),
            message: mergedMessage,
          };
          streamedCommentaryContent = mergedMessage;

          // Update message with commentary (artifact already rendered)
          const messageWithCommentary: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            stage: "artifact",
            intent,
            data: agentData,
            commentary,
          };
          if (hasAgentMessage) {
            updateMessage(messageWithCommentary);
          } else {
            appendMessage(messageWithCommentary);
            hasAgentMessage = true;
          }
        },
        onCommentaryChunk: (chunk) => {
          if (streamSessionRef.current !== sessionId) return;
          streamedCommentaryContent += chunk;

          const streamingCommentary: CommentaryOutput = {
            message: streamedCommentaryContent,
            source: "llm",
            signals: [],
          };

          const messageWithStreamingCommentary: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            stage: "artifact",
            intent,
            data: agentData,
            commentary: streamingCommentary,
          };
          if (hasAgentMessage) {
            updateMessage(messageWithStreamingCommentary);
          } else {
            appendMessage(messageWithStreamingCommentary);
            hasAgentMessage = true;
          }
        },
        onDone: (data) => {
          if (streamSessionRef.current !== sessionId) return;
          emitEntityMutationFromAgentOutcome((data as { mutationOutcome?: unknown })?.mutationOutcome);
          const mutationResolution = resolveChatbotMutationStateFromDone({
            mutationOutcome: (data as { mutationOutcome?: { status?: string | null } | null })
              ?.mutationOutcome,
            hasPendingMutation: chatbotTurnState?.mutation?.state === "pending",
          });
          if (mutationResolution) {
            chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
              type: "mutation_resolved",
              state: mutationResolution,
            });
          }

          if (deferredFollowUps && agentData?.type === "explanation" && agentData.explanation) {
            agentData = {
              ...agentData,
              explanation: { ...agentData.explanation, followUps: deferredFollowUps },
            };
          }

          let proactiveSuggestions: AssistSuggestionsOutput | undefined;
          const existingMessage = workingMessages.find((msg) => msg.id === agentMessageId);
          const hasExistingSuggestions = Boolean(
            existingMessage?.proactiveSuggestions?.suggestions?.length,
          );
          if (!hasExistingSuggestions) {
            const inferredArtifact = inferSuggestionArtifactFromConfirmationText(streamedContent);
            if (inferredArtifact) {
              proactiveSuggestions = mapSuggestionArtifactToAssistSuggestions(inferredArtifact);
              if (agentData?.type !== "assist_suggestions") {
                agentData = {
                  type: "assist_suggestions",
                  assistSuggestions: proactiveSuggestions,
                };
              }
              console.info("[AGENT_SUGGESTION_FALLBACK_INFERRED]", {
                sessionId,
                agentMessageId,
                domain: inferredArtifact.domain,
                actionType: inferredArtifact.actionType,
              });
            }
          }

          const finalMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "success",
            stage: agentData ? "artifact" : "commentary",
            intent,
            data: agentData,
            proactiveSuggestions,
            commentary,
          };
          if (hasAgentMessage) {
            updateMessage(finalMessage);
          } else {
            appendMessage(finalMessage);
            hasAgentMessage = true;
          }
          safeSetIsLoading(false);
          clearStreamRegistry();
          clearSessionStatus(sessionId);
        },
        onError: (error) => {
          if (streamSessionRef.current !== sessionId) return;
          if (chatbotTurnState?.mutation?.state === "pending") {
            chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
              type: "mutation_resolved",
              state: "error",
            });
          }

          const errorMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: "",
            timestamp: new Date(),
            status: "success",
            stage: "artifact",
            data: {
              type: "recovery",
              recovery: {
                type: "recovery",
                message: "I could not complete that request.",
                whatHappened: String(error || "The request failed during processing."),
                canRetry: true,
                alternatives: [
                  { label: "Retry request", action: "retry", prompt: "Retry the same request" },
                ],
                suggestedPrompts: ["Retry the same request"],
                context: null,
                severity: "temporary",
              },
            },
          };
          if (hasAgentMessage) {
            updateMessage(errorMessage);
          } else {
            appendMessage(errorMessage);
            hasAgentMessage = true;
          }
          safeSetIsLoading(false);
          clearStreamRegistry();
          clearSessionStatus(sessionId);
        },
        onCancelled: () => {
          safeSetIsLoading(false);
          clearStreamRegistry();
          clearSessionStatus(sessionId);
        },
      }
    );

    registerStream(sessionId, abortController);
  }, [
    activeSessionId,
    activeSession,
    buildFollowUpIntent,
    conversation,
    createSession,
    dataAccess,
    agentVersion,
    contextScope,
    isLoading,
    scrollToBottom,
    updateSessionMessages,
    setSessionStatus,
    clearSessionStatus,
    t,
    safeSetIsLoading,
    withModelPreference,
    withRequestTrace,
    registerStream,
    clearStreamRegistry,
  ]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }, [handleSubmit]);

  // Start a stream for a given user message content (used for Retry/Regenerate actions)
  const startAgentStream = useCallback((
    userContent: string,
    opts?: {
      retryOf?: string;
      sourceUserId?: string;
      followUpIntent?: FollowUpIntent;
      metadata?: AgentRequestMetadata;
      sessionId?: string;
      replaceMessageId?: string;  // ID of assistant message to replace (for edits)
      editedMessageId?: string;   // ID of user message to update (for edits)
      prependUserBubble?: boolean;
    }
  ) => {
    if (!userContent || !activeSessionId || isLoading || streamRegistry.isStreaming) return;

    // ========== STAGE 1: ATOMIC MESSAGE UPDATE FOR EDITS ==========
    const agentMessageId = createMessageId("a");
    const intentMessageId = agentMessageId;
    const baseMessages = [...(activeSession?.messages || [])];

    // ATOMIC UPDATE: Remove ALL old assistant messages AND update user message (if edit)
    let workingMessages = baseMessages;

    // If this is an edit, remove ALL assistant/agent messages after the edited user message
    if (opts?.editedMessageId) {
      const editedMsgIndex = workingMessages.findIndex(m => m.id === opts.editedMessageId);
      if (editedMsgIndex !== -1) {
        // Remove all assistant/agent messages after the edited user message
        workingMessages = workingMessages.filter((m, idx) => {
          if (idx <= editedMsgIndex) return true;
          // Remove all agent/assistant messages until we hit another user message
          const role = String((m as { role?: string }).role || "").toLowerCase();
          if (role === "agent" || role === "assistant") return false;
          return true;
        });
      }
      // Update user message content and mark as edited
      workingMessages = workingMessages.map(m =>
        m.id === opts.editedMessageId
          ? { ...m, content: userContent.trim(), edited: true }
          : m
      );
    }

    if (opts?.prependUserBubble) {
      const userBubbleContent = String(userContent || "").trim();
      if (userBubbleContent.length > 0) {
        workingMessages = [
          ...workingMessages,
          {
            id: createMessageId("u"),
            role: "user",
            content: userBubbleContent,
            timestamp: new Date(),
          },
        ];
      }
    }

    // If this is a regenerate/retry replacement, clear existing assistant message content in place
    // so the old answer disappears immediately and the new stream reuses the same slot.
    // For draft_v2 messages, preserve the draft data so the card stays mounted (shimmer in place).
    // Version history is accumulated here (not in the component) to avoid React state batching races.
    let preservedVersionHistory: import("../../services/api/agent").DraftVersionEntry[] | undefined;
    let preservedDraftData: AgentMessageData | undefined;
    if (opts?.replaceMessageId) {
      const oldMessage = workingMessages.find((m) => m.id === opts.replaceMessageId);
      if (oldMessage?.data?.type === "draft_v2" && oldMessage.data.draftV2) {
        const oldDraft = oldMessage.data.draftV2;
        const existingHistory = oldDraft.versionHistory || [];
        const regenInstruction = opts?.metadata?.regenInstruction;
        // Build the version entry from the current (fresh) message data.
        const currentEntry: import("../../services/api/agent").DraftVersionEntry = {
          version: oldDraft.version || 1,
          sections: oldDraft.sections,
          layout: oldDraft.layout,
          content: oldDraft.content,
          title: oldDraft.title,
          subtitle: oldDraft.subtitle,
          metadata: oldDraft.metadata,
          generatedAt: oldDraft.generatedAt,
          instruction: regenInstruction,
        };
        preservedVersionHistory = [...existingHistory, currentEntry];
        // Build preserved data WITH the accumulated history so the card shows versions while regenerating.
        preservedDraftData = {
          ...oldMessage.data,
          draftV2: { ...oldDraft, versionHistory: preservedVersionHistory },
        } as AgentMessageData;
      }
      workingMessages = workingMessages.map((m) => {
        if (m.id !== opts.replaceMessageId) return m;
        const isDraftRegen = m.data?.type === "draft_v2" && m.data.draftV2;
        return {
          ...m,
          content: "",
          status: "sending" as const,
          stage: isDraftRegen ? ("artifact" as const) : ("commentary" as const),
          // Use preservedDraftData (with accumulated versionHistory) during regen.
          data: isDraftRegen ? preservedDraftData : undefined,
          commentary: undefined,
          retryOf: opts?.retryOf,
          timestamp: new Date(),
        };
      });
    }

    updateSessionMessages(activeSessionId, workingMessages);
    safeSetIsLoading(true);
    // Show immediate loading indicator while waiting for backend
    setSessionStatus(activeSessionId, { action: "Analyzing your request…", phase: "init" });
    streamSessionRef.current = activeSessionId;

    const appendMessage = (message: AgentMessage) => {
      const nextMessage = decorateAgentMessage(message);
      const idx = workingMessages.findIndex((m) => m.id === message.id);
      if (idx !== -1) {
        workingMessages = workingMessages.map((m) =>
          m.id === message.id ? nextMessage : m
        );
      } else {
        workingMessages = [...workingMessages, nextMessage];
      }
      updateSessionMessages(activeSessionId, workingMessages);
    };

    const updateMessage = (message: AgentMessage) => {
      const nextMessage = decorateAgentMessage(message);
      const previous = workingMessages.find((msg) => msg.id === message.id);
      const mergedMessage =
        previous && !nextMessage.proactiveSuggestions && previous.proactiveSuggestions
          ? { ...nextMessage, proactiveSuggestions: previous.proactiveSuggestions }
          : nextMessage;
      workingMessages = workingMessages.map((msg) =>
        msg.id === message.id ? mergedMessage : msg
      );
      updateSessionMessages(activeSessionId, workingMessages);
    };

      let streamedContent = "";
      let intent = "GENERAL_CHAT";
      // Seed agentData from preserved draft so onChunk doesn't clear the card during regen.
      let agentData: AgentMessageData | undefined = preservedDraftData;
      let deferredFollowUps: FollowUpSuggestion[] | null = null;
      let commentary: CommentaryOutput | undefined;
      let hasAgentMessage = false;
      let hasIntentMessage = false;
      let chatbotTurnState: AgentMessage["chatbotTurn"] | undefined;
      let streamedIntentContent = "";
      let streamedCommentaryContent = "";

      const decorateAgentMessage = (message: AgentMessage) =>
        attachChatbotTurn(message, chatbotTurnState);

      const upsertIntentMessage = (
        content: string,
        intentOverride?: string,
        structured?: import("../../services/api/agent").IntentFramingOutput
      ) => {
        if (opts?.replaceMessageId) return;
        const trimmedContent = content.trim();
        if (!trimmedContent) return;
        const intentMessage: AgentMessage = {
          id: intentMessageId,
          role: "agent",
          content: trimmedContent,
          timestamp: new Date(),
          stage: "intent",
          intent: intentOverride || intent,
          messageType: "AGENT_INTENT_MESSAGE",
          intentFraming: structured,
          retryOf: opts?.retryOf,
        };
        const exists = workingMessages.some((msg) => msg.id === intentMessageId);
        if (exists) {
          updateMessage(intentMessage);
        } else {
          appendMessage(intentMessage);
        }
        hasIntentMessage = true;
      };

      const applyProposalUiState = (proposalId: string, uiState: ProposalUiState) => {
        if (!proposalId) return;
        const { nextMessages, changed } = applyProposalUiStateUpdate(
          workingMessages,
          proposalId,
          uiState,
          decorateAgentMessage,
        );
        if (!changed) return;
        workingMessages = nextMessages;
        updateSessionMessages(activeSessionId, workingMessages);
        if (agentData?.type === "proposal" && agentData.proposal) {
          agentData = {
            ...agentData,
            proposal: {
              ...agentData.proposal,
              proposals: (agentData.proposal.proposals || []).map((proposal) =>
                proposal.proposalId === proposalId ? { ...proposal, uiState } : proposal,
              ),
            },
          } as AgentMessageData;
        }
      };

      const abortController = streamAgentMessage(
      userContent,
      {
        contextScope,
        agentVersion,
        dataAccess,
        followUpIntent: opts?.followUpIntent,
        metadata: withModelPreference(
          withRequestTrace(
            opts?.metadata,
            opts?.retryOf || opts?.replaceMessageId ? "retry_or_regenerate" : "start_agent_stream",
          ),
        ),
        sessionId: activeSessionId,
      },
        {
          onStart: (data) => {
            intent = data.intent;
            if (streamSessionRef.current !== activeSessionId) return;
          },
        onIntentFraming: (data) => {
          if (streamSessionRef.current !== activeSessionId) return;
          if (data.visibility === "metadata") return;
          if (!data.message || data.message.trim().length === 0) return;
          streamedIntentContent = data.message;
          upsertIntentMessage(data.message, undefined, data.structured);
        },
        onIntentFramingChunk: (chunk) => {
          if (streamSessionRef.current !== activeSessionId) return;
          streamedIntentContent += chunk;
          upsertIntentMessage(streamedIntentContent);
        },
        onStatus: (data: StatusEventData) => {
          // ========== STAGE 2: STATUS UPDATES ==========
          if (streamSessionRef.current !== activeSessionId) return;
          setSessionStatus(activeSessionId, { action: data.action, phase: data.phase });
        },
        onChatMutationLifecycle: (action: ChatMutationLifecycleEvent) => {
          if (streamSessionRef.current !== activeSessionId) return;
          chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
            type: "mutation_execution",
            action,
          });
          const targetId = opts?.replaceMessageId || agentMessageId;
          if (hasAgentMessage) {
            const existing = workingMessages.find((msg) => msg.id === targetId);
            if (existing) updateMessage(existing);
          } else {
            appendMessage({
              id: targetId,
              role: "agent",
              content: "",
              timestamp: new Date(),
              status: "sending",
              stage: "artifact",
              intent,
              data: agentData,
              retryOf: opts?.retryOf,
            });
            hasAgentMessage = true;
          }
          clearSessionStatus(activeSessionId);
        },
        onMutationEvent: (event) => {
          emitEntityMutationFromBackendEvent(event);
        },
        onChunk: (content) => {
          if (streamSessionRef.current !== activeSessionId) return;
          streamedContent += content;
          const updatedMessage: AgentMessage = {
            id: opts?.replaceMessageId || agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            stage: agentData ? "artifact" : "commentary",
            intent,
            data: agentData,
            retryOf: opts?.retryOf,
          };
          if (hasAgentMessage) {
            updateMessage(updatedMessage);
          } else {
            appendMessage(updatedMessage);
            hasAgentMessage = true;
          }
          clearSessionStatus(activeSessionId);
        },
        onDraftArtifact: (artifact) => {
          if (streamSessionRef.current !== activeSessionId) return;
          const draftV2 = {
            ...artifact,
            type: "draft_v2",
            ...(preservedVersionHistory ? { versionHistory: preservedVersionHistory } : {}),
          } as import("../../services/api/agent").DraftArtifactData;
          agentData = { type: "draft_v2", draftV2 } as AgentMessageData;
          const targetId = opts?.replaceMessageId || agentMessageId;
          console.info("[AGENT_ARTIFACT_TRACE_STATE_ON_ARTIFACT]", {
            sessionId: activeSessionId,
            agentMessageId: targetId,
            dataType: agentData?.type,
            hasDraftV2Field: Boolean((agentData as AgentMessageData | undefined)?.draftV2),
            artifactTitle: artifact?.title,
            artifactVersion: artifact?.version,
          });
          streamedContent = "";
          const updatedMessage: AgentMessage = {
            id: targetId,
            role: "agent",
            content: "",
            timestamp: new Date(),
            status: "sending",
            stage: "artifact",
            intent,
            data: agentData,
            chatbotTurn: chatbotTurnState,
            retryOf: opts?.retryOf,
          };
          if (hasAgentMessage) {
            updateMessage(updatedMessage);
          } else {
            appendMessage(updatedMessage);
            hasAgentMessage = true;
          }
        },
        onPlanArtifact: (artifact) => {
          if (streamSessionRef.current !== activeSessionId) return;
          const proposal = mapPlanArtifactToProposalOutput(artifact, activeSessionId);
          agentData = { type: "proposal", proposal };
          streamedContent = "";
          const targetId = opts?.replaceMessageId || agentMessageId;
          const updatedMessage: AgentMessage = {
            id: targetId,
            role: "agent",
            content: "",
            timestamp: new Date(),
            status: "sending",
            stage: "artifact",
            intent,
            data: agentData,
            chatbotTurn: chatbotTurnState,
            retryOf: opts?.retryOf,
          };
          if (hasAgentMessage) {
            updateMessage(updatedMessage);
          } else {
            appendMessage(updatedMessage);
            hasAgentMessage = true;
          }
          clearSessionStatus(activeSessionId);
        },
        onPlanExecuted: (artifact) => {
          if (streamSessionRef.current !== activeSessionId) return;
          applyProposalUiState(
            String(artifact?.pendingActionId || ""),
            mapPlanExecutedArtifactToUiState(artifact),
          );
          setSessionStatus(activeSessionId, {
            action: artifact.ok ? "Planned action executed." : "Planned action failed.",
            phase: "plan_executed",
          });
        },
        onPlanRejected: (artifact) => {
          if (streamSessionRef.current !== activeSessionId) return;
          applyProposalUiState(String(artifact?.pendingActionId || ""), { status: "cancelled" });
          setSessionStatus(activeSessionId, {
            action: "Planned action cancelled.",
            phase: "plan_rejected",
          });
        },
        onSuggestionArtifact: (artifact) => {
          if (streamSessionRef.current !== activeSessionId) return;
          console.info("[AGENT_SUGGESTION_EVENT_RECEIVED]", {
            sessionId: activeSessionId,
            agentMessageId: opts?.replaceMessageId || agentMessageId,
            domain: artifact?.domain,
            actionType: artifact?.actionType,
            targetType: artifact?.targetType,
          });
          const suggestions = mapSuggestionArtifactToAssistSuggestions(artifact);
          const targetId = opts?.replaceMessageId || agentMessageId;
          if (hasAgentMessage) {
            const existing = workingMessages.find((msg) => msg.id === targetId);
            if (existing) {
              updateMessage({
                ...existing,
                proactiveSuggestions: suggestions,
              });
            } else {
              appendMessage({
                id: targetId,
                role: "agent",
                content: streamedContent,
                timestamp: new Date(),
                status: "sending",
                stage: agentData ? "artifact" : "commentary",
                intent,
                data: agentData,
                proactiveSuggestions: suggestions,
                retryOf: opts?.retryOf,
              });
            }
            clearSessionStatus(activeSessionId);
            return;
          }
          agentData = {
            type: "assist_suggestions",
            assistSuggestions: suggestions,
          };
          streamedContent = "";
          appendMessage({
            id: targetId,
            role: "agent",
            content: "",
            timestamp: new Date(),
            status: "sending",
            stage: "artifact",
            intent,
            data: agentData,
            retryOf: opts?.retryOf,
          });
          hasAgentMessage = true;
          clearSessionStatus(activeSessionId);
        },
        onResult: (data) => {
          // ========== STAGE 3: ARTIFACT ==========
          if (streamSessionRef.current !== activeSessionId) return;
          emitEntityMutationFromAgentOutcome((data as { mutationOutcome?: unknown })?.mutationOutcome);
          const output = data.output;
          intent = data.intent;
          const mutationResolution = resolveChatbotMutationStateFromAssistantResult({
            mutationOutcome: (data as { mutationOutcome?: { status?: string | null } | null })
              ?.mutationOutcome,
            outputType: output?.type,
          });
          if (mutationResolution) {
            chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
              type: "mutation_resolved",
              state: mutationResolution,
            });
          }

          // TURN COMPLETION INVARIANT: Handle chat outputs defensively
          if (output.type === "chat") {
            const chatMessage = (output as import("../../services/api/agent").ChatOutput).message || "";
            if (agentData) {
              // Preserve already-emitted artifact payloads (for example draft_v2).
              // The chat text is treated as commentary instead of replacing the artifact view.
              if (chatMessage.trim().length > 0 && !commentary) {
                commentary = {
                  message: chatMessage,
                  source: "llm",
                  signals: [],
                };
              }
              streamedContent = "";
            } else {
              streamedContent = chatMessage;
            }
          } else if (output.type === "explanation") {
            const explanation = output as ExplanationOutput;
            if (Array.isArray(explanation.followUps) && explanation.followUps.length > 0) {
              deferredFollowUps = explanation.followUps;
              agentData = {
                type: "explanation",
                explanation: { ...explanation, followUps: [] },
              };
            } else {
              agentData = { type: "explanation", explanation };
            }
            streamedContent = "";
          } else if (output.type === "clarification") {
            agentData = { type: "clarification", clarification: output };
            streamedContent = "";
          } else if (output.type === "operational_risk_analysis") {
            agentData = { type: "risks", risks: output };
            streamedContent = "";
          } else if (["INVITATION", "CLIENT_EMAIL", "HEARING_SUMMARY", "INTERNAL_NOTE"].includes(output.type)) {
            agentData = { type: "draft", draft: output as import("../../services/api/agent").DraftOutput };
            streamedContent = "";
          } else if (output.type === "collection") {
            agentData = { type: "collection", collection: output as CollectionOutput };
            streamedContent = "";
          } else if (output.type === "context_suggestion") {
            agentData = { type: "context_suggestion", contextSuggestion: output as import("../../services/api/agent").ContextSuggestionOutput };
            streamedContent = "";
          } else if (output.type === "proposal") {
            agentData = { type: "proposal", proposal: output };
            streamedContent = "";
          } else if (output.type === "entity_creation_form") {
            agentData = {
              type: "entity_creation_form",
              entityCreationForm: output as import("../../services/api/agent").EntityCreationFormOutput,
            };
            streamedContent = "";
          } else if (output.type === "document_draft") {
            const proposalArtifact =
              (data as { mutationOutcome?: { proposalArtifact?: unknown } | null })?.mutationOutcome
                ?.proposalArtifact;
            agentData = {
              type: "document_draft",
              documentDraft: output as import("../../services/api/agent").DocumentDraftOutput,
              proposal:
                proposalArtifact && typeof proposalArtifact === "object" && (proposalArtifact as { type?: unknown }).type === "proposal"
                  ? (proposalArtifact as import("../../services/api/agent").ProposalOutput)
                  : undefined,
            };
            streamedContent = "";
          } else if (output.type === "document_generation_preview") {
            agentData = {
              type: "document_generation_preview",
              documentGenerationPreview: output,
            };
            streamedContent = "";
          } else if (output.type === "document_generation_missing_fields") {
            agentData = {
              type: "document_generation_missing_fields",
              documentGenerationMissingFields: output,
            };
            streamedContent = "";
          } else if (output.type === "web_search_results") {
            agentData = {
              type: output.type,
              webSearchResults: output as WebSearchResultsOutput,
            };
            const preservedChatSummary = String(streamedContent || "").trim();
            if (preservedChatSummary.length > 0 && !commentary) {
              commentary = {
                message: preservedChatSummary,
                source: "llm",
                signals: [],
              };
            }
            streamedContent = "";
          } else if (output.type === "chat_context_summary") {
            agentData = {
              type: "chat_context_summary",
              chatContextSummary: output as import("../../services/api/agent").ChatContextSummaryOutput,
            };
          } else if (output.type === "recovery") {
            agentData = {
              type: "recovery",
              recovery: output,
            };
            streamedContent = "";
          } else if (output.type === "assist_suggestions") {
            if (hasAgentMessage) {
              const _existing = workingMessages.find((m) => m.id === agentMessageId);
              if (_existing) updateMessage({ ..._existing, proactiveSuggestions: output as import("../../services/api/agent").AssistSuggestionsOutput });
              clearSessionStatus(activeSessionId);
              return;
            }
            agentData = {
              type: "assist_suggestions",
              assistSuggestions: output as import("../../services/api/agent").AssistSuggestionsOutput,
            };
            streamedContent = "";
          } else if (output.type === "action_plan") {
            agentData = { type: "actions", actionProposals: output.actions };
            streamedContent = "";
          }

          const resultMessage: AgentMessage = {
            id: opts?.replaceMessageId || agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            stage: "artifact",
            intent,
            data: agentData,
            retryOf: opts?.retryOf,
          };
          if (hasAgentMessage) {
            updateMessage(resultMessage);
          } else {
            appendMessage(resultMessage);
            hasAgentMessage = true;
          }
          clearSessionStatus(activeSessionId);
        },
        onCommentary: (data) => {
          // ========== STAGE 4: COMMENTARY ==========
          if (streamSessionRef.current !== activeSessionId) return;
          if (data.visibility === "metadata") return;
          const mergedMessage = mergeUniqueCommentaryLines(
            String(commentary?.message || ""),
            String(data?.message || ""),
          );
          commentary = {
            ...(commentary || {}),
            ...(data || {}),
            message: mergedMessage,
          };
          streamedCommentaryContent = mergedMessage;

          // Update message with commentary (artifact already rendered)
          const messageWithCommentary: AgentMessage = {
            id: opts?.replaceMessageId || agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            stage: "artifact",
            intent,
            data: agentData,
            commentary,
            retryOf: opts?.retryOf,
          };
          if (hasAgentMessage) {
            updateMessage(messageWithCommentary);
          } else {
            appendMessage(messageWithCommentary);
            hasAgentMessage = true;
          }
        },
        onCommentaryChunk: (chunk) => {
          if (streamSessionRef.current !== activeSessionId) return;
          streamedCommentaryContent += chunk;

          const streamingCommentary: CommentaryOutput = {
            message: streamedCommentaryContent,
            source: "llm",
            signals: [],
          };

          const messageWithStreamingCommentary: AgentMessage = {
            id: opts?.replaceMessageId || agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            stage: "artifact",
            intent,
            data: agentData,
            commentary: streamingCommentary,
            retryOf: opts?.retryOf,
          };
          if (hasAgentMessage) {
            updateMessage(messageWithStreamingCommentary);
          } else {
            appendMessage(messageWithStreamingCommentary);
            hasAgentMessage = true;
          }
        },
        onDone: (data) => {
          if (streamSessionRef.current !== activeSessionId) return;
          emitEntityMutationFromAgentOutcome((data as { mutationOutcome?: unknown })?.mutationOutcome);
          const mutationResolution = resolveChatbotMutationStateFromDone({
            mutationOutcome: (data as { mutationOutcome?: { status?: string | null } | null })
              ?.mutationOutcome,
            hasPendingMutation: chatbotTurnState?.mutation?.state === "pending",
          });
          if (mutationResolution) {
            chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
              type: "mutation_resolved",
              state: mutationResolution,
            });
          }

          if (deferredFollowUps && agentData?.type === "explanation" && agentData.explanation) {
            agentData = {
              ...agentData,
              explanation: { ...agentData.explanation, followUps: deferredFollowUps },
            };
          }

          let proactiveSuggestions: AssistSuggestionsOutput | undefined;
          const finalMessageId = opts?.replaceMessageId || agentMessageId;
          const existingMessage = workingMessages.find((msg) => msg.id === finalMessageId);
          const hasExistingSuggestions = Boolean(
            existingMessage?.proactiveSuggestions?.suggestions?.length,
          );
          if (!hasExistingSuggestions) {
            const inferredArtifact = inferSuggestionArtifactFromConfirmationText(streamedContent);
            if (inferredArtifact) {
              proactiveSuggestions = mapSuggestionArtifactToAssistSuggestions(inferredArtifact);
              if (agentData?.type !== "assist_suggestions") {
                agentData = {
                  type: "assist_suggestions",
                  assistSuggestions: proactiveSuggestions,
                };
              }
              console.info("[AGENT_SUGGESTION_FALLBACK_INFERRED]", {
                sessionId: activeSessionId,
                agentMessageId: finalMessageId,
                domain: inferredArtifact.domain,
                actionType: inferredArtifact.actionType,
              });
            }
          }

          const finalMessage: AgentMessage = {
            id: finalMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "success",
            stage: agentData ? "artifact" : "commentary",
            intent,
            data: agentData,
            proactiveSuggestions,
            commentary,
            retryOf: opts?.retryOf,
          };
          if (hasAgentMessage) {
            updateMessage(finalMessage);
          } else {
            appendMessage(finalMessage);
            hasAgentMessage = true;
          }
          safeSetIsLoading(false);
          clearStreamRegistry();
          clearSessionStatus(activeSessionId);
        },
        onError: (error) => {
          if (streamSessionRef.current !== activeSessionId) return;
          if (chatbotTurnState?.mutation?.state === "pending") {
            chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
              type: "mutation_resolved",
              state: "error",
            });
          }

          const errorMessage: AgentMessage = {
            id: opts?.replaceMessageId || agentMessageId,
            role: "agent",
            content: "",
            timestamp: new Date(),
            status: "success",
            stage: "artifact",
            data: {
              type: "recovery",
              recovery: {
                type: "recovery",
                message: "I could not complete that request.",
                whatHappened: String(error || "The request failed during processing."),
                canRetry: true,
                alternatives: [
                  { label: "Retry request", action: "retry", prompt: "Retry the same request" },
                ],
                suggestedPrompts: ["Retry the same request"],
                context: null,
                severity: "temporary",
              },
            },
            retryOf: opts?.retryOf,
          };
          if (hasAgentMessage) {
            updateMessage(errorMessage);
          } else {
            appendMessage(errorMessage);
            hasAgentMessage = true;
          }
          safeSetIsLoading(false);
          clearStreamRegistry();
          clearSessionStatus(activeSessionId);
        },
        onCancelled: () => {
          safeSetIsLoading(false);
          clearStreamRegistry();
          clearSessionStatus(activeSessionId);
        },
      }
    );

    registerStream(activeSessionId, abortController);
  }, [
    activeSessionId,
    activeSession,
    updateSessionMessages,
    isLoading,
    contextScope,
    agentVersion,
    dataAccess,
    setSessionStatus,
    clearSessionStatus,
    safeSetIsLoading,
    withModelPreference,
    withRequestTrace,
    registerStream,
    clearStreamRegistry,
  ]);

  // Handler for clicking example suggestions (populates input)
  const handleExampleClick = useCallback((example: string) => {
    setInput(example);
    inputRef.current?.focus();
  }, [setInput]);

  const confirmWebSearch = useCallback(
    (metadata: AgentRequestMetadata) => {
      const safeMetadata: AgentRequestMetadata = {
        webSearchEnabled: true,
        webSearchTrigger: metadata?.webSearchTrigger || "user_confirmed",
        webSearchQuery: metadata?.webSearchQuery,
        webSearchIntent: "WEB_SEARCH",
      };
      const requestMessage =
        safeMetadata.webSearchQuery && safeMetadata.webSearchQuery.trim().length > 0
          ? safeMetadata.webSearchQuery.trim()
          : "Search the web.";
      startAgentStream(requestMessage, {
        metadata: safeMetadata,
        prependUserBubble: true,
      });
    },
    [startAgentStream],
  );

  return {
    input,
    setInput,
    conversation,
    showHistorySidebar,
    setShowHistorySidebar,
    showContextSidebar,
    setShowContextSidebar,
    isLoading,
    transientStatus: activeTransientStatus,
    agentVersion,
    setAgentVersion,
    modelPreference,
    setModelPreference,
    contextScope,
    setContextScope,
    dataAccess,
    setDataAccess,
    inputRef,
    conversationEndRef,
    scrollContainerRef,
    handleSubmit,
    handleKeyDown,
    handleExampleClick,
    saveScrollPosition,
    scrollToBottom,
    getRelativeTime,
    cancelStream,
    startAgentStream,
    confirmWebSearch,
    startFollowUpIntent,
  };
}

