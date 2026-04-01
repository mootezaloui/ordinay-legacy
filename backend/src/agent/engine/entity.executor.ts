import type {
  DraftArtifact,
  DomainWorkflowStep,
  DomainWorkflowStepResult,
  PendingActionPlan,
  PlanOperation,
} from "../types";
import { DomainRuleProfile } from "../domain";

declare const require: (id: string) => unknown;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const _path = require("path") as { resolve: (...args: string[]) => string; join: (...args: string[]) => string };
const _fs = require("fs") as { existsSync: (filePath: string) => boolean };
const _crypto = require("crypto") as { createHash: (algorithm: string) => { update: (value: string) => { digest: (encoding: "hex") => string } } };

interface EntityService {
  create?: (payload: Record<string, unknown>) => unknown | Promise<unknown>;
  update?: (id: number | string, payload: Record<string, unknown>) => unknown | Promise<unknown>;
  remove?: (id: number | string) => unknown | Promise<unknown>;
}

interface DocumentStorageModule {
  ensureDocumentsRoot: () => string;
}

interface DocumentRendererModule {
  renderDocument: (params: {
    documentType: string;
    language: string;
    schemaVersion: string;
    contentJson: Record<string, unknown>;
    format: string;
    outputPath: string;
  }) => Promise<{
    file_path: string;
    size_bytes: number;
    mime_type: string;
  }>;
}

interface DatabaseLike {
  prepare: (sql: string) => {
    get?: (params?: Record<string, unknown>) => Record<string, unknown> | undefined;
    run?: (params?: Record<string, unknown>) => unknown;
  };
}

interface DraftDocumentProvenance {
  sessionId?: string;
  sourceTurnId?: string;
  draftVersion?: number;
}

interface PreparedDocumentPayload {
  payload: Record<string, unknown>;
  provenance?: DraftDocumentProvenance;
}

interface DocumentPrepareFailure {
  ok: false;
  failure: EntityExecutionResult;
}

interface DocumentPrepareSuccess {
  ok: true;
  payload: Record<string, unknown>;
  provenance?: DraftDocumentProvenance;
}

type DocumentPrepareResult = DocumentPrepareFailure | DocumentPrepareSuccess;

interface ParentLinkRef {
  entityType: string;
  field: string;
  entityId: number | string;
}

export interface EntityExecutionContext {
  sessionId?: string;
  sourceTurnId?: string;
}

export interface EntityExecutionResult {
  ok: boolean;
  result?: Record<string, unknown>;
  stepResults?: DomainWorkflowStepResult[];
  failedStepId?: string;
  errorCode?: string;
  errorMessage?: string;
  errorDetails?: Record<string, unknown>;
}

const SERVICE_BY_ENTITY: Record<string, string> = {
  client: "clients.service",
  dossier: "dossiers.service",
  lawsuit: "lawsuits.service",
  task: "tasks.service",
  personal_task: "personalTasks.service",
  mission: "missions.service",
  session: "sessions.service",
  document: "documents.service",
  officer: "officers.service",
  notification: "notifications.service",
  financial_entry: "financial.service",
  history_event: "history.service",
};

const ENTITY_ALIASES: Record<string, string> = {
  clients: "client",
  dossiers: "dossier",
  lawsuits: "lawsuit",
  tasks: "task",
  personaltask: "personal_task",
  personaltasks: "personal_task",
  personal_tasks: "personal_task",
  missions: "mission",
  sessions: "session",
  documents: "document",
  officers: "officer",
  notifications: "notification",
  financialentry: "financial_entry",
  financialentries: "financial_entry",
  financial_entries: "financial_entry",
  historyevent: "history_event",
  historyevents: "history_event",
  history_events: "history_event",
};

const DOCUMENT_DRAFT_SOURCE_TOKEN = "__agent_current_draft__";
const DOCUMENT_DRAFT_SNAPSHOT_KEY = "_agentDraftSnapshot";
const DOCUMENT_DRAFT_PROVENANCE_KEY = "_agentDraftProvenance";
const DOCUMENT_STORAGE_SOURCE_KEYS = [
  "generation_uid",
  "generationUid",
  "generation_id",
  "generationId",
  "source_generation_uid",
  "sourceGenerationUid",
  "document_generation_uid",
  "documentGenerationUid",
  "preview_uid",
  "previewUid",
  "document_preview_uid",
  "documentPreviewUid",
] as const;
const DOCUMENT_PARENT_FIELD_ALIASES: Array<[string, string]> = [
  ["client_id", "clientId"],
  ["dossier_id", "dossierId"],
  ["lawsuit_id", "lawsuitId"],
  ["mission_id", "missionId"],
  ["task_id", "taskId"],
  ["session_id", "sessionId"],
  ["personal_task_id", "personalTaskId"],
  ["financial_entry_id", "financialEntryId"],
  ["officer_id", "officerId"],
];
const CASE_PARENT_ENTITY_TYPES = new Set(["dossier", "lawsuit"]);

export class EntityExecutor {
  private readonly serviceCache = new Map<string, EntityService | null>();
  private readonly rules = new DomainRuleProfile();
  private storageModule: DocumentStorageModule | null | undefined;
  private rendererModule: DocumentRendererModule | null | undefined;
  private dbModule: DatabaseLike | null | undefined;

  async execute(
    plan: PendingActionPlan,
    context?: EntityExecutionContext,
  ): Promise<EntityExecutionResult> {
    const rootOperation = normalizePlanOperation(plan?.rootOperation || plan);
    if (!rootOperation) {
      return {
        ok: false,
        errorCode: "INVALID_PLAN_OPERATION",
        errorMessage: "Pending plan operation payload is invalid.",
      };
    }

    const workflowSteps = Array.isArray(plan?.workflowSteps) ? plan.workflowSteps : [];
    if (workflowSteps.length > 0) {
      return this.executeWorkflow(rootOperation, workflowSteps, context);
    }

    return this.executeSingleOperationWithValidation(rootOperation, context);
  }

  private async executeWorkflow(
    rootOperation: PlanOperation,
    steps: DomainWorkflowStep[],
    context?: EntityExecutionContext,
  ): Promise<EntityExecutionResult> {
    const stepResults: DomainWorkflowStepResult[] = [];
    const completed = new Set<string>();

    for (const step of steps) {
      const stepId = String(step.id || "").trim() || `step_${stepResults.length + 1}`;
      const dependencies = Array.isArray(step.dependsOn) ? step.dependsOn : [];
      const missingDependency = dependencies.find((dep) => !completed.has(String(dep)));
      if (missingDependency) {
        return {
          ok: false,
          errorCode: "WORKFLOW_DEPENDENCY_NOT_MET",
          errorMessage: `Workflow dependency "${missingDependency}" is not satisfied.`,
          stepResults,
          failedStepId: stepId,
          errorDetails: {
            category: "workflow",
            reason: "dependency_not_met",
            stepId,
            missingDependency,
            hint: "Retry after rebuilding the plan so dependent steps are ordered correctly.",
          },
        };
      }

      const operation = toOperationFromStep(step);
      const validation = await this.rules.validateOperation(operation);
      if (!validation.allowed) {
        const errorMessage =
          validation.notes[0] ||
          "Domain rules prevent this workflow step from executing.";
        stepResults.push({
          stepId,
          actionType: step.actionType,
          operation: operation.operation,
          entityType: operation.entityType,
          ...(operation.entityId != null ? { entityId: operation.entityId } : {}),
          ok: false,
          errorCode: "DOMAIN_RULE_BLOCKED",
          errorMessage,
        });
        return {
          ok: false,
          errorCode: "DOMAIN_RULE_BLOCKED",
          errorMessage,
          stepResults,
          failedStepId: stepId,
          errorDetails: {
            category: "domain_rule",
            reason: "rule_blocked",
            stepId,
            hint: "Adjust the requested changes to satisfy domain constraints, then confirm again.",
          },
        };
      }

      const execution = await this.executeSingleOperation(operation, context);
      if (!execution.ok) {
        stepResults.push({
          stepId,
          actionType: step.actionType,
          operation: operation.operation,
          entityType: operation.entityType,
          ...(operation.entityId != null ? { entityId: operation.entityId } : {}),
          ok: false,
          errorCode: execution.errorCode,
          errorMessage: execution.errorMessage,
        });
        return {
          ok: false,
          errorCode: execution.errorCode || "ENTITY_EXECUTION_ERROR",
          errorMessage: execution.errorMessage || "Workflow step execution failed.",
          stepResults,
          failedStepId: stepId,
          ...(isRecord(execution.errorDetails)
            ? { errorDetails: execution.errorDetails }
            : {}),
        };
      }

      stepResults.push({
        stepId,
        actionType: step.actionType,
        operation: operation.operation,
        entityType: operation.entityType,
        ...(operation.entityId != null ? { entityId: operation.entityId } : {}),
        ok: true,
        result: execution.result,
      });
      completed.add(stepId);
    }

    const lastSuccessful =
      stepResults.length > 0
        ? stepResults[stepResults.length - 1]
        : null;

    return {
      ok: true,
      result: {
        operation: rootOperation.operation,
        entityType: rootOperation.entityType,
        ...(rootOperation.entityId != null ? { entityId: rootOperation.entityId } : {}),
        ...(lastSuccessful?.result ? lastSuccessful.result : {}),
      },
      stepResults,
    };
  }

  private async executeSingleOperationWithValidation(
    operation: PlanOperation,
    context?: EntityExecutionContext,
  ): Promise<EntityExecutionResult> {
    const validation = await this.rules.validateOperation(operation);
    if (!validation.allowed) {
      return {
        ok: false,
        errorCode: "DOMAIN_RULE_BLOCKED",
        errorMessage:
          validation.notes[0] ||
          "Domain rules prevent this operation from executing.",
        errorDetails: {
          category: "domain_rule",
          reason: "rule_blocked",
          hint: "Revise the requested change to satisfy domain constraints, then confirm again.",
        },
      };
    }
    return this.executeSingleOperation(operation, context);
  }

  private async executeSingleOperation(
    operation: PlanOperation,
    context?: EntityExecutionContext,
  ): Promise<EntityExecutionResult> {
    const entityType = canonicalEntityType(operation.entityType);
    if (!entityType) {
      return {
        ok: false,
        errorCode: "UNSUPPORTED_ENTITY_TYPE",
        errorMessage: `Unsupported entity type "${String(operation.entityType)}".`,
      };
    }

    const service = this.getService(entityType);
    if (!service) {
      return {
        ok: false,
        errorCode: "ENTITY_SERVICE_UNAVAILABLE",
        errorMessage: `Entity service for "${entityType}" is unavailable.`,
      };
    }

    try {
      if (operation.operation === "create") {
        const payload = isRecord(operation.payload) ? { ...operation.payload } : null;
        if (!payload) {
          return {
            ok: false,
            errorCode: "INVALID_CREATE_PAYLOAD",
            errorMessage: "Create operation requires a payload object.",
          };
        }
        const preparedDocument =
          entityType === "document"
            ? await this.prepareDocumentCreatePayload(payload, context)
            : null;
        if (entityType === "document" && preparedDocument && !preparedDocument.ok) {
          return preparedDocument.failure;
        }
        const createPayload =
          entityType === "document" && preparedDocument?.ok === true
            ? preparedDocument.payload
            : payload;
        const preflightFailure = await this.preflightCreateOperation(entityType, createPayload);
        if (preflightFailure) {
          return preflightFailure;
        }
        if (typeof service.create !== "function") {
          return unsupportedOperation(entityType, operation.operation);
        }
        const created = await Promise.resolve(service.create(createPayload));
        const entityId = extractEntityId(created);
        if (
          entityType === "document" &&
          entityId != null &&
          preparedDocument?.ok === true &&
          preparedDocument.provenance
        ) {
          this.persistDocumentDraftProvenance(entityId, preparedDocument.provenance);
        }
        return {
          ok: true,
          result: {
            operation: "create",
            entityType,
            ...(entityId != null ? { entityId } : {}),
            ...(entityType === "document" && preparedDocument?.ok === true && preparedDocument.provenance
              ? { draftProvenance: preparedDocument.provenance }
              : {}),
            ...(isRecord(created) ? { entity: created } : { value: created }),
          },
        };
      }

      if (operation.operation === "update") {
        const entityId = coerceEntityId(operation.entityId);
        if (entityId == null) {
          return {
            ok: false,
            errorCode: "INVALID_ENTITY_ID",
            errorMessage: "Update operation requires a valid entityId.",
          };
        }
        const changes = isRecord(operation.changes)
          ? operation.changes
          : isRecord(operation.payload)
          ? operation.payload
          : null;
        if (!changes || Object.keys(changes).length === 0) {
          return {
            ok: false,
            errorCode: "INVALID_UPDATE_CHANGES",
            errorMessage: "Update operation requires a non-empty changes object.",
          };
        }
        if (typeof service.update !== "function") {
          return unsupportedOperation(entityType, operation.operation);
        }
        const updated = await Promise.resolve(service.update(entityId, changes));
        if (updated == null) {
          return {
            ok: false,
            errorCode: "ENTITY_NOT_FOUND",
            errorMessage: `${entityType} ${String(entityId)} was not found for update.`,
          };
        }
        const resolvedId = extractEntityId(updated) ?? entityId;
        return {
          ok: true,
          result: {
            operation: "update",
            entityType,
            entityId: resolvedId,
            ...(isRecord(updated) ? { entity: updated } : { value: updated }),
          },
        };
      }

      if (operation.operation === "delete") {
        const entityId = coerceEntityId(operation.entityId);
        if (entityId == null) {
          return {
            ok: false,
            errorCode: "INVALID_ENTITY_ID",
            errorMessage: "Delete operation requires a valid entityId.",
          };
        }
        if (typeof service.remove !== "function") {
          return unsupportedOperation(entityType, operation.operation);
        }
        const removed = await Promise.resolve(service.remove(entityId));
        const deleted = normalizeDeleteOutcome(removed);
        if (!deleted) {
          return {
            ok: false,
            errorCode: "ENTITY_NOT_FOUND",
            errorMessage: `${entityType} ${String(entityId)} was not found for deletion.`,
          };
        }
        return {
          ok: true,
          result: {
            operation: "delete",
            entityType,
            entityId,
            deleted: true,
          },
        };
      }

      return {
        ok: false,
        errorCode: "UNSUPPORTED_OPERATION",
        errorMessage: `Unsupported operation "${operation.operation}".`,
      };
    } catch (error) {
      return normalizeExecutionError(error);
    }
  }

  private async preflightCreateOperation(
    entityType: string,
    payload: Record<string, unknown>,
  ): Promise<EntityExecutionResult | null> {
    const normalizedPayload = { ...payload };
    this.normalizeParentAliasFields(normalizedPayload);

    const parentLinks = this.collectParentLinks(normalizedPayload);
    if (entityType === "task" || entityType === "session" || entityType === "mission") {
      const caseScopeLinks = parentLinks.filter((row) =>
        CASE_PARENT_ENTITY_TYPES.has(row.entityType),
      );
      if (caseScopeLinks.length === 0) {
        return this.createPreflightFailure(
          "EXEC_PRECONDITION_LINK_MISSING",
          `Cannot create ${entityType} without a linked dossier or lawsuit.`,
          {
            category: "link",
            reason: "case_scope_missing",
            entityType,
            hint: "Select the dossier or lawsuit where this item belongs, then confirm again.",
          },
        );
      }
      if (caseScopeLinks.length > 1) {
        return this.createPreflightFailure(
          "EXEC_PRECONDITION_LINK_CONFLICT",
          `Cannot create ${entityType} with both dossier and lawsuit links at the same time.`,
          {
            category: "link",
            reason: "case_scope_conflict",
            entityType,
            hint: "Keep exactly one parent link (either dossier or lawsuit) and confirm again.",
          },
        );
      }
    }

    if (entityType === "document") {
      if (parentLinks.length !== 1) {
        return this.createPreflightFailure(
          "EXEC_PRECONDITION_LINK_CONFLICT",
          "Cannot create document without exactly one linked parent entity.",
          {
            category: "link",
            reason: "document_parent_invalid",
            entityType,
            hint:
              "Link this document to exactly one parent (client, dossier, lawsuit, mission, task, session, personal task, financial entry, or officer).",
          },
        );
      }
      const filePath = asNonEmptyString(normalizedPayload.file_path);
      if (!filePath) {
        return this.createPreflightFailure(
          "EXEC_PRECONDITION_STORAGE_SOURCE_MISSING",
          "Cannot create document without a resolved file path.",
          {
            category: "storage",
            reason: "file_path_missing",
            entityType,
            hint:
              "Regenerate or reattach the draft so the system can persist the document file before creation.",
          },
        );
      }
      if (!_fs.existsSync(filePath)) {
        return this.createPreflightFailure(
          "EXEC_PRECONDITION_STORAGE_PATH_MISSING",
          "Cannot create document because the prepared file path does not exist.",
          {
            category: "storage",
            reason: "file_path_not_found",
            entityType,
            filePath,
            hint:
              "Regenerate the document content and try again so a valid file is created.",
          },
        );
      }
    }

    for (const link of parentLinks) {
      const exists = await this.parentEntityExists(link.entityType, link.entityId);
      if (!exists) {
        return this.createPreflightFailure(
          "EXEC_PRECONDITION_LINK_NOT_FOUND",
          `Cannot create ${entityType} because linked ${link.entityType} ${String(
            link.entityId,
          )} no longer exists.`,
          {
            category: "link",
            reason: "parent_not_found",
            entityType,
            field: link.field,
            parentEntityType: link.entityType,
            parentEntityId: link.entityId,
            hint:
              `Choose an existing ${link.entityType} and confirm again.`,
          },
        );
      }
    }

    return null;
  }

  private normalizeParentAliasFields(payload: Record<string, unknown>): void {
    for (const [snake, camel] of DOCUMENT_PARENT_FIELD_ALIASES) {
      if (payload[snake] != null) {
        continue;
      }
      if (payload[camel] != null) {
        payload[snake] = payload[camel];
      }
    }
  }

  private collectParentLinks(payload: Record<string, unknown>): ParentLinkRef[] {
    const links: ParentLinkRef[] = [];
    for (const [snake] of DOCUMENT_PARENT_FIELD_ALIASES) {
      const entityType = parentEntityTypeFromField(snake);
      if (!entityType) {
        continue;
      }
      const entityId = coerceEntityId(payload[snake]);
      if (entityId == null) {
        continue;
      }
      links.push({
        entityType,
        field: snake,
        entityId,
      });
    }
    return links;
  }

  private async parentEntityExists(
    entityType: string,
    entityId: number | string,
  ): Promise<boolean> {
    const service = this.getService(entityType) as
      | (EntityService & { get?: (id: number | string) => unknown | Promise<unknown> })
      | null;
    if (!service || typeof service.get !== "function") {
      return true;
    }
    try {
      const row = await Promise.resolve(service.get(entityId));
      return row != null;
    } catch {
      return false;
    }
  }

  private createPreflightFailure(
    errorCode: string,
    errorMessage: string,
    errorDetails?: Record<string, unknown>,
  ): EntityExecutionResult {
    return {
      ok: false,
      errorCode,
      errorMessage,
      ...(isRecord(errorDetails) ? { errorDetails } : {}),
    };
  }

  private async prepareDocumentCreatePayload(
    rawPayload: Record<string, unknown>,
    context?: EntityExecutionContext,
  ): Promise<DocumentPrepareResult> {
    const payload = { ...rawPayload };
    this.normalizeDocumentAliasFields(payload);

    const filePath = asNonEmptyString(payload.file_path);
    const generationToken = this.resolveDocumentStorageToken(payload);
    const draftSnapshot = this.readDraftSnapshot(payload);
    const payloadProvenance = this.readDraftProvenance(payload);
    const baseProvenance: DraftDocumentProvenance = {
      ...(payloadProvenance ? payloadProvenance : {}),
      ...(context?.sessionId ? { sessionId: context.sessionId } : {}),
      ...(context?.sourceTurnId ? { sourceTurnId: context.sourceTurnId } : {}),
      ...(draftSnapshot && Number.isFinite(draftSnapshot.version)
        ? { draftVersion: Number(draftSnapshot.version) }
        : {}),
    };

    if (!filePath) {
      if (!generationToken) {
        return {
          ok: false,
          failure: this.createPreflightFailure(
            "EXEC_PRECONDITION_STORAGE_SOURCE_MISSING",
            "Cannot create document without a storage source (file path or supported generation token).",
            {
              category: "storage",
              reason: "storage_source_missing",
              entityType: "document",
              hint:
                "Regenerate the draft or attach a file so the document can be persisted before confirmation.",
            },
          ),
        };
      } else if (generationToken !== DOCUMENT_DRAFT_SOURCE_TOKEN) {
        return {
          ok: false,
          failure: this.createPreflightFailure(
            "EXEC_PRECONDITION_STORAGE_TOKEN_UNSUPPORTED",
            `Cannot create document from unsupported generation token "${generationToken}".`,
            {
              category: "storage",
              reason: "unsupported_generation_token",
              entityType: "document",
              token: generationToken,
              hint:
                "Use the current draft save flow or provide a concrete file path before confirming.",
            },
          ),
        };
      } else {
        if (!draftSnapshot) {
          return {
            ok: false,
            failure: this.createPreflightFailure(
              "EXEC_PRECONDITION_DRAFT_SNAPSHOT_MISSING",
              "Cannot create document because the draft snapshot is missing.",
              {
                category: "storage",
                reason: "draft_snapshot_missing",
                entityType: "document",
                hint:
                  "Regenerate or reopen the draft in this conversation, then confirm again.",
              },
            ),
          };
        }

        let rendered:
          | {
              file_path: string;
              size_bytes: number;
              mime_type: string;
              original_filename: string;
            }
          | null = null;
        try {
          rendered = await this.renderDraftSnapshot(draftSnapshot);
        } catch (error) {
          const detail =
            error instanceof Error && error.message.trim().length > 0
              ? error.message.trim()
              : "unknown render failure";
          return {
            ok: false,
            failure: this.createPreflightFailure(
              "EXEC_PRECONDITION_STORAGE_RENDER_FAILED",
              "Cannot create document because draft rendering failed.",
              {
                category: "storage",
                reason: "draft_render_failed",
                entityType: "document",
                detail,
                hint:
                  "Try regenerating the draft and confirm again. If this persists, check rendering service availability.",
              },
            ),
          };
        }
        if (!rendered) {
          return {
            ok: false,
            failure: this.createPreflightFailure(
              "EXEC_PRECONDITION_STORAGE_RENDER_FAILED",
              "Cannot create document because draft rendering returned no output.",
              {
                category: "storage",
                reason: "draft_render_empty",
                entityType: "document",
                hint:
                  "Regenerate the draft and retry confirmation.",
              },
            ),
          };
        }
        payload.file_path = rendered.file_path;
        if (!asNonEmptyString(payload.original_filename)) {
          payload.original_filename = rendered.original_filename;
        }
        if (!asNonEmptyString(payload.mime_type) && rendered.mime_type) {
          payload.mime_type = rendered.mime_type;
        }
        if (
          (typeof payload.size_bytes !== "number" || !Number.isFinite(payload.size_bytes)) &&
          Number.isFinite(rendered.size_bytes)
        ) {
          payload.size_bytes = rendered.size_bytes;
        }
        if (!asNonEmptyString(payload.copy_type)) {
          payload.copy_type = "generated";
        }
        if (!asNonEmptyString(payload.title) && asNonEmptyString(draftSnapshot.title)) {
          payload.title = String(draftSnapshot.title).trim();
        }
      }
    }

    this.stripDocumentBridgeFields(payload);
    this.normalizeDocumentAliasFields(payload);

    const parentCount = countDocumentParentLinks(payload);
    if (parentCount !== 1) {
      return {
        ok: false,
        failure: this.createPreflightFailure(
          "EXEC_PRECONDITION_LINK_CONFLICT",
          "Cannot create document without exactly one linked parent entity.",
          {
            category: "link",
            reason: "document_parent_invalid",
            entityType: "document",
            hint:
              "Keep exactly one parent link (client, dossier, lawsuit, mission, task, session, personal task, financial entry, or officer).",
          },
        ),
      };
    }
    if (!asNonEmptyString(payload.file_path)) {
      return {
        ok: false,
        failure: this.createPreflightFailure(
          "EXEC_PRECONDITION_STORAGE_SOURCE_MISSING",
          "Cannot create document without a resolved file path.",
          {
            category: "storage",
            reason: "file_path_missing",
            entityType: "document",
            hint:
              "Regenerate or attach the document content so a file path is available.",
          },
        ),
      };
    }
    if (!asNonEmptyString(payload.title) && draftSnapshot && asNonEmptyString(draftSnapshot.title)) {
      payload.title = String(draftSnapshot.title).trim();
    }
    if (!asNonEmptyString(payload.title)) {
      return {
        ok: false,
        failure: this.createPreflightFailure(
          "EXEC_PRECONDITION_PAYLOAD_INVALID",
          "Cannot create document without a title.",
          {
            category: "validation",
            reason: "title_missing",
            entityType: "document",
            hint:
              "Provide a document title in the request and confirm again.",
          },
        ),
      };
    }

    return {
      ok: true,
      payload,
      provenance: Object.keys(baseProvenance).length > 0 ? baseProvenance : undefined,
    };
  }

  private normalizeDocumentAliasFields(payload: Record<string, unknown>): void {
    if (!isRecord(payload)) {
      return;
    }

    if (!asNonEmptyString(payload.file_path) && asNonEmptyString(payload.filePath)) {
      payload.file_path = String(payload.filePath).trim();
    }
    for (const [snake, camel] of DOCUMENT_PARENT_FIELD_ALIASES) {
      if (payload[snake] != null) {
        continue;
      }
      if (payload[camel] != null) {
        payload[snake] = payload[camel];
      }
    }
  }

  private stripDocumentBridgeFields(payload: Record<string, unknown>): void {
    delete payload[DOCUMENT_DRAFT_SNAPSHOT_KEY];
    delete payload[DOCUMENT_DRAFT_PROVENANCE_KEY];
    for (const key of DOCUMENT_STORAGE_SOURCE_KEYS) {
      if (key === "generation_uid" || key === "generationUid") {
        delete payload[key];
        continue;
      }
      delete payload[key];
    }
  }

  private resolveDocumentStorageToken(payload: Record<string, unknown>): string | null {
    for (const key of DOCUMENT_STORAGE_SOURCE_KEYS) {
      const value = payload[key];
      if (!asNonEmptyString(value)) {
        continue;
      }
      return String(value).trim();
    }
    return null;
  }

  private readDraftSnapshot(payload: Record<string, unknown>): DraftArtifact | null {
    const raw = payload[DOCUMENT_DRAFT_SNAPSHOT_KEY];
    if (!isRecord(raw)) {
      return null;
    }

    const draftType = asNonEmptyString(raw.draftType);
    const title = asNonEmptyString(raw.title);
    if (!draftType || !title) {
      return null;
    }

    const sections = Array.isArray(raw.sections)
      ? raw.sections
          .filter((row) => isRecord(row))
          .map((row, index) => {
            const section: { id: string; role: string; label?: string; text?: string } = {
              id: asNonEmptyString(row.id) || `sec_${index + 1}`,
              role: asNonEmptyString(row.role) || "body",
            };
            if (asNonEmptyString(row.label)) {
              section.label = String(row.label).trim();
            }
            if (asNonEmptyString(row.text)) {
              section.text = String(row.text).trim();
            }
            return section;
          })
      : [];
    const layout = isRecord(raw.layout) ? raw.layout : null;
    const directionRaw = asNonEmptyString(layout?.direction);
    const direction = directionRaw === "rtl" ? "rtl" : "ltr";
    const language = asNonEmptyString(layout?.language) || "en";
    const formalityRaw = asNonEmptyString(layout?.formality);
    const formality =
      formalityRaw === "formal" || formalityRaw === "standard" || formalityRaw === "casual"
        ? formalityRaw
        : "formal";
    const documentClass = asNonEmptyString(layout?.documentClass) || draftType;
    const linkedEntityType = asNonEmptyString(raw.linkedEntityType) || undefined;
    const linkedEntityId = coerceEntityId(raw.linkedEntityId);
    const generatedAt = asNonEmptyString(raw.generatedAt) || new Date().toISOString();
    const versionValue =
      typeof raw.version === "number" && Number.isFinite(raw.version)
        ? Math.floor(raw.version)
        : Number.parseInt(String(raw.version || ""), 10);
    const version = Number.isFinite(versionValue) && versionValue > 0 ? versionValue : 1;
    const subtitle = asNonEmptyString(raw.subtitle) || undefined;
    const content = asNonEmptyString(raw.content) || this.renderDraftSnapshotText(sections);

    const metadata = isRecord(raw.metadata)
      ? Object.fromEntries(
          Object.entries(raw.metadata)
            .filter(([, value]) => asNonEmptyString(value))
            .map(([key, value]) => [String(key), String(value).trim()]),
        )
      : undefined;

    return {
      draftType,
      title,
      subtitle,
      metadata,
      sections,
      layout: {
        direction,
        language,
        formality,
        documentClass,
      },
      content,
      linkedEntityType,
      ...(typeof linkedEntityId === "number" ? { linkedEntityId } : {}),
      generatedAt,
      version,
    };
  }

  private readDraftProvenance(payload: Record<string, unknown>): DraftDocumentProvenance | null {
    const row = payload[DOCUMENT_DRAFT_PROVENANCE_KEY];
    if (!isRecord(row)) {
      return null;
    }
    const sessionId = asNonEmptyString(row.sessionId) || undefined;
    const sourceTurnId = asNonEmptyString(row.sourceTurnId) || undefined;
    const versionRaw =
      typeof row.draftVersion === "number" && Number.isFinite(row.draftVersion)
        ? Math.floor(row.draftVersion)
        : Number.parseInt(String(row.draftVersion || ""), 10);
    const draftVersion = Number.isFinite(versionRaw) && versionRaw > 0 ? versionRaw : undefined;
    const normalized: DraftDocumentProvenance = {
      ...(sessionId ? { sessionId } : {}),
      ...(sourceTurnId ? { sourceTurnId } : {}),
      ...(draftVersion != null ? { draftVersion } : {}),
    };
    return Object.keys(normalized).length > 0 ? normalized : null;
  }

  private async renderDraftSnapshot(
    draft: DraftArtifact,
  ): Promise<{
    file_path: string;
    size_bytes: number;
    mime_type: string;
    original_filename: string;
  }> {
    const storage = this.getDocumentStorageModule();
    const renderer = this.getDocumentRendererModule();
    if (!storage || !renderer) {
      throw new Error("Document rendering/storage module unavailable.");
    }

    const documentsRoot = storage.ensureDocumentsRoot();
    const daySegment = new Date().toISOString().slice(0, 10);
    const fileHash = _crypto
      .createHash("sha256")
      .update(`${draft.title}|${draft.version}|${draft.generatedAt}`)
      .digest("hex")
      .slice(0, 12);
    const outputPath = _path.join(
      documentsRoot,
      "generated",
      daySegment,
      `agent_draft_${Date.now()}_${fileHash}.pdf`,
    );

    const markdown = this.renderDraftMarkdown(draft);
    const rendered = await renderer.renderDocument({
      documentType: draft.layout.documentClass || draft.draftType || "document",
      language: draft.layout.language || "en",
      schemaVersion: "v2",
      contentJson: {
        content: {
          title: draft.title,
          markdown,
        },
      },
      format: "pdf",
      outputPath,
    });

    return {
      file_path: rendered.file_path,
      size_bytes: Number.isFinite(rendered.size_bytes) ? rendered.size_bytes : 0,
      mime_type: asNonEmptyString(rendered.mime_type) || "application/pdf",
      original_filename: `${this.slugifyFileName(draft.title || "draft-document")}.pdf`,
    };
  }

  private renderDraftMarkdown(draft: DraftArtifact): string {
    const title = asNonEmptyString(draft.title) || "Generated document";
    const lines: string[] = [`# ${title}`];
    if (asNonEmptyString(draft.subtitle)) {
      lines.push("", String(draft.subtitle).trim());
    }
    for (const section of draft.sections || []) {
      const label = asNonEmptyString(section.label);
      const text = asNonEmptyString(section.text);
      if (!label && !text) {
        continue;
      }
      if (section.role === "list_item") {
        if (label && text) {
          lines.push("", `- ${label} ${text}`.trim());
        } else if (text) {
          lines.push("", `- ${text}`.trim());
        } else if (label) {
          lines.push("", `- ${label}`.trim());
        }
        continue;
      }
      if (section.role === "heading" || section.role === "subheading") {
        lines.push("", `## ${text || label}`.trim());
        continue;
      }
      const content = [label, text].filter(Boolean).join(" ").trim();
      if (!content) {
        continue;
      }
      lines.push("", content);
    }
    return lines.join("\n");
  }

  private renderDraftSnapshotText(
    sections: Array<{ id: string; role: string; label?: string; text?: string }>,
  ): string {
    return sections
      .map((section) => {
        const label = asNonEmptyString(section.label);
        const text = asNonEmptyString(section.text);
        if (!label && !text) {
          return "";
        }
        if (!label) {
          return text;
        }
        if (!text) {
          return label;
        }
        return `${label} ${text}`.trim();
      })
      .filter(Boolean)
      .join("\n\n");
  }

  private slugifyFileName(value: string): string {
    const cleaned = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return cleaned || "document";
  }

  private persistDocumentDraftProvenance(
    documentId: number | string,
    provenance: DraftDocumentProvenance,
  ): void {
    const db = this.getDbModule();
    if (!db || typeof db.prepare !== "function") {
      return;
    }

    try {
      const entityId = coerceEntityId(documentId);
      if (entityId == null) {
        return;
      }
      const existingRow = db
        .prepare("SELECT artifact_json FROM documents WHERE id = @id")
        .get?.({ id: entityId });
      const existingArtifact = safeParseObject(existingRow?.artifact_json);
      const nextArtifact = {
        ...existingArtifact,
        draft_provenance: {
          source: "agent_session_draft",
          session_id: provenance.sessionId || null,
          source_turn_id: provenance.sourceTurnId || null,
          draft_version:
            typeof provenance.draftVersion === "number" && Number.isFinite(provenance.draftVersion)
              ? provenance.draftVersion
              : null,
          persisted_at: new Date().toISOString(),
        },
      };
      db.prepare(
        "UPDATE documents SET artifact_json = @artifact_json, updated_at = CURRENT_TIMESTAMP WHERE id = @id",
      ).run?.({
        id: entityId,
        artifact_json: JSON.stringify(nextArtifact),
      });
    } catch {
      // Keep document creation successful even when provenance update fails.
    }
  }

  private getDocumentStorageModule(): DocumentStorageModule | null {
    if (this.storageModule !== undefined) {
      return this.storageModule;
    }
    try {
      const resolved = _path.resolve(
        __dirname,
        "..",
        "..",
        "..",
        "src",
        "services",
        "documentStorage",
      );
      const loaded = require(resolved) as DocumentStorageModule;
      if (loaded && typeof loaded.ensureDocumentsRoot === "function") {
        this.storageModule = loaded;
        return loaded;
      }
      this.storageModule = null;
      return null;
    } catch {
      this.storageModule = null;
      return null;
    }
  }

  private getDocumentRendererModule(): DocumentRendererModule | null {
    if (this.rendererModule !== undefined) {
      return this.rendererModule;
    }
    try {
      const resolved = _path.resolve(
        __dirname,
        "..",
        "..",
        "..",
        "src",
        "services",
        "documentGeneration",
        "renderer.service",
      );
      const loaded = require(resolved) as DocumentRendererModule;
      if (loaded && typeof loaded.renderDocument === "function") {
        this.rendererModule = loaded;
        return loaded;
      }
      this.rendererModule = null;
      return null;
    } catch {
      this.rendererModule = null;
      return null;
    }
  }

  private getDbModule(): DatabaseLike | null {
    if (this.dbModule !== undefined) {
      return this.dbModule;
    }
    try {
      const resolved = _path.resolve(
        __dirname,
        "..",
        "..",
        "..",
        "src",
        "db",
        "connection",
      );
      const loaded = require(resolved) as DatabaseLike;
      if (loaded && typeof loaded.prepare === "function") {
        this.dbModule = loaded;
        return loaded;
      }
      this.dbModule = null;
      return null;
    } catch {
      this.dbModule = null;
      return null;
    }
  }

  private getService(entityType: string): EntityService | null {
    if (this.serviceCache.has(entityType)) {
      return this.serviceCache.get(entityType) ?? null;
    }

    const fileName = SERVICE_BY_ENTITY[entityType];
    if (!fileName) {
      this.serviceCache.set(entityType, null);
      return null;
    }

    try {
      const resolved = _path.resolve(
        __dirname,
        "..",
        "..",
        "..",
        "src",
        "services",
        fileName,
      );
      const loaded = require(resolved) as EntityService;
      const service = loaded && typeof loaded === "object" ? loaded : null;
      this.serviceCache.set(entityType, service);
      return service;
    } catch {
      this.serviceCache.set(entityType, null);
      return null;
    }
  }
}

function normalizePlanOperation(
  value: PendingActionPlan | PlanOperation | null | undefined,
): PlanOperation | null {
  if (!value) return null;
  const raw = value as unknown;
  if (!isRecord(raw)) {
    return null;
  }

  const source = isRecord(raw.operation)
    ? (raw.operation as Record<string, unknown>)
    : raw;

  const operationRaw = String(source.operation || "").trim().toLowerCase();
  if (!isPlanOperationType(operationRaw)) {
    return null;
  }

  const entityType = String(source.entityType || "").trim();
  if (!entityType) {
    return null;
  }

  const result: PlanOperation = {
    operation: operationRaw,
    entityType,
  };

  const entityId = coerceEntityId(source.entityId);
  if (entityId != null) {
    result.entityId = entityId;
  }
  if (isRecord(source.payload)) {
    result.payload = source.payload;
  }
  if (isRecord(source.changes)) {
    result.changes = source.changes;
  }
  if (typeof source.reason === "string" && source.reason.trim().length > 0) {
    result.reason = source.reason.trim();
  }

  return result;
}

function isPlanOperationType(value: string): value is PlanOperation["operation"] {
  return value === "create" || value === "update" || value === "delete";
}

function canonicalEntityType(value: string): string | null {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!raw) {
    return null;
  }
  const canonical = ENTITY_ALIASES[raw] || raw;
  return SERVICE_BY_ENTITY[canonical] ? canonical : null;
}

function toOperationFromStep(step: DomainWorkflowStep): PlanOperation {
  return {
    operation: step.operation,
    entityType: String(step.entityType || "").trim().toLowerCase(),
    ...(step.entityId != null ? { entityId: step.entityId } : {}),
    ...(isRecord(step.payload) ? { payload: step.payload } : {}),
    ...(isRecord(step.changes) ? { changes: step.changes } : {}),
    ...(typeof step.reason === "string" && step.reason.trim().length > 0
      ? { reason: step.reason.trim() }
      : {}),
  };
}

function unsupportedOperation(
  entityType: string,
  operation: "create" | "update" | "delete",
): EntityExecutionResult {
  return {
    ok: false,
    errorCode: "UNSUPPORTED_OPERATION",
    errorMessage: `Operation "${operation}" is not supported for entity type "${entityType}".`,
  };
}

function extractEntityId(value: unknown): number | string | null {
  if (isRecord(value) && Object.prototype.hasOwnProperty.call(value, "id")) {
    return coerceEntityId(value.id);
  }
  if (isRecord(value) && Object.prototype.hasOwnProperty.call(value, "entityId")) {
    return coerceEntityId(value.entityId);
  }
  return null;
}

function coerceEntityId(value: unknown): number | string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number.parseInt(trimmed, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return trimmed;
  }
  return null;
}

function normalizeDeleteOutcome(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value > 0;
  }
  if (isRecord(value)) {
    if (typeof value.deleted === "boolean") {
      return value.deleted;
    }
    if (typeof value.changes === "number") {
      return value.changes > 0;
    }
    if (typeof value.ok === "boolean") {
      return value.ok;
    }
  }
  return Boolean(value);
}

function normalizeExecutionError(error: unknown): EntityExecutionResult {
  const message =
    error instanceof Error && error.message.trim().length > 0
      ? error.message
      : String(error || "Entity execution failed.");
  const lowered = message.toLowerCase();
  if (lowered.includes("foreign key constraint failed")) {
    return {
      ok: false,
      errorCode: "EXEC_PRECONDITION_LINK_NOT_FOUND",
      errorMessage: "A linked parent record no longer exists for this action.",
      errorDetails: {
        category: "link",
        reason: "foreign_key_constraint",
        hint: "Refresh context, choose an existing linked entity, and confirm again.",
      },
    };
  }
  if (lowered.includes("file_path is required")) {
    return {
      ok: false,
      errorCode: "EXEC_PRECONDITION_STORAGE_SOURCE_MISSING",
      errorMessage: "A document file path is required before this action can run.",
      errorDetails: {
        category: "storage",
        reason: "file_path_required",
        hint: "Regenerate or attach a document file and confirm again.",
      },
    };
  }
  if (lowered.includes("exactly one parent reference is required")) {
    return {
      ok: false,
      errorCode: "EXEC_PRECONDITION_LINK_CONFLICT",
      errorMessage: "Exactly one parent link is required for this action.",
      errorDetails: {
        category: "link",
        reason: "parent_reference_count_invalid",
        hint: "Keep one parent link only, then retry confirmation.",
      },
    };
  }
  const code =
    lowered.includes("required") ||
    lowered.includes("invalid") ||
    lowered.includes("no fields provided")
      ? "EXEC_PRECONDITION_PAYLOAD_INVALID"
      : "ENTITY_EXECUTION_ERROR";
  return {
    ok: false,
    errorCode: code,
    errorMessage: message,
    errorDetails: {
      category: code === "ENTITY_EXECUTION_ERROR" ? "execution" : "validation",
      reason: "service_error",
      hint: "Review the requested fields and confirm again.",
    },
  };
}

function parentEntityTypeFromField(field: string): string | null {
  const normalized = String(field || "").trim().toLowerCase();
  if (normalized === "client_id") return "client";
  if (normalized === "dossier_id") return "dossier";
  if (normalized === "lawsuit_id") return "lawsuit";
  if (normalized === "mission_id") return "mission";
  if (normalized === "task_id") return "task";
  if (normalized === "session_id") return "session";
  if (normalized === "personal_task_id") return "personal_task";
  if (normalized === "financial_entry_id") return "financial_entry";
  if (normalized === "officer_id") return "officer";
  return null;
}

function countDocumentParentLinks(payload: Record<string, unknown>): number {
  let count = 0;
  for (const [field] of DOCUMENT_PARENT_FIELD_ALIASES) {
    if (coerceEntityId(payload[field]) != null) {
      count += 1;
    }
  }
  return count;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function safeParseObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || value.trim().length === 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
