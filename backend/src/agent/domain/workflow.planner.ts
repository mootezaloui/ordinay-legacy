import type {
  DomainWorkflowDiagnostics,
  DomainWorkflowStep,
  LinkResolutionDiagnostic,
  PendingActionPlan,
  PlanOperation,
  PlanPreview,
  PlanPreviewCascadeGroup,
  PlanPreviewChange,
} from "../types";
import { canonicalizeTargetStatus, isInactiveLike, normalizeStatus } from "./status.normalizer";
import { DomainRuleProfile } from "./rule.profile";
import { DomainGraphAnalyzer } from "./graph.analyzer";

declare const require: (id: string) => unknown;
declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const _path = require("path") as { resolve: (...args: string[]) => string };

interface EntityService {
  get?: (id: number | string) => unknown | Promise<unknown>;
  list?: () => unknown[] | Promise<unknown[]>;
}

const ENTITY_SERVICE_BY_TYPE: Record<string, string> = {
  client: "clients.service",
  dossier: "dossiers.service",
  lawsuit: "lawsuits.service",
  task: "tasks.service",
  session: "sessions.service",
  mission: "missions.service",
  officer: "officers.service",
  financial_entry: "financial.service",
  document: "documents.service",
  personal_task: "personalTasks.service",
};

export interface DomainWorkflowPlannerInput {
  operation: PlanOperation;
  summary: string;
  preview?: PlanPreview;
  userMessage?: string;
  linkResolution?: LinkResolutionDiagnostic;
}

export interface DomainWorkflowPlannerOutput {
  summary: string;
  plan: PendingActionPlan;
}

export class DomainWorkflowPlanner {
  private readonly serviceCache = new Map<string, EntityService | null>();

  constructor(
    private readonly rules: DomainRuleProfile = new DomainRuleProfile(),
    private readonly graphAnalyzer: DomainGraphAnalyzer = new DomainGraphAnalyzer(rules),
  ) {}

  async expand(input: DomainWorkflowPlannerInput): Promise<DomainWorkflowPlannerOutput> {
    const rootOperation = normalizeRootOperation(input.operation);
    const rootSnapshot = await this.readEntitySnapshot(rootOperation.entityType, rootOperation.entityId);
    const rootLabel = resolveEntityDisplayLabel(rootOperation.entityType, rootOperation.entityId, rootSnapshot);
    const rootCurrentValues = resolveCurrentValuesFromSnapshot(rootOperation.changes, rootSnapshot);
    const basePreview = input.preview;
    const summary = String(input.summary || "").trim() || describeOperation(rootOperation);
    const validation = await this.rules.validateOperation(rootOperation);

    if (validation.allowed) {
      const preview = buildSingleEntityPreview(
        rootOperation,
        basePreview,
        rootLabel,
        rootCurrentValues,
      );
      applyLinkResolutionPreview(preview, input.linkResolution);
      return {
        summary,
        plan: {
          operation: rootOperation,
          rootOperation,
          preview,
          uiPreview: preview,
          diagnostics: {
            plannerVersion: "domain_workflow_v1",
            analyzedAt: new Date().toISOString(),
            blockerCounts: {},
            ...(input.linkResolution ? { linkResolution: input.linkResolution } : {}),
            notes: [],
            requiresUserDecision: false,
          },
        },
      };
    }

    const userMessage = String(input.userMessage || "");
    const steps: DomainWorkflowStep[] = [];
    const notes = [...validation.notes];
    const blockerCounts = { ...validation.blockerCounts };
    let requiresUserDecision = false;
    let decisionPrompt: string | undefined;
    let decisionOptions: DomainWorkflowDiagnostics["decisionOptions"] = undefined;

    if (
      rootOperation.operation === "update" &&
      rootOperation.entityType === "client" &&
      statusRequested(rootOperation, "inactive")
    ) {
      // Use rule-profile blockers as the source of truth for executable workflow steps.
      // Graph snapshots are optimized for UI traversal and can under-sample deep descendants.
      const blockers = await this.rules.getClientInactiveBlockers(assertEntityId(rootOperation));
      const nextSteps = buildClientInactiveWorkflowSteps(blockers, rootOperation, userMessage);
      steps.push(...nextSteps.steps);
      if (nextSteps.requiresInvoiceDecision) {
        requiresUserDecision = true;
        decisionPrompt =
          "This client still has unpaid receivable entries. Choose whether to settle them before inactivating the client.";
        decisionOptions = [
          {
            key: "settle_receivables",
            title: "Settle receivables first",
            description: "Mark unpaid receivable entries as paid before setting the client inactive.",
          },
          {
            key: "keep_receivables_open",
            title: "Keep receivables open",
            description: "Do not execute until receivables are manually resolved.",
          },
        ];
      }
    } else if (
      rootOperation.operation === "update" &&
      rootOperation.entityType === "dossier" &&
      statusRequested(rootOperation, "closed")
    ) {
      // Keep planner step generation aligned with validation blockers from rule profile.
      const blockers = await this.rules.getDossierCloseBlockers(assertEntityId(rootOperation));
      const nextSteps = buildDossierCloseWorkflowSteps(blockers, rootOperation, userMessage);
      steps.push(...nextSteps.steps);
      if (nextSteps.requiresInvoiceDecision) {
        requiresUserDecision = true;
        decisionPrompt =
          "This dossier's client still has unpaid receivable entries. Choose whether to settle receivables before closing.";
        decisionOptions = [
          {
            key: "settle_receivables",
            title: "Settle receivables first",
            description: "Mark unpaid receivable entries as paid before closing the dossier.",
          },
          {
            key: "keep_receivables_open",
            title: "Keep receivables open",
            description: "Do not execute until receivables are manually resolved.",
          },
        ];
      }
    } else if (
      rootOperation.operation === "update" &&
      rootOperation.entityType === "lawsuit" &&
      statusRequested(rootOperation, "closed")
    ) {
      // Keep planner step generation aligned with validation blockers from rule profile.
      const blockers = await this.rules.getLawsuitCloseBlockers(assertEntityId(rootOperation));
      steps.push(...buildLawsuitCloseWorkflowSteps(blockers, rootOperation));
    } else if (rootOperation.operation === "delete") {
      const forceDeleteRequested = looksLikeForceDelete(userMessage);
      if (!forceDeleteRequested) {
        requiresUserDecision = true;
        decisionPrompt =
          "This delete request may remove related records. Confirm with an explicit force-delete instruction before execution.";
        decisionOptions = [
          {
            key: "force_delete",
            title: "Force delete with cascade",
            description: "Proceed knowing related records can be removed.",
          },
          {
            key: "cancel_delete",
            title: "Cancel delete",
            description: "Keep records unchanged.",
          },
        ];
      }
      steps.push(
        buildUpdateOrDeleteStep({
          id: "step_root",
          operation: rootOperation.operation,
          entityType: rootOperation.entityType,
          entityId: rootOperation.entityId,
          payload: rootOperation.payload,
          changes: rootOperation.changes,
          reason: rootOperation.reason || "Original user request",
          dependsOn: [],
        }),
      );
    } else {
      const reopenFlowSteps = buildAncestorReopenWorkflowSteps(
        rootOperation,
        blockerCounts,
        rootSnapshot,
      );
      if (reopenFlowSteps.length > 0) {
        steps.push(...reopenFlowSteps);
      }
    }

    if (steps.length === 0) {
      steps.push(
        buildUpdateOrDeleteStep({
          id: "step_root",
          operation: rootOperation.operation,
          entityType: rootOperation.entityType,
          entityId: rootOperation.entityId,
          payload: rootOperation.payload,
          changes: rootOperation.changes,
          reason: rootOperation.reason || "Original user request",
          dependsOn: [],
        }),
      );
    }

    const normalizedSteps = sequenceWithDependencies(steps);
    const preview = buildWorkflowPreview({
      rootOperation,
      steps: normalizedSteps,
      basePreview,
      notes,
      blockerCounts,
      requiresUserDecision,
      decisionOptions,
      rootLabel,
      rootCurrentValues,
    });
    applyLinkResolutionPreview(preview, input.linkResolution);

    const diagnostics: DomainWorkflowDiagnostics = {
      plannerVersion: "domain_workflow_v1",
      analyzedAt: new Date().toISOString(),
      blockerCounts,
      ...(input.linkResolution ? { linkResolution: input.linkResolution } : {}),
      notes,
      requiresUserDecision,
      ...(decisionPrompt ? { decisionPrompt } : {}),
      ...(decisionOptions ? { decisionOptions } : {}),
    };

    return {
      summary: preview?.title || summary,
      plan: {
        operation: rootOperation,
        rootOperation,
        workflowSteps: normalizedSteps,
        diagnostics,
        preview,
        uiPreview: preview,
      },
    };
  }

  private getService(entityType: string): EntityService | null {
    const normalized = String(entityType || "").trim().toLowerCase();
    const fileName = ENTITY_SERVICE_BY_TYPE[normalized];
    if (!fileName) return null;

    if (this.serviceCache.has(fileName)) {
      return this.serviceCache.get(fileName) ?? null;
    }

    try {
      const resolved = _path.resolve(__dirname, "..", "..", "..", "src", "services", fileName);
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const loaded = require(resolved) as EntityService;
      const service = loaded && typeof loaded === "object" ? loaded : null;
      this.serviceCache.set(fileName, service);
      return service;
    } catch {
      this.serviceCache.set(fileName, null);
      return null;
    }
  }

  private async readEntitySnapshot(
    entityType: string,
    entityId: number | string | undefined,
  ): Promise<Record<string, unknown> | null> {
    if (entityId == null) return null;
    const service = this.getService(entityType);
    if (!service) return null;

    if (typeof service.get === "function") {
      try {
        const fetched = await Promise.resolve(service.get(entityId));
        if (isRecord(fetched)) return fetched;
      } catch {
        // Ignore and continue with list fallback.
      }
    }

    if (typeof service.list === "function") {
      try {
        const rows = await Promise.resolve(service.list());
        if (Array.isArray(rows)) {
          const found = rows.find((row) => {
            if (!isRecord(row)) return false;
            return String(row.id ?? "") === String(entityId);
          });
          if (isRecord(found)) return found;
        }
      } catch {
        // Ignore read failures and keep preview graceful.
      }
    }
    return null;
  }
}

function normalizeRootOperation(operation: PlanOperation): PlanOperation {
  const entityType = String(operation.entityType || "").trim().toLowerCase();
  const op = String(operation.operation || "").trim().toLowerCase() as PlanOperation["operation"];
  const normalized: PlanOperation = {
    operation: op,
    entityType,
  };
  if (operation.entityId != null) normalized.entityId = operation.entityId;
  if (isRecord(operation.payload)) normalized.payload = { ...operation.payload };
  if (isRecord(operation.changes)) {
    const nextChanges = { ...operation.changes };
    if (Object.prototype.hasOwnProperty.call(nextChanges, "status")) {
      const canonical = canonicalizeTargetStatus(entityType, nextChanges.status);
      if (canonical) {
        nextChanges.status = canonical;
      }
    }
    normalized.changes = nextChanges;
  }
  if (typeof operation.reason === "string" && operation.reason.trim().length > 0) {
    normalized.reason = operation.reason.trim();
  }
  return normalized;
}

function buildClientInactiveWorkflowSteps(
  blockers: Awaited<ReturnType<DomainRuleProfile["getClientInactiveBlockers"]>>,
  rootOperation: PlanOperation,
  userMessage: string,
): { steps: DomainWorkflowStep[]; requiresInvoiceDecision: boolean } {
  const steps: DomainWorkflowStep[] = [];

  for (const row of blockers.tasks) {
    const id = asEntityId(row.id);
    if (id == null) continue;
    steps.push(
      buildUpdateOrDeleteStep({
        id: `task_${String(id)}`,
        operation: "update",
        entityType: "task",
        entityId: id,
        changes: { status: "done" },
        reason: "Resolve task before inactivating client.",
      }),
    );
  }

  for (const row of blockers.sessions) {
    const id = asEntityId(row.id);
    if (id == null) continue;
    steps.push(
      buildUpdateOrDeleteStep({
        id: `session_${String(id)}`,
        operation: "update",
        entityType: "session",
        entityId: id,
        changes: { status: "cancelled" },
        reason: "Resolve session before inactivating client.",
      }),
    );
  }

  for (const row of blockers.missions) {
    const id = asEntityId(row.id);
    if (id == null) continue;
    steps.push(
      buildUpdateOrDeleteStep({
        id: `mission_${String(id)}`,
        operation: "update",
        entityType: "mission",
        entityId: id,
        changes: { status: "completed" },
        reason: "Resolve mission before inactivating client.",
      }),
    );
  }

  for (const row of blockers.lawsuits) {
    const id = asEntityId(row.id);
    if (id == null) continue;
    steps.push(
      buildUpdateOrDeleteStep({
        id: `lawsuit_${String(id)}`,
        operation: "update",
        entityType: "lawsuit",
        entityId: id,
        changes: { status: "closed" },
        reason: "Close lawsuit before inactivating client.",
      }),
    );
  }

  for (const row of blockers.dossiers) {
    const id = asEntityId(row.id);
    if (id == null) continue;
    steps.push(
      buildUpdateOrDeleteStep({
        id: `dossier_${String(id)}`,
        operation: "update",
        entityType: "dossier",
        entityId: id,
        changes: { status: "closed" },
        reason: "Close dossier before inactivating client.",
      }),
    );
  }

  const shouldSettleReceivables =
    blockers.unpaidReceivables.length > 0 && looksLikeSettleReceivables(userMessage);
  if (shouldSettleReceivables) {
    for (const row of blockers.unpaidReceivables) {
      const id = asEntityId(row.id);
      if (id == null) continue;
      steps.push(
        buildUpdateOrDeleteStep({
          id: `financial_entry_${String(id)}`,
          operation: "update",
          entityType: "financial_entry",
          entityId: id,
          changes: {
            status: "confirmed",
            paid_at: new Date().toISOString(),
          },
          reason: "Settle receivable before inactivating client.",
        }),
      );
    }
  }

  steps.push(
    buildUpdateOrDeleteStep({
      id: "step_root",
      operation: rootOperation.operation,
      entityType: rootOperation.entityType,
      entityId: rootOperation.entityId,
      changes: rootOperation.changes,
      payload: rootOperation.payload,
      reason: rootOperation.reason || "Original user request",
    }),
  );

  return {
    steps,
    requiresInvoiceDecision: blockers.unpaidReceivables.length > 0 && !shouldSettleReceivables,
  };
}

function buildDossierCloseWorkflowSteps(
  blockers: Awaited<ReturnType<DomainRuleProfile["getDossierCloseBlockers"]>>,
  rootOperation: PlanOperation,
  userMessage: string,
): { steps: DomainWorkflowStep[]; requiresInvoiceDecision: boolean } {
  const steps: DomainWorkflowStep[] = [];

  for (const row of blockers.tasks) {
    const id = asEntityId(row.id);
    if (id == null) continue;
    steps.push(
      buildUpdateOrDeleteStep({
        id: `task_${String(id)}`,
        operation: "update",
        entityType: "task",
        entityId: id,
        changes: { status: "done" },
        reason: "Resolve task before closing dossier.",
      }),
    );
  }

  for (const row of blockers.sessions) {
    const id = asEntityId(row.id);
    if (id == null) continue;
    steps.push(
      buildUpdateOrDeleteStep({
        id: `session_${String(id)}`,
        operation: "update",
        entityType: "session",
        entityId: id,
        changes: { status: "cancelled" },
        reason: "Resolve session before closing dossier.",
      }),
    );
  }

  for (const row of blockers.missions) {
    const id = asEntityId(row.id);
    if (id == null) continue;
    steps.push(
      buildUpdateOrDeleteStep({
        id: `mission_${String(id)}`,
        operation: "update",
        entityType: "mission",
        entityId: id,
        changes: { status: "completed" },
        reason: "Resolve mission before closing dossier.",
      }),
    );
  }

  for (const row of blockers.lawsuits) {
    const id = asEntityId(row.id);
    if (id == null) continue;
    steps.push(
      buildUpdateOrDeleteStep({
        id: `lawsuit_${String(id)}`,
        operation: "update",
        entityType: "lawsuit",
        entityId: id,
        changes: { status: "closed" },
        reason: "Close lawsuit before closing dossier.",
      }),
    );
  }

  const shouldSettleReceivables =
    blockers.unpaidReceivables.length > 0 && looksLikeSettleReceivables(userMessage);
  if (shouldSettleReceivables) {
    for (const row of blockers.unpaidReceivables) {
      const id = asEntityId(row.id);
      if (id == null) continue;
      steps.push(
        buildUpdateOrDeleteStep({
          id: `financial_entry_${String(id)}`,
          operation: "update",
          entityType: "financial_entry",
          entityId: id,
          changes: {
            status: "confirmed",
            paid_at: new Date().toISOString(),
          },
          reason: "Settle receivable before closing dossier.",
        }),
      );
    }
  }

  steps.push(
    buildUpdateOrDeleteStep({
      id: "step_root",
      operation: rootOperation.operation,
      entityType: rootOperation.entityType,
      entityId: rootOperation.entityId,
      changes: rootOperation.changes,
      payload: rootOperation.payload,
      reason: rootOperation.reason || "Original user request",
    }),
  );

  return {
    steps,
    requiresInvoiceDecision: blockers.unpaidReceivables.length > 0 && !shouldSettleReceivables,
  };
}

function buildLawsuitCloseWorkflowSteps(
  blockers: Awaited<ReturnType<DomainRuleProfile["getLawsuitCloseBlockers"]>>,
  rootOperation: PlanOperation,
): DomainWorkflowStep[] {
  const steps: DomainWorkflowStep[] = [];
  for (const row of blockers.tasks) {
    const id = asEntityId(row.id);
    if (id == null) continue;
    steps.push(
      buildUpdateOrDeleteStep({
        id: `task_${String(id)}`,
        operation: "update",
        entityType: "task",
        entityId: id,
        changes: { status: "done" },
        reason: "Resolve task before closing lawsuit.",
      }),
    );
  }
  for (const row of blockers.sessions) {
    const id = asEntityId(row.id);
    if (id == null) continue;
    steps.push(
      buildUpdateOrDeleteStep({
        id: `session_${String(id)}`,
        operation: "update",
        entityType: "session",
        entityId: id,
        changes: { status: "cancelled" },
        reason: "Resolve session before closing lawsuit.",
      }),
    );
  }
  for (const row of blockers.missions) {
    const id = asEntityId(row.id);
    if (id == null) continue;
    steps.push(
      buildUpdateOrDeleteStep({
        id: `mission_${String(id)}`,
        operation: "update",
        entityType: "mission",
        entityId: id,
        changes: { status: "completed" },
        reason: "Resolve mission before closing lawsuit.",
      }),
    );
  }
  steps.push(
    buildUpdateOrDeleteStep({
      id: "step_root",
      operation: rootOperation.operation,
      entityType: rootOperation.entityType,
      entityId: rootOperation.entityId,
      changes: rootOperation.changes,
      payload: rootOperation.payload,
      reason: rootOperation.reason || "Original user request",
    }),
  );
  return steps;
}

function buildAncestorReopenWorkflowSteps(
  rootOperation: PlanOperation,
  blockerCounts: Record<string, number>,
  rootSnapshot: Record<string, unknown> | null,
): DomainWorkflowStep[] {
  const needsClientReactivation = Number(blockerCounts.inactive_client_ancestor || 0) > 0;
  const needsDossierReopen = Number(blockerCounts.closed_dossier_ancestor || 0) > 0;
  const needsLawsuitReopen = Number(blockerCounts.closed_lawsuit_ancestor || 0) > 0;
  if (!needsClientReactivation && !needsDossierReopen && !needsLawsuitReopen) {
    return [];
  }

  const source = resolveOperationSource(rootOperation, rootSnapshot);
  let clientId = asEntityId(source.client_id ?? source.clientId);
  let dossierId = asEntityId(source.dossier_id ?? source.dossierId);
  let lawsuitId = asEntityId(source.lawsuit_id ?? source.lawsuitId);

  const parentType = normalizeStatus(source.parentType ?? source.parent_type).replace(/_/g, "");
  const parentEntityType = normalizeStatus(
    source.parentEntityType ?? source.parent_entity_type,
  ).replace(/_/g, "");
  const parentEntityId = asEntityId(source.parentEntityId ?? source.parent_entity_id);
  const linkedEntityType = normalizeStatus(source.entityType ?? source.entity_type).replace(/_/g, "");
  const linkedEntityId = asEntityId(source.entityId ?? source.entity_id);

  if (!dossierId && parentType === "dossier") {
    dossierId = asEntityId(source.parentId ?? source.parent_id) ?? linkedEntityId;
  }
  if (!lawsuitId && parentType === "lawsuit") {
    lawsuitId = asEntityId(source.parentId ?? source.parent_id) ?? linkedEntityId;
  }
  if (!dossierId && parentEntityType === "dossier") {
    dossierId = parentEntityId;
  }
  if (!lawsuitId && parentEntityType === "lawsuit") {
    lawsuitId = parentEntityId;
  }
  if (!dossierId && linkedEntityType === "dossier") {
    dossierId = linkedEntityId;
  }
  if (!lawsuitId && linkedEntityType === "lawsuit") {
    lawsuitId = linkedEntityId;
  }

  const rootId = asEntityId(rootOperation.entityId);
  if (!clientId && rootOperation.entityType === "client") {
    clientId = rootId;
  }
  if (!dossierId && rootOperation.entityType === "dossier") {
    dossierId = rootId;
  }
  if (!lawsuitId && rootOperation.entityType === "lawsuit") {
    lawsuitId = rootId;
  }

  const steps: DomainWorkflowStep[] = [];
  if (needsClientReactivation && clientId != null) {
    steps.push(
      buildUpdateOrDeleteStep({
        id: `reactivate_client_${String(clientId)}`,
        operation: "update",
        entityType: "client",
        entityId: clientId,
        changes: { status: "active" },
        reason: "Reactivate parent client before applying requested child mutation.",
      }),
    );
  }
  if (needsDossierReopen && dossierId != null) {
    steps.push(
      buildUpdateOrDeleteStep({
        id: `reopen_dossier_${String(dossierId)}`,
        operation: "update",
        entityType: "dossier",
        entityId: dossierId,
        changes: { status: "open" },
        reason: "Reopen parent dossier before applying requested child mutation.",
      }),
    );
  }
  if (needsLawsuitReopen && lawsuitId != null) {
    steps.push(
      buildUpdateOrDeleteStep({
        id: `reopen_lawsuit_${String(lawsuitId)}`,
        operation: "update",
        entityType: "lawsuit",
        entityId: lawsuitId,
        changes: { status: "open" },
        reason: "Reopen parent lawsuit before applying requested child mutation.",
      }),
    );
  }

  if (steps.length === 0) {
    return [];
  }

  steps.push(
    buildUpdateOrDeleteStep({
      id: "step_root",
      operation: rootOperation.operation,
      entityType: rootOperation.entityType,
      entityId: rootOperation.entityId,
      changes: rootOperation.changes,
      payload: rootOperation.payload,
      reason: rootOperation.reason || "Original user request",
    }),
  );
  return steps;
}

function resolveOperationSource(
  operation: PlanOperation,
  rootSnapshot: Record<string, unknown> | null,
): Record<string, unknown> {
  return {
    ...(isRecord(rootSnapshot) ? rootSnapshot : {}),
    ...(isRecord(operation.payload) ? operation.payload : {}),
    ...(isRecord(operation.changes) ? operation.changes : {}),
  };
}

function buildSingleEntityPreview(
  operation: PlanOperation,
  basePreview?: PlanPreview,
  rootLabel?: string,
  rootCurrentValues?: Record<string, unknown>,
): PlanPreview {
  return {
    ...(basePreview || {}),
    scope: "single_entity",
    root: {
      type: operation.entityType,
      id: operation.entityId != null ? Number(operation.entityId) || null : null,
      label: rootLabel,
      operation: operation.operation,
    },
    primaryChanges: buildPrimaryChanges(operation, operation.entityType, rootCurrentValues),
    reversibility: operation.operation === "delete" ? "not_reversible" : "reversible",
  };
}

function buildWorkflowPreview(params: {
  rootOperation: PlanOperation;
  steps: DomainWorkflowStep[];
  basePreview?: PlanPreview;
  notes: string[];
  blockerCounts: Record<string, number>;
  requiresUserDecision: boolean;
  decisionOptions?: DomainWorkflowDiagnostics["decisionOptions"];
  rootLabel?: string;
  rootCurrentValues?: Record<string, unknown>;
}): PlanPreview {
  const {
    rootOperation,
    steps,
    basePreview,
    notes,
    requiresUserDecision,
    decisionOptions,
    rootLabel,
    rootCurrentValues,
  } = params;
  const rootId = rootOperation.entityId != null ? Number(rootOperation.entityId) || null : null;
  const nonRootSteps = steps.filter((row) => row.id !== "step_root");
  const cascadeSummary = summarizeCascadeSteps(nonRootSteps);
  const effects = [...notes];
  if (requiresUserDecision) {
    effects.push("Execution is paused until an explicit domain decision is provided.");
  }
  return {
    ...(basePreview || {}),
    title:
      basePreview?.title ||
      `Confirm ${toTitle(rootOperation.operation)} ${labelEntity(rootOperation.entityType)}`.trim(),
    subtitle:
      basePreview?.subtitle ||
      (nonRootSteps.length > 0
        ? `${nonRootSteps.length + 1} planned steps`
        : "Single-step change"),
    scope: nonRootSteps.length > 0 ? "workflow" : "single_entity",
    root: {
      type: rootOperation.entityType,
      id: rootId,
      label: rootLabel,
      operation: rootOperation.operation,
    },
    primaryChanges: buildPrimaryChanges(rootOperation, rootOperation.entityType, rootCurrentValues),
    cascadeSummary,
    effects,
    reversibility: rootOperation.operation === "delete" ? "not_reversible" : "reversible",
    ...(decisionOptions ? { decisions: decisionOptions } : {}),
  };
}

function buildPrimaryChanges(
  operation: PlanOperation,
  defaultEntityType: string,
  rootCurrentValues?: Record<string, unknown>,
): PlanPreviewChange[] {
  if (!isRecord(operation.changes)) {
    return [];
  }
  const changes: PlanPreviewChange[] = [];
  for (const [field, value] of Object.entries(operation.changes)) {
    if (!field) continue;
    if (isRecord(value) && ("from" in value || "to" in value)) {
      const explicitFrom = Object.prototype.hasOwnProperty.call(value, "from")
        ? (value as Record<string, unknown>).from
        : undefined;
      changes.push({
        entityType: defaultEntityType,
        entityId: operation.entityId != null ? Number(operation.entityId) || null : null,
        field,
        from: explicitFrom === undefined ? rootCurrentValues?.[field] : explicitFrom,
        to: (value as Record<string, unknown>).to,
      });
      continue;
    }
    changes.push({
      entityType: defaultEntityType,
      entityId: operation.entityId != null ? Number(operation.entityId) || null : null,
      field,
      from: rootCurrentValues?.[field],
      to: value,
    });
  }
  return changes;
}

function summarizeCascadeSteps(steps: DomainWorkflowStep[]): PlanPreviewCascadeGroup[] {
  const grouped = new Map<string, DomainWorkflowStep[]>();
  for (const step of steps) {
    const key = String(step.entityType || "").trim().toLowerCase();
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(step);
  }

  const rows: PlanPreviewCascadeGroup[] = [];
  for (const [entityType, groupSteps] of grouped.entries()) {
    const changedFieldSet = new Set<string>();
    const examples: PlanPreviewChange[] = [];
    for (const step of groupSteps.slice(0, 3)) {
      if (isRecord(step.changes)) {
        for (const [field, value] of Object.entries(step.changes)) {
          changedFieldSet.add(field);
          const diff = isRecord(value) ? (value as Record<string, unknown>) : null;
          examples.push({
            entityType,
            entityId: step.entityId != null ? Number(step.entityId) || null : null,
            field,
            from: diff && "from" in diff ? diff.from : undefined,
            to: diff && "to" in diff ? diff.to : value,
          });
        }
      }
    }

    rows.push({
      entityType,
      totalCount: groupSteps.length,
      changedFields: [...changedFieldSet].slice(0, 8),
      examples: examples.slice(0, 6),
    });
  }
  return rows;
}

function buildUpdateOrDeleteStep(params: {
  id: string;
  operation: PlanOperation["operation"];
  entityType: string;
  entityId?: number | string;
  payload?: Record<string, unknown>;
  changes?: Record<string, unknown>;
  reason?: string;
  dependsOn?: string[];
}): DomainWorkflowStep {
  return {
    id: params.id,
    actionType:
      params.operation === "create"
        ? "CREATE_ENTITY"
        : params.operation === "delete"
        ? "DELETE_ENTITY"
        : "UPDATE_ENTITY",
    operation: params.operation,
    entityType: params.entityType,
    ...(params.entityId != null ? { entityId: params.entityId } : {}),
    ...(params.payload ? { payload: params.payload } : {}),
    ...(params.changes ? { changes: params.changes } : {}),
    ...(params.reason ? { reason: params.reason } : {}),
    ...(Array.isArray(params.dependsOn) && params.dependsOn.length > 0
      ? { dependsOn: params.dependsOn }
      : {}),
  };
}

function sequenceWithDependencies(steps: DomainWorkflowStep[]): DomainWorkflowStep[] {
  const normalized: DomainWorkflowStep[] = [];
  let previousId: string | undefined;
  let counter = 1;
  for (const raw of steps) {
    const nextId = raw.id || `step_${counter}`;
    counter += 1;
    normalized.push({
      ...raw,
      id: nextId,
      dependsOn:
        previousId && (!Array.isArray(raw.dependsOn) || raw.dependsOn.length === 0)
          ? [previousId]
          : raw.dependsOn,
    });
    previousId = nextId;
  }
  return normalized;
}

function statusRequested(operation: PlanOperation, expected: "inactive" | "closed"): boolean {
  if (!isRecord(operation.changes)) return false;
  const requestedStatus = canonicalizeTargetStatus(operation.entityType, operation.changes.status);
  return requestedStatus === expected;
}

function assertEntityId(operation: PlanOperation): number | string {
  if (operation.entityId == null) {
    throw new Error("Workflow planning requires entityId for this operation.");
  }
  return operation.entityId;
}

function asEntityId(value: unknown): number | string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number.parseInt(trimmed, 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return trimmed;
  }
  return null;
}

function looksLikeSettleReceivables(userMessage: string): boolean {
  const normalized = normalizeStatus(userMessage).replace(/_/g, " ");
  return (
    /mark .*invoice.*paid/.test(normalized) ||
    /mark .*financial .*paid/.test(normalized) ||
    /pay .*invoices?/.test(normalized) ||
    /settle .*invoices?/.test(normalized) ||
    /settle .*receivables?/.test(normalized)
  );
}

function looksLikeForceDelete(userMessage: string): boolean {
  const normalized = normalizeStatus(userMessage).replace(/_/g, " ");
  return (
    /force delete/.test(normalized) ||
    /cascade delete/.test(normalized) ||
    /delete all related/.test(normalized) ||
    /including related/.test(normalized)
  );
}

function describeOperation(operation: PlanOperation): string {
  const base = `${toTitle(operation.operation)} ${labelEntity(operation.entityType)}`;
  if (operation.entityId == null) return base;
  return `${base} ${String(operation.entityId)}`;
}

function labelEntity(value: string): string {
  return String(value || "")
    .trim()
    .replace(/_/g, " ");
}

function toTitle(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function resolveCurrentValuesFromSnapshot(
  changes: PlanOperation["changes"],
  snapshot: Record<string, unknown> | null,
): Record<string, unknown> | undefined {
  if (!snapshot || !isRecord(changes)) return undefined;
  const current: Record<string, unknown> = {};
  for (const field of Object.keys(changes)) {
    const value = readFieldValue(snapshot, field);
    if (value !== undefined) {
      current[field] = value;
    }
  }
  return Object.keys(current).length > 0 ? current : undefined;
}

function readFieldValue(
  row: Record<string, unknown>,
  field: string,
): unknown {
  const direct = row[field];
  if (direct !== undefined && direct !== null && direct !== "") return direct;

  const camel = snakeToCamel(field);
  const camelValue = row[camel];
  if (camelValue !== undefined && camelValue !== null && camelValue !== "") return camelValue;

  const snake = camelToSnake(field);
  const snakeValue = row[snake];
  if (snakeValue !== undefined && snakeValue !== null && snakeValue !== "") return snakeValue;

  return undefined;
}

function snakeToCamel(value: string): string {
  return String(value || "").replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function camelToSnake(value: string): string {
  return String(value || "").replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function resolveEntityDisplayLabel(
  entityType: string,
  entityId: number | string | undefined,
  snapshot: Record<string, unknown> | null,
): string | undefined {
  if (snapshot) {
    const preferred = [
      snapshot.name,
      snapshot.title,
      snapshot.reference,
      snapshot.lawsuit_number,
      snapshot.lawsuitNumber,
      snapshot.mission_number,
      snapshot.missionNumber,
      snapshot.code,
      snapshot.number,
      snapshot.email,
    ].find((value) => typeof value === "string" && String(value).trim().length > 0);
    if (typeof preferred === "string" && preferred.trim().length > 0) {
      return preferred.trim();
    }
  }
  if (entityId == null) return undefined;
  const numeric = Number(entityId);
  if (Number.isFinite(numeric) && numeric > 0) {
    return `${toTitle(labelEntity(entityType))} #${String(Math.floor(numeric))}`;
  }
  const text = String(entityId || "").trim();
  if (!text) return undefined;
  return `${toTitle(labelEntity(entityType))} ${text}`;
}

function applyLinkResolutionPreview(
  preview: PlanPreview,
  diagnostic?: LinkResolutionDiagnostic,
): void {
  if (!diagnostic || !preview) return;
  const linking = toLinkResolutionPreview(diagnostic);
  if (linking) {
    preview.linking = linking;
  }
  const message = toLinkResolutionPreviewMessage(diagnostic, linking);
  if (!message) return;
  const effects = Array.isArray(preview.effects) ? [...preview.effects] : [];
  effects.push(message);
  preview.effects = effects;
}

function toLinkResolutionPreview(
  diagnostic: LinkResolutionDiagnostic,
): PlanPreview["linking"] | null {
  const status = String(diagnostic.status || "").trim().toLowerCase();
  if (
    status !== "resolved" &&
    status !== "unchanged" &&
    status !== "ambiguous" &&
    status !== "unresolved"
  ) {
    return null;
  }

  const source =
    diagnostic.source && typeof diagnostic.source === "string" && diagnostic.source.trim().length > 0
      ? diagnostic.source.trim().toLowerCase()
      : undefined;
  const target = resolveLinkResolutionTarget(diagnostic);
  const userSpecified = status === "unchanged" && source === "payload";

  const linking: NonNullable<PlanPreview["linking"]> = {
    status,
    ...(source ? { source: source as NonNullable<PlanPreview["linking"]>["source"] } : {}),
    ...(target ? { target } : {}),
    userSpecified,
    resolutionLabel: describeLinkResolutionSource(status, source, userSpecified),
  };

  if (status === "ambiguous") {
    const candidates = Array.isArray(diagnostic.candidates)
      ? diagnostic.candidates
          .filter(
            (row) =>
              row &&
              typeof row.entityType === "string" &&
              row.entityType.trim().length > 0 &&
              (typeof row.entityId === "number" || typeof row.entityId === "string"),
          )
          .slice(0, 8)
      : [];
    if (candidates.length > 0) {
      linking.ambiguousCandidates = candidates;
    }
  }

  return linking;
}

function resolveLinkResolutionTarget(
  diagnostic: LinkResolutionDiagnostic,
): NonNullable<PlanPreview["linking"]>["target"] | undefined {
  const directType =
    typeof diagnostic.entityType === "string" && diagnostic.entityType.trim().length > 0
      ? diagnostic.entityType.trim().toLowerCase()
      : null;
  const hasDirectId = typeof diagnostic.entityId === "number" || typeof diagnostic.entityId === "string";
  const candidates = Array.isArray(diagnostic.candidates) ? diagnostic.candidates : [];

  const findCandidateLabel = (type: string, id: number | string): string | undefined => {
    const match = candidates.find(
      (row) =>
        row &&
        String(row.entityType || "").trim().toLowerCase() === type &&
        String(row.entityId) === String(id) &&
        typeof row.label === "string" &&
        row.label.trim().length > 0,
    );
    return match && typeof match.label === "string" ? match.label.trim() : undefined;
  };

  if (directType && hasDirectId) {
    const directId = diagnostic.entityId as number | string;
    const label = findCandidateLabel(directType, directId);
    return {
      entityType: directType,
      entityId: directId,
      ...(label ? { label } : {}),
      ...(typeof diagnostic.field === "string" && diagnostic.field.trim().length > 0
        ? { field: diagnostic.field.trim() }
        : {}),
    };
  }

  const firstCandidate = candidates.find(
    (row) =>
      row &&
      typeof row.entityType === "string" &&
      row.entityType.trim().length > 0 &&
      (typeof row.entityId === "number" || typeof row.entityId === "string"),
  );
  if (!firstCandidate) {
    return undefined;
  }
  return {
    entityType: String(firstCandidate.entityType || "").trim().toLowerCase(),
    entityId: firstCandidate.entityId,
    ...(typeof firstCandidate.label === "string" && firstCandidate.label.trim().length > 0
      ? { label: firstCandidate.label.trim() }
      : {}),
    ...(typeof diagnostic.field === "string" && diagnostic.field.trim().length > 0
      ? { field: diagnostic.field.trim() }
      : {}),
  };
}

function describeLinkResolutionSource(
  status: string,
  source: string | undefined,
  userSpecified: boolean,
): string {
  if (userSpecified) {
    return "User-specified parent link";
  }
  if (status === "resolved") {
    if (source === "draft_context") {
      return "Auto-resolved from current draft context";
    }
    if (source === "active_entities") {
      return "Auto-resolved from active session context";
    }
    if (source === "payload") {
      return "Auto-resolved from request payload";
    }
    return "Auto-resolved parent link";
  }
  if (status === "ambiguous") {
    return "Needs parent link clarification";
  }
  if (status === "unresolved") {
    return "Missing parent link context";
  }
  return "Parent link preserved";
}

function formatLinkingTargetLabel(
  target?: NonNullable<PlanPreview["linking"]>["target"],
): string | null {
  if (!target) return null;
  const entityType = String(target.entityType || "").trim().toLowerCase();
  const entityLabel = entityType ? toTitle(entityType.replace(/_/g, " ")) : "Record";
  const reference =
    typeof target.label === "string" && target.label.trim().length > 0
      ? target.label.trim()
      : `${entityLabel} #${String(target.entityId)}`;
  return `${entityLabel}: ${reference}`;
}

function toLinkResolutionPreviewMessage(
  diagnostic: LinkResolutionDiagnostic,
  linking?: PlanPreview["linking"] | null,
): string | null {
  if (typeof diagnostic.message === "string" && diagnostic.message.trim().length > 0) {
    const base = diagnostic.message.trim();
    const targetLabel = formatLinkingTargetLabel(linking?.target);
    if (!targetLabel || base.toLowerCase().includes(targetLabel.toLowerCase())) {
      return base;
    }
    return `${base} Target: ${targetLabel}.`;
  }
  if (diagnostic.status === "resolved") {
    const targetLabel = formatLinkingTargetLabel(linking?.target);
    return targetLabel
      ? `Resolved parent link automatically: ${targetLabel}.`
      : "Resolved parent link automatically.";
  }
  if (diagnostic.status === "unchanged" && diagnostic.source === "payload") {
    const targetLabel = formatLinkingTargetLabel(linking?.target);
    return targetLabel
      ? `Parent link comes from your request: ${targetLabel}.`
      : "Parent link comes from the provided payload.";
  }
  if (diagnostic.status === "ambiguous") {
    const candidates = Array.isArray(linking?.ambiguousCandidates) ? linking?.ambiguousCandidates : [];
    if (candidates.length > 0) {
      const labels = candidates
        .slice(0, 4)
        .map((row) => {
          const type = toTitle(String(row.entityType || "").trim().replace(/_/g, " "));
          const label =
            typeof row.label === "string" && row.label.trim().length > 0
              ? row.label.trim()
              : `${type} #${String(row.entityId)}`;
          return `${type}: ${label}`;
        });
      return `Parent link requires clarification. Candidates: ${labels.join(" | ")}.`;
    }
    return "Parent link requires clarification because multiple candidates are available.";
  }
  if (diagnostic.status === "unresolved") {
    return "Parent link could not be resolved from current context.";
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
