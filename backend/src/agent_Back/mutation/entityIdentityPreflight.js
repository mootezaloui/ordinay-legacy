"use strict";

const clientsService = require("../../services/clients.service");
const dossiersService = require("../../services/dossiers.service");
const lawsuitsService = require("../../services/lawsuits.service");
const tasksService = require("../../services/tasks.service");
const sessionsService = require("../../services/sessions.service");
const missionsService = require("../../services/missions.service");
const financialService = require("../../services/financial.service");
const officersService = require("../../services/officers.service");
const documentsService = require("../../services/documents.service");
const notesService = require("../../services/notes.service");
const personalTasksService = require("../../services/personalTasks.service");
const notificationsService = require("../../services/notifications.service");
const {
  getEntityIdentityPolicy,
  normalizeText,
  normalizePhone,
  normalizeDate,
  toNumber,
  collectTokens,
  extractCategories,
  isOpenLikeStatus,
} = require("./entityIdentityPolicies");

const SERVICE_BY_ENTITY_TYPE = Object.freeze({
  client: clientsService,
  dossier: dossiersService,
  lawsuit: lawsuitsService,
  task: tasksService,
  session: sessionsService,
  mission: missionsService,
  financial_entry: financialService,
  officer: officersService,
  document: documentsService,
  note: notesService,
  personal_task: personalTasksService,
  notification: notificationsService,
});

function readValue(record, keys = []) {
  if (!record || typeof record !== "object") return null;
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== "") {
      return record[key];
    }
  }
  return null;
}

function jaccardScore(left = [], right = []) {
  const a = new Set(left);
  const b = new Set(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = new Set([...a, ...b]).size;
  return union > 0 ? intersection / union : 0;
}

function exactMatchScore(left, right, normalizer = normalizeText) {
  const a = normalizer(left);
  const b = normalizer(right);
  return a && b && a === b ? 1 : 0;
}

function normalizeAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function buildScopeFromPayload(entityType, payload = {}, parent = null, executionContext = {}) {
  const normalizedType = String(entityType || "").toLowerCase();
  const explicitParentType = String(parent?.entityType || "").toLowerCase();
  const explicitParentId = toNumber(parent?.entityId);
  const resolvedEntityType = String(executionContext?.resolvedEntity?.type || "").toLowerCase();
  const resolvedEntityId = toNumber(executionContext?.resolvedEntity?.id);
  const scope = {
    client_id: toNumber(payload.client_id) || toNumber(executionContext?.clientId),
    dossier_id: toNumber(payload.dossier_id) || toNumber(executionContext?.dossierId),
    lawsuit_id: toNumber(payload.lawsuit_id) || toNumber(executionContext?.lawsuitId),
    mission_id: toNumber(payload.mission_id) || toNumber(executionContext?.missionId),
    task_id: toNumber(payload.task_id) || toNumber(executionContext?.taskId),
    session_id: toNumber(payload.session_id) || toNumber(executionContext?.sessionId),
    personal_task_id: toNumber(payload.personal_task_id) || toNumber(executionContext?.personalTaskId),
    financial_entry_id: toNumber(payload.financial_entry_id) || toNumber(executionContext?.financialEntryId),
    officer_id: toNumber(payload.officer_id) || toNumber(executionContext?.officerId),
    entity_type: normalizeText(payload.entity_type) || null,
    entity_id: toNumber(payload.entity_id),
  };

  if (explicitParentType && explicitParentId) {
    const field = `${explicitParentType}_id`;
    if (Object.prototype.hasOwnProperty.call(scope, field)) scope[field] = explicitParentId;
    if (normalizedType === "note") {
      scope.entity_type = explicitParentType;
      scope.entity_id = explicitParentId;
    }
  }

  if (!scope.client_id && resolvedEntityType === "client" && resolvedEntityId) scope.client_id = resolvedEntityId;
  if (!scope.dossier_id && resolvedEntityType === "dossier" && resolvedEntityId) scope.dossier_id = resolvedEntityId;
  if (!scope.lawsuit_id && resolvedEntityType === "lawsuit" && resolvedEntityId) scope.lawsuit_id = resolvedEntityId;
  if (!scope.task_id && resolvedEntityType === "task" && resolvedEntityId) scope.task_id = resolvedEntityId;
  if (!scope.mission_id && resolvedEntityType === "mission" && resolvedEntityId) scope.mission_id = resolvedEntityId;
  if (!scope.personal_task_id && resolvedEntityType === "personal_task" && resolvedEntityId) scope.personal_task_id = resolvedEntityId;
  if (!scope.financial_entry_id && resolvedEntityType === "financial_entry" && resolvedEntityId) {
    scope.financial_entry_id = resolvedEntityId;
  }

  return scope;
}

function getCandidateRows(entityType, scope = {}, context = {}) {
  if (Array.isArray(context.candidateRows)) return context.candidateRows;
  const serviceOverrides =
    context.serviceOverrides && typeof context.serviceOverrides === "object" ? context.serviceOverrides : {};
  const service = serviceOverrides[entityType] || SERVICE_BY_ENTITY_TYPE[entityType];
  if (!service) return [];
  if (entityType === "note") {
    if (!scope.entity_type || !scope.entity_id || typeof service.listByEntity !== "function") return [];
    return service.listByEntity(scope.entity_type, scope.entity_id);
  }
  if (entityType === "document" && typeof service.list === "function") {
    return service.list({});
  }
  if (typeof service.list === "function") {
    return service.list();
  }
  return [];
}

function filterCandidatesByScope(entityType, rows = [], scope = {}) {
  const list = Array.isArray(rows) ? rows : [];
  switch (entityType) {
    case "client":
    case "officer":
    case "personal_task":
    case "notification":
      return list;
    case "dossier":
      return list.filter((row) => toNumber(row.client_id) === scope.client_id);
    case "lawsuit":
      return list.filter((row) => toNumber(row.dossier_id) === scope.dossier_id);
    case "task":
    case "session":
    case "mission":
      return list.filter((row) =>
        (scope.lawsuit_id && toNumber(row.lawsuit_id) === scope.lawsuit_id) ||
        (!scope.lawsuit_id && scope.dossier_id && toNumber(row.dossier_id) === scope.dossier_id),
      );
    case "financial_entry":
      return list.filter((row) =>
        ["lawsuit_id", "dossier_id", "mission_id", "task_id", "personal_task_id", "client_id"].some(
          (field) => scope[field] && toNumber(row[field]) === scope[field],
        ),
      );
    case "document":
      return list.filter((row) =>
        [
          "client_id",
          "dossier_id",
          "lawsuit_id",
          "mission_id",
          "task_id",
          "session_id",
          "personal_task_id",
          "financial_entry_id",
          "officer_id",
        ].some((field) => scope[field] && toNumber(row[field]) === scope[field]),
      );
    case "note":
      return list.filter(
        (row) => normalizeText(row.entity_type) === scope.entity_type && toNumber(row.entity_id) === scope.entity_id,
      );
    default:
      return list;
  }
}

function buildFingerprint(entityType, record = {}, userMessage = "") {
  const textFields = [];
  const uniqueValues = {};
  const dateValues = {};
  const numericValues = {};
  const status = normalizeText(readValue(record, ["status"])) || null;
  const primaryLabel = normalizeText(readValue(record, ["name", "title", "content"]));

  switch (entityType) {
    case "client":
      textFields.push(readValue(record, ["name"]), readValue(record, ["address"]), readValue(record, ["company"]), readValue(record, ["profession"]), userMessage);
      uniqueValues.email = normalizeText(readValue(record, ["email"]));
      uniqueValues.phone = normalizePhone(readValue(record, ["phone"]));
      uniqueValues.cin = normalizeText(readValue(record, ["cin"]));
      uniqueValues.tax_id = normalizeText(readValue(record, ["tax_id"]));
      break;
    case "dossier":
      textFields.push(readValue(record, ["title"]), readValue(record, ["description"]), readValue(record, ["adversary_name"]), readValue(record, ["adversary_party"]), userMessage);
      uniqueValues.reference = normalizeText(readValue(record, ["reference"]));
      uniqueValues.court_reference = normalizeText(readValue(record, ["court_reference"]));
      uniqueValues.category = normalizeText(readValue(record, ["category"]));
      break;
    case "lawsuit":
      textFields.push(readValue(record, ["title"]), readValue(record, ["description"]), readValue(record, ["adversary_name", "adversary"]), readValue(record, ["court"]), userMessage);
      uniqueValues.reference = normalizeText(readValue(record, ["reference"]));
      uniqueValues.lawsuit_number = normalizeText(readValue(record, ["lawsuit_number"]));
      uniqueValues.reference_number = normalizeText(readValue(record, ["reference_number"]));
      uniqueValues.court = normalizeText(readValue(record, ["court"]));
      break;
    case "task":
    case "mission":
    case "personal_task":
      textFields.push(readValue(record, ["title"]), readValue(record, ["description"]), readValue(record, ["mission_type", "category"]), userMessage);
      dateValues.due_date = normalizeDate(readValue(record, ["due_date"]));
      break;
    case "session":
      textFields.push(readValue(record, ["title"]), readValue(record, ["description"]), readValue(record, ["session_type"]), readValue(record, ["location"]), userMessage);
      dateValues.scheduled_at = normalizeDate(readValue(record, ["scheduled_at", "session_date"]));
      break;
    case "financial_entry":
      textFields.push(readValue(record, ["title"]), readValue(record, ["description"]), readValue(record, ["category"]), readValue(record, ["entry_type"]), userMessage);
      uniqueValues.reference = normalizeText(readValue(record, ["reference"]));
      dateValues.occurred_at = normalizeDate(readValue(record, ["occurred_at", "due_date"]));
      numericValues.amount = normalizeAmount(readValue(record, ["amount"]));
      break;
    case "officer":
      textFields.push(readValue(record, ["name"]), readValue(record, ["agency"]), readValue(record, ["location"]), readValue(record, ["specialization"]), userMessage);
      uniqueValues.email = normalizeText(readValue(record, ["email"]));
      uniqueValues.phone = normalizePhone(readValue(record, ["phone"]));
      uniqueValues.registration_number = normalizeText(readValue(record, ["registration_number"]));
      break;
    case "document":
      textFields.push(readValue(record, ["title"]), readValue(record, ["category"]), readValue(record, ["original_filename"]), userMessage);
      uniqueValues.file_path = normalizeText(readValue(record, ["file_path"]));
      uniqueValues.original_filename = normalizeText(readValue(record, ["original_filename"]));
      break;
    case "note":
      textFields.push(readValue(record, ["content"]), userMessage);
      break;
    case "notification":
      textFields.push(readValue(record, ["type"]), readValue(record, ["template_key"]), userMessage);
      uniqueValues.dedupe_key = normalizeText(readValue(record, ["dedupe_key"]));
      break;
    default:
      textFields.push(JSON.stringify(record || {}), userMessage);
      break;
  }

  const textTokens = collectTokens(textFields);
  const semanticCategories = extractCategories(textFields);
  return {
    textTokens,
    semanticCategories,
    uniqueValues,
    dateValues,
    numericValues,
    status,
    primaryLabel,
    hasIdentitySignal:
      textTokens.length > 0 ||
      Object.values(uniqueValues).some(Boolean) ||
      Object.values(dateValues).some(Boolean) ||
      Object.values(numericValues).some((value) => value !== null),
  };
}

function buildMatchScore(entityType, requested, candidate, policy) {
  let score = 0;
  const reasons = [];

  for (const [field, value] of Object.entries(requested.uniqueValues || {})) {
    if (!value) continue;
    if (candidate.uniqueValues?.[field] && candidate.uniqueValues[field] === value) {
      score = Math.max(score, field === "dedupe_key" || field === "file_path" ? 0.99 : 0.94);
      reasons.push(`exact_${field}`);
    }
  }

  const tokenScore = jaccardScore(requested.textTokens, candidate.textTokens);
  const categoryScore = jaccardScore(requested.semanticCategories, candidate.semanticCategories);
  if (tokenScore > 0) {
    score = Math.max(score, tokenScore * 0.65);
    reasons.push(`token_overlap_${tokenScore.toFixed(2)}`);
  }
  if (categoryScore > 0) {
    score = Math.max(score, 0.45 + categoryScore * 0.4);
    reasons.push(`category_overlap_${categoryScore.toFixed(2)}`);
  }

  for (const [field, value] of Object.entries(requested.dateValues || {})) {
    if (!value || !candidate.dateValues?.[field]) continue;
    if (candidate.dateValues[field] === value) {
      score = Math.max(score, entityType === "session" ? 0.92 : 0.82);
      reasons.push(`same_${field}`);
    }
  }

  for (const [field, value] of Object.entries(requested.numericValues || {})) {
    if (value === null || candidate.numericValues?.[field] === null || candidate.numericValues?.[field] === undefined) {
      continue;
    }
    if (candidate.numericValues[field] === value) {
      score = Math.max(score, 0.72);
      reasons.push(`same_${field}`);
    }
  }

  if (entityType === "client" || entityType === "officer") {
    if (requested.primaryLabel && candidate.primaryLabel && requested.primaryLabel === candidate.primaryLabel) {
      score = Math.max(score, 0.66);
      reasons.push("exact_primary_label");
    }
    const nameScore = jaccardScore(requested.textTokens, candidate.textTokens);
    if (nameScore >= 0.66) {
      score = Math.max(score, 0.62);
      reasons.push("same_name_cluster");
    }
  }

  if (policy?.preferOpenCandidates && !isOpenLikeStatus(candidate.status)) {
    score = Math.max(0, score - 0.18);
    reasons.push("candidate_not_open");
  }

  return {
    score: Math.max(0, Math.min(0.99, score)),
    reasons,
  };
}

function labelForCandidate(entityType, row = {}) {
  return (
    String(row.title || "").trim() ||
    String(row.name || "").trim() ||
    String(row.reference || row.lawsuit_number || row.original_filename || "").trim() ||
    `${entityType} #${row.id || "?"}`
  );
}

function subtitleForCandidate(entityType, row = {}) {
  const parts = [];
  const reference = String(
    row.reference || row.lawsuit_number || row.reference_number || row.original_filename || "",
  ).trim();
  const status = String(row.status || "").trim();
  const court = String(row.court || "").trim();
  const category = String(row.category || row.entry_type || row.session_type || "").trim();
  if (reference) parts.push(reference);
  if (status) parts.push(status);
  if (court) parts.push(court);
  if (category) parts.push(category);
  return parts.length > 0 ? parts.join(" | ") : null;
}

function metadataForCandidate(entityType, row = {}) {
  const metadata = {};
  const status = String(row.status || "").trim();
  const reference = String(row.reference || row.lawsuit_number || row.reference_number || "").trim();
  const court = String(row.court || "").trim();
  const clientName = String(row.client_name || row.clientName || "").trim();
  const date = String(
    row.filing_date || row.session_date || row.scheduled_at || row.due_date || row.created_at || "",
  ).trim();
  if (status) metadata.status = status;
  if (reference) metadata.reference = reference;
  if (court) metadata.court = court;
  if (clientName) metadata.clientName = clientName;
  if (date) metadata.date = date;
  return metadata;
}

function buildMessage(outcome, entityType, scope) {
  const typeLabel = String(entityType || "record").replace(/_/g, " ");
  const scopeLabel =
    scope?.dossier_id ? "this dossier" :
    scope?.client_id ? "this client" :
    scope?.lawsuit_id ? "this lawsuit" :
    scope?.entity_id ? "this record" :
    "this scope";
  if (outcome === "duplicate_found") {
    return `An equivalent ${typeLabel} already exists in ${scopeLabel}. I will not create a duplicate.`;
  }
  if (outcome === "ambiguous_match") {
    return `I found an existing ${typeLabel} that may already represent this matter in ${scopeLabel}. I need your confirmation before creating a new one.`;
  }
  return `I need more identifying detail before I can safely create this ${typeLabel}.`;
}

function buildSuggestedActions(match = null, ambiguous = false) {
  if (!match) return ["SHOW_MATCHES"];
  const actions = [
    "OPEN_EXISTING_ENTITY",
    "UPDATE_EXISTING_ENTITY",
    "ADD_NOTE_TO_EXISTING_ENTITY",
    "CREATE_TASK_FOR_EXISTING_ENTITY",
  ];
  if (ambiguous) actions.unshift("SHOW_MATCHES");
  return actions;
}

function buildIdentityCollisionArtifact(result, options = {}) {
  return {
    type: "identity_collision",
    sessionId: options.sessionId || null,
    entityType: result.entityType,
    matchedEntity: result.matchedEntity || null,
    matches: Array.isArray(result.matches) ? result.matches : [],
    reasonCode: result.reasonCode || null,
    confidence: result.confidence ?? null,
    ambiguous: result.outcome === "ambiguous_match" || result.outcome === "insufficient_identity",
    message: result.userMessage || "",
    suggestedActions: buildSuggestedActions(result.matchedEntity, result.outcome !== "duplicate_found"),
    scope: result.scope || null,
  };
}

async function runEntityIdentityPreflight(input = {}, context = {}) {
  const entityType = String(input.entityType || "").toLowerCase();
  const payload = input.payload && typeof input.payload === "object" ? input.payload : {};
  const parent = input.parent && typeof input.parent === "object" ? input.parent : null;
  const userMessage = String(input.userMessage || context.userMessage || "");
  const policy = getEntityIdentityPolicy(entityType);
  if (!policy) {
    return { outcome: "allow_create", entityType, reasonCode: "policy_not_defined", confidence: 0 };
  }

  const scope = buildScopeFromPayload(entityType, payload, parent, context.executionContext || context);
  const requestedFingerprint = buildFingerprint(entityType, payload, userMessage);
  if (!requestedFingerprint.hasIdentitySignal) {
    return {
      outcome: "insufficient_identity",
      entityType,
      reasonCode: "missing_identity_signals",
      confidence: 0.2,
      scope,
      userMessage: buildMessage("insufficient_identity", entityType, scope),
      matches: [],
      matchedEntity: null,
    };
  }

  const candidateRows = filterCandidatesByScope(entityType, getCandidateRows(entityType, scope, context), scope)
    .filter((row) => toNumber(row.id));
  const matches = candidateRows
    .map((row) => {
      const fingerprint = buildFingerprint(entityType, row, "");
      const { score, reasons } = buildMatchScore(entityType, requestedFingerprint, fingerprint, policy);
      return {
        id: Number(row.id),
        label: labelForCandidate(entityType, row),
        row,
        score,
        reasons,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  if (matches.length === 0) {
    return {
      outcome: "allow_create",
      entityType,
      reasonCode: "no_candidate_match",
      confidence: 0,
      scope,
      matches: [],
      matchedEntity: null,
    };
  }

  const best = matches[0];
  const thresholds = policy.confidenceThresholds || { duplicate: 0.86, ambiguous: 0.58 };
  const outcome =
    best.score >= thresholds.duplicate
      ? "duplicate_found"
      : best.score >= thresholds.ambiguous
        ? "ambiguous_match"
        : "allow_create";

  if (outcome === "allow_create") {
    return {
      outcome,
      entityType,
      reasonCode: "low_confidence_match",
      confidence: best.score,
      scope,
      matches: matches.slice(0, 3).map(({ row, ...rest }) => rest),
      matchedEntity: null,
    };
  }

  return {
    outcome,
    entityType,
    reasonCode: outcome === "duplicate_found" ? "same_semantic_identity_in_scope" : "possible_existing_entity_match",
    confidence: best.score,
    scope,
    matches: matches.slice(0, 3).map(({ row, ...rest }) => ({
      ...rest,
      entityType,
      subtitle: subtitleForCandidate(entityType, row),
      metadata: metadataForCandidate(entityType, row),
    })),
    matchedEntity: {
      id: best.id,
      label: best.label,
      entityType,
      subtitle: subtitleForCandidate(entityType, best.row),
      metadata: metadataForCandidate(entityType, best.row),
    },
    userMessage: buildMessage(outcome, entityType, scope),
  };
}

function buildContextSuggestionFromIdentityCollision(artifact = {}, options = {}) {
  const entityType = String(artifact?.entityType || "record").toLowerCase();
  const matchedEntity =
    artifact?.matchedEntity && typeof artifact.matchedEntity === "object" ? artifact.matchedEntity : null;
  const matches = Array.isArray(artifact?.matches) ? artifact.matches : [];
  const label = entityType.replace(/_/g, " ");
  const suggestions = (matchedEntity ? [matchedEntity] : matches)
    .map((item, index) => {
      const entityId = Number(item?.id || item?.entityId || 0);
      if (!entityId) return null;
      return {
        id: `${entityType}-${entityId}-${index}`,
        entityType,
        entityId,
        label: String(item?.label || `${label} #${entityId}`),
        subtitle: String(item?.subtitle || "").trim() || null,
        metadata: {
          ...(item?.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
            ? item.metadata
            : {}),
          confidence:
            Number.isFinite(Number(artifact?.confidence)) ? Number(Number(artifact.confidence).toFixed(2)) : 0,
        },
        intent: "RESOLVE_CONTEXT_AND_CONTINUE",
        scope:
          artifact?.scope && typeof artifact.scope === "object" && !Array.isArray(artifact.scope)
            ? artifact.scope
            : {},
        resolveContext: {
          originalIntent:
            String(options.originalIntent || `READ_${entityType.toUpperCase()}`).trim() ||
            "CHATBOT_AGENT_MODE",
          originalDraftType: options.originalDraftType || undefined,
          pendingOperationId: options.pendingOperationId || undefined,
        },
      };
    })
    .filter(Boolean);

  const message =
    suggestions.length === 1
      ? `Yes, there is already a ${label} for this matter. Do you mean this one?`
      : `I found existing ${label} records that may already match this matter. Which one do you mean?`;

  return {
    type: "context_suggestion",
    message,
    entityType,
    reason: "existing_context_match",
    originalIntent: String(options.originalIntent || `READ_${entityType.toUpperCase()}`),
    // Selecting an existing equivalent entity should open that entity,
    // not resume the original create request that triggered duplicate detection.
    originalMessage: null,
    suggestions,
    timestamp: new Date().toISOString(),
    confidence: Number.isFinite(Number(artifact?.confidence)) ? Number(artifact.confidence) : 0.82,
    source: "identity_preflight",
    allowManualInput: true,
    manualInputHint: `Open the existing ${label} if it matches, or clarify what makes the new one different.`,
    matchedEntity,
    identityCollision: artifact,
  };
}

module.exports = {
  runEntityIdentityPreflight,
  buildIdentityCollisionArtifact,
  buildContextSuggestionFromIdentityCollision,
  _internal: {
    buildFingerprint,
    buildMatchScore,
    buildScopeFromPayload,
    filterCandidatesByScope,
  },
};
