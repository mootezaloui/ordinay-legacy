"use strict";

const {
  sanitizeForDisplay,
  buildProposalDisplaySummary,
} = require("../presentation/presentationSanitizer");

const PROPOSAL_DEBUG_ENABLED =
  ["1", "true", "yes", "on"].includes(String(process.env.AGENT_CHAT_MUTATION_DEBUG || "").toLowerCase()) ||
  ["1", "true", "yes", "on"].includes(String(process.env.AGENT_MUTATION_DEBUG || "").toLowerCase()) ||
  process.env.NODE_ENV !== "production";

function _toEntityLabel(entityType = "") {
  return String(entityType || "record")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

function _toOperationLabel(actionType = "") {
  const normalized = String(actionType || "").trim().toUpperCase();
  if (normalized === "CREATE_ENTITY") return "create";
  if (normalized === "UPDATE_ENTITY") return "update";
  if (normalized === "DELETE_ENTITY") return "delete";
  if (normalized === "LINK_ENTITIES") return "link";
  if (normalized === "ATTACH_TO_ENTITY") return "attach";
  return normalized ? normalized.toLowerCase() : "change";
}

function _toActionVerb(operation = "") {
  const normalized = String(operation || "").trim().toLowerCase();
  if (normalized === "create") return "Create";
  if (normalized === "update") return "Update";
  if (normalized === "delete") return "Delete";
  if (normalized === "link") return "Link";
  if (normalized === "attach") return "Attach";
  return "Apply";
}

function _pluralize(label = "", count = 0) {
  const base = String(label || "").trim();
  if (!base) return "records";
  if (count === 1) return base;
  if (base.endsWith("s")) return base;
  return `${base}s`;
}

function _extractWorkflowScope(affectedEntities = []) {
  const list = Array.isArray(affectedEntities) ? affectedEntities : [];
  const dossier = list.find((entry) => String(entry?.type || "").toLowerCase() === "dossier");
  const lawsuit = list.find((entry) => String(entry?.type || "").toLowerCase() === "lawsuit");
  const client = list.find((entry) => String(entry?.type || "").toLowerCase() === "client");
  return {
    dossierReference: dossier?.reference || null,
    dossierLabel: dossier?.label || null,
    lawsuitReference: lawsuit?.reference || null,
    lawsuitLabel: lawsuit?.label || null,
    clientReference: client?.reference || null,
    clientLabel: client?.label || null,
  };
}

function _extractParentLinkage(params = {}, scope = {}) {
  const payload =
    params?.payload && typeof params.payload === "object" && !Array.isArray(params.payload)
      ? params.payload
      : {};
  const linkage = {
    dossierId: payload?.dossier_id || params?.dossier_id || null,
    lawsuitId: payload?.lawsuit_id || params?.lawsuit_id || null,
    clientId: payload?.client_id || params?.client_id || null,
    dossierReference: scope?.dossierReference || null,
    lawsuitReference: scope?.lawsuitReference || null,
    clientReference: scope?.clientReference || null,
  };
  return linkage;
}

function _extractKeyFields(stepParams = {}, stepActionType = "", scope = {}) {
  const actionType = String(stepActionType || "").toUpperCase();
  const payload =
    stepParams?.payload && typeof stepParams.payload === "object" && !Array.isArray(stepParams.payload)
      ? stepParams.payload
      : {};
  const changes =
    stepParams?.changes && typeof stepParams.changes === "object" && !Array.isArray(stepParams.changes)
      ? stepParams.changes
      : {};

  const title =
    payload?.title ||
    payload?.name ||
    payload?.subject ||
    payload?.reference ||
    stepParams?.title ||
    null;
  const status =
    payload?.status ||
    stepParams?.status ||
    (changes?.status && typeof changes.status === "object" ? changes.status.to : changes?.status) ||
    null;
  const priority =
    payload?.priority ||
    stepParams?.priority ||
    (changes?.priority && typeof changes.priority === "object" ? changes.priority.to : changes?.priority) ||
    null;

  const selectedFields = {};
  const sourceFields = actionType === "UPDATE_ENTITY" ? changes : payload;
  const keys = Object.keys(sourceFields || {})
    .filter((key) => key && !/(_id$|^id$|^entityType$)/i.test(String(key)))
    .slice(0, 6);
  for (const key of keys) {
    const rawValue = sourceFields[key];
    const value =
      rawValue && typeof rawValue === "object" && !Array.isArray(rawValue) && "to" in rawValue
        ? rawValue.to
        : rawValue;
    selectedFields[key] = value;
  }

  return {
    title,
    status,
    priority,
    parentLinkage: _extractParentLinkage(stepParams, scope),
    fields: selectedFields,
  };
}

function _buildWorkflowPreview(workflow = null, affectedEntities = [], fallbackSummary = "", explicitPreview = null) {
  const explicitItems = Array.isArray(explicitPreview?.items) ? explicitPreview.items : [];
  const explicitWarnings = Array.isArray(explicitPreview?.warnings)
    ? explicitPreview.warnings.map((w) => _normalizeDisplayValue(w)).filter(Boolean)
    : [];
  const steps = Array.isArray(workflow?.steps) ? workflow.steps : [];
  if (!steps.length && !explicitItems.length) return null;

  const scope = _extractWorkflowScope(affectedEntities);
  const previewItems = (explicitItems.length > 0 ? explicitItems : steps).map((step, index) => {
    const isExplicitPreviewRow = explicitItems.length > 0;
    const actionType = String(step?.actionType || "").toUpperCase();
    const params =
      step?.params && typeof step.params === "object" && !Array.isArray(step.params)
        ? step.params
        : {};
    const entityType = String(
      isExplicitPreviewRow ? (step?.entityType || "record") : (params?.entityType || "record"),
    )
      .trim()
      .toLowerCase();
    const operation = isExplicitPreviewRow
      ? String(step?.operation || "").trim().toLowerCase() || _toOperationLabel(actionType)
      : _toOperationLabel(actionType);
    const keyFields = isExplicitPreviewRow ? {} : _extractKeyFields(params, actionType, scope);
    const inferredFields = Array.isArray(step?.inferredFields) ? step.inferredFields : [];
    const correctedFields = Array.isArray(step?.correctedFields) ? step.correctedFields : [];
    const warnings = Array.isArray(step?.warnings) ? step.warnings : [];
    return {
      stepId: step?.stepId || `step_${index + 1}`,
      index: index + 1,
      actionType,
      operation,
      entityType,
      title: _normalizeDisplayValue(step?.title) || keyFields.title || null,
      status: _normalizeDisplayValue(step?.status) || keyFields.status || null,
      priority: _normalizeDisplayValue(step?.priority) || keyFields.priority || null,
      parentLinkage: isExplicitPreviewRow ? null : keyFields.parentLinkage,
      parentLinks: Array.isArray(step?.parentLinks) ? step.parentLinks : null,
      fields: isExplicitPreviewRow ? {} : keyFields.fields,
      explicitFields: Array.isArray(step?.explicitFields) ? step.explicitFields : [],
      defaultedFields: Array.isArray(step?.defaultedFields) ? step.defaultedFields : [],
      inheritedFields: Array.isArray(step?.inheritedFields) ? step.inheritedFields : [],
      inferredFields,
      correctedFields,
      warnings,
      fieldDecisionMap:
        step?.fieldDecisionMap && typeof step.fieldDecisionMap === "object" && !Array.isArray(step.fieldDecisionMap)
          ? step.fieldDecisionMap
          : {},
      inferenceSummary:
        step?.inferenceSummary && typeof step.inferenceSummary === "object" && !Array.isArray(step.inferenceSummary)
          ? step.inferenceSummary
          : {},
    };
  });

  const groupsMap = new Map();
  for (const item of previewItems) {
    const key = `${item.entityType}:${item.operation}`;
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        entityType: item.entityType,
        operation: item.operation,
        count: 0,
        items: [],
      });
    }
    const group = groupsMap.get(key);
    group.items.push(item);
    group.count += 1;
  }
  const groups = Array.from(groupsMap.values());
  const distinctEntityTypes = new Set(groups.map((group) => String(group.entityType || "").toLowerCase()));
  const groupedMode = distinctEntityTypes.size <= 1 ? "single_entity_type" : "mixed_entity_types";

  for (const group of groups) {
    const verb = _toActionVerb(group.operation);
    const entityLabel = _pluralize(_toEntityLabel(group.entityType), group.count);
    const scopeSuffix =
      (scope?.lawsuitReference && ` in ${scope.lawsuitReference}`) ||
      (scope?.dossierReference && ` in ${scope.dossierReference}`) ||
      (scope?.lawsuitLabel && ` in ${scope.lawsuitLabel}`) ||
      (scope?.dossierLabel && ` in ${scope.dossierLabel}`) ||
      "";
    group.header = `${verb} ${group.count} ${entityLabel}${scopeSuffix}`;
  }

  const primaryGroup = groups[0];
  const summaryLine = primaryGroup?.header || fallbackSummary || "Apply workflow changes";

  let detailedSummary = summaryLine;
  if (groupedMode === "single_entity_type") {
    const titles = primaryGroup.items.map((item) => String(item.title || "").trim()).filter(Boolean);
    if (titles.length > 0) {
      detailedSummary = `${summaryLine}\n${titles.map((title) => `- ${title}`).join("\n")}`;
    }
  } else {
    const sections = groups.map((group) => {
      const lines = group.items
        .map((item) => String(item.title || "").trim())
        .filter(Boolean)
        .map((title) => `- ${title}`);
      return lines.length > 0 ? `${group.header}\n${lines.join("\n")}` : group.header;
    });
    detailedSummary = sections.join("\n\n");
  }

  return {
    totalSteps: previewItems.length,
    groupedMode,
    summaryLine,
    detailedSummary,
    previewItems,
    groups,
    warnings: explicitWarnings,
  };
}

function _normalizeDisplayValue(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function _buildProposalPreview({
  proposal = null,
  workflowPreview = null,
} = {}) {
  const confirmation =
    proposal?.confirmation && typeof proposal.confirmation === "object" && !Array.isArray(proposal.confirmation)
      ? proposal.confirmation
      : {};
  const warnings = Array.isArray(confirmation?.warnings)
    ? confirmation.warnings.map((w) => _normalizeDisplayValue(w)).filter(Boolean)
    : [];
  const workflowWarnings = Array.isArray(workflowPreview?.warnings)
    ? workflowPreview.warnings.map((w) => _normalizeDisplayValue(w)).filter(Boolean)
    : [];
  const previewItems = Array.isArray(workflowPreview?.previewItems) ? workflowPreview.previewItems : [];
  if (!previewItems.length) {
    return {
      title: _normalizeDisplayValue(proposal?.humanReadableSummary) || "Pending change preview",
      items: [],
      warnings: [...warnings, ...workflowWarnings],
    };
  }

  const items = previewItems.map((row, index) => {
    const parentLinkage =
      row?.parentLinkage && typeof row.parentLinkage === "object" && !Array.isArray(row.parentLinkage)
        ? row.parentLinkage
        : {};
    const fallbackLinks = [
      _normalizeDisplayValue(parentLinkage?.lawsuitReference),
      _normalizeDisplayValue(parentLinkage?.dossierReference),
      _normalizeDisplayValue(parentLinkage?.clientReference),
    ].filter(Boolean);
    const links =
      Array.isArray(row?.parentLinks) && row.parentLinks.length > 0
        ? row.parentLinks.map((entry) => _normalizeDisplayValue(entry)).filter(Boolean)
        : fallbackLinks;
    const entityType = _normalizeDisplayValue(row?.entityType);
    return {
      index: index + 1,
      entityType,
      operation: _normalizeDisplayValue(row?.operation) || _normalizeDisplayValue(row?.actionType),
      title:
        _normalizeDisplayValue(row?.title) ||
        _normalizeDisplayValue(row?.label) ||
        (entityType ? `${entityType.replace(/_/g, " ")}` : "Planned change"),
      status: _normalizeDisplayValue(row?.status),
      priority: _normalizeDisplayValue(row?.priority),
      parentLinks: links.length ? links : null,
      explicitFields: Array.isArray(row?.explicitFields) ? row.explicitFields : [],
      defaultedFields: Array.isArray(row?.defaultedFields) ? row.defaultedFields : [],
      inheritedFields: Array.isArray(row?.inheritedFields) ? row.inheritedFields : [],
      inferredFields: Array.isArray(row?.inferredFields) ? row.inferredFields : [],
      correctedFields: Array.isArray(row?.correctedFields) ? row.correctedFields : [],
      fieldDecisionMap:
        row?.fieldDecisionMap && typeof row.fieldDecisionMap === "object" && !Array.isArray(row.fieldDecisionMap)
          ? row.fieldDecisionMap
          : {},
      inferenceSummary:
        row?.inferenceSummary && typeof row.inferenceSummary === "object" && !Array.isArray(row.inferenceSummary)
          ? row.inferenceSummary
          : {},
      warnings: Array.isArray(row?.warnings) ? row.warnings : [],
    };
  });

  return {
    title: _normalizeDisplayValue(workflowPreview?.summaryLine) || _normalizeDisplayValue(proposal?.humanReadableSummary) || "Pending change preview",
    items,
    warnings: [...warnings, ...workflowWarnings],
  };
}

function _toTitleCase(value = "") {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function _humanizeFieldLabel(key = "") {
  const normalized = String(key || "").trim();
  if (!normalized) return "Field";
  const map = {
    client: "Client",
    client_id: "Client",
    dossier: "Dossier",
    dossier_id: "Dossier",
    lawsuit: "Lawsuit",
    lawsuit_id: "Lawsuit",
    type: "Type",
    status: "Status",
    priority: "Priority",
    title: "Title",
    subject: "Subject",
    date: "Date",
    hearing_date: "Hearing Date",
    due_date: "Due Date",
    description: "Description",
    notes: "Notes",
    content: "Content",
    body: "Body",
    reference: "Reference",
    amount: "Amount",
  };
  return map[normalized.toLowerCase()] || _toTitleCase(normalized);
}

function _normalizeStructuredText(value) {
  return String(value || "").replace(/\s+/g, " ").trim() || null;
}

function _stringifyStructuredValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return _normalizeStructuredText(value);
  if (Array.isArray(value)) {
    const parts = value.map((entry) => _stringifyStructuredValue(entry)).filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  if (typeof value === "object") {
    if (typeof value.label === "string" && value.label.trim()) return _normalizeStructuredText(value.label);
    if (typeof value.reference === "string" && value.reference.trim()) return _normalizeStructuredText(value.reference);
    if (typeof value.name === "string" && value.name.trim()) return _normalizeStructuredText(value.name);
    if (typeof value.title === "string" && value.title.trim()) return _normalizeStructuredText(value.title);
    if (typeof value.text === "string" && value.text.trim()) return _normalizeStructuredText(value.text);
    if ("to" in value || "from" in value) return _stringifyStructuredValue(value.to);
  }
  return _normalizeStructuredText(String(value));
}

function _pickStructuredEntityType(proposal = {}, params = {}, workflow = null, affectedEntities = []) {
  const actionType = String(proposal?.actionType || "").toUpperCase();
  if (actionType === "EXECUTE_MUTATION_WORKFLOW") {
    const requestedGoalEntity =
      workflow?.requestedGoal && typeof workflow.requestedGoal === "object"
        ? String(workflow.requestedGoal.entityType || "").trim().toLowerCase()
        : "";
    if (requestedGoalEntity) return requestedGoalEntity;
    const rootEntity =
      workflow?.rootEntity && typeof workflow.rootEntity === "object"
        ? String(workflow.rootEntity.type || "").trim().toLowerCase()
        : "";
    if (rootEntity) return rootEntity;
  }
  const direct = String(
    params?.entityType ||
      params?.target?.type ||
      params?.targetType ||
      params?.sourceType ||
      affectedEntities?.[0]?.type ||
      ""
  )
    .trim()
    .toLowerCase();
  return direct || "record";
}

function _deriveStructuredTitle({
  proposal = null,
  workflowPreview = null,
  previewItems = [],
  entityType = "record",
  payload = {},
  changes = {},
} = {}) {
  const planner = proposal?.confirmation?.preview?.planner;
  const plannerSummary = _normalizeStructuredText(planner?.legalSummary);
  if (plannerSummary) return plannerSummary;

  const structuredPreviewTitle = _normalizeStructuredText(proposal?.preview?.title);
  if (structuredPreviewTitle && structuredPreviewTitle.toLowerCase() !== "pending change preview") {
    return structuredPreviewTitle;
  }

  const firstPreviewTitle = previewItems
    .map((item) => _normalizeStructuredText(item?.title))
    .find(Boolean);
  if (firstPreviewTitle) return firstPreviewTitle;

  const directTitle = [
    payload?.title,
    payload?.subject,
    payload?.name,
    payload?.reference,
    proposal?.params?.title,
    proposal?.params?.reference,
  ]
    .map(_normalizeStructuredText)
    .find(Boolean);
  if (directTitle) return directTitle;

  const updatedFields = Object.keys(changes || {}).map(_humanizeFieldLabel);
  const summary = _normalizeStructuredText(workflowPreview?.summaryLine || proposal?.humanReadableSummary);
  if (summary) return summary;
  if (updatedFields.length > 0) {
    return `${_toActionVerb(_toOperationLabel(proposal?.actionType))} ${updatedFields.slice(0, 2).join(" and ")} for ${_toTitleCase(entityType)}`;
  }
  return `${_toActionVerb(_toOperationLabel(proposal?.actionType))} ${_toTitleCase(entityType)}`;
}

function _deriveStructuredSubtitle({
  proposal = null,
  entityType = "record",
  payload = {},
  changes = {},
  affectedEntities = [],
  previewItems = [],
} = {}) {
  const action = _toActionVerb(_toOperationLabel(proposal?.actionType));
  const entityLabel = _toTitleCase(entityType) || "record";
  const primaryParent = affectedEntities.find((entry) =>
    ["dossier", "lawsuit", "client"].includes(String(entry?.type || "").toLowerCase()),
  );
  const parentLabel = _normalizeStructuredText(primaryParent?.reference || primaryParent?.label);
  const plannerSummary = _normalizeStructuredText(
    proposal?.confirmation?.preview?.planner?.semanticProfile?.summary,
  );
  if (plannerSummary) return plannerSummary;
  if (action.toLowerCase() === "create" && parentLabel) {
    return `A new ${entityLabel.toLowerCase()} will be attached to ${parentLabel}.`;
  }
  if (action.toLowerCase() === "delete") {
    return `This will permanently remove the selected ${entityLabel.toLowerCase()}.`;
  }
  const changeKeys = Object.keys(changes || {}).map(_humanizeFieldLabel);
  if (changeKeys.length > 0) {
    return `This updates ${changeKeys.slice(0, 3).join(", ").toLowerCase()} for the selected ${entityLabel.toLowerCase()}.`;
  }
  if (previewItems.length > 1) {
    return `This applies ${previewItems.length} related changes before the request is completed.`;
  }
  const status = _stringifyStructuredValue(payload?.status || changes?.status?.to);
  if (status) {
    return `This sets the ${entityLabel.toLowerCase()} status to ${status}.`;
  }
  return `${action} this ${entityLabel.toLowerCase()} after you confirm.`;
}

function _pushStructuredField(fields, key, label, value) {
  const normalizedValue = _stringifyStructuredValue(value);
  if (!normalizedValue) return;
  if (fields.some((entry) => entry.key === key || entry.value === normalizedValue)) return;
  fields.push({
    key,
    label: label || _humanizeFieldLabel(key),
    value: normalizedValue,
  });
}

function _buildStructuredFields({
  proposal = null,
  params = {},
  entityType = "record",
  payload = {},
  changes = {},
  affectedEntities = [],
  previewItems = [],
} = {}) {
  const fields = [];
  _pushStructuredField(fields, "type", "Type", _toTitleCase(entityType));

  const affectedByType = new Map();
  for (const entry of Array.isArray(affectedEntities) ? affectedEntities : []) {
    const type = String(entry?.type || "").trim().toLowerCase();
    if (!type || affectedByType.has(type)) continue;
    affectedByType.set(type, entry);
  }

  const clientEntry = affectedByType.get("client");
  const dossierEntry = affectedByType.get("dossier");
  const lawsuitEntry = affectedByType.get("lawsuit");
  _pushStructuredField(fields, "client", "Client", clientEntry?.label || clientEntry?.reference || payload?.client || params?.client);
  _pushStructuredField(fields, "dossier", "Dossier", dossierEntry?.label || dossierEntry?.reference || payload?.dossier || params?.dossier);
  _pushStructuredField(fields, "lawsuit", "Lawsuit", lawsuitEntry?.label || lawsuitEntry?.reference || payload?.lawsuit || params?.lawsuit);

  const explicitFieldOrder = ["status", "priority", "date", "hearing_date", "due_date", "reference", "title"];
  for (const key of explicitFieldOrder) {
    const nextValue =
      payload?.[key] ??
      payload?.[key.replace(/_([a-z])/g, (_, char) => char.toUpperCase())] ??
      params?.[key] ??
      changes?.[key]?.to ??
      null;
    _pushStructuredField(fields, key, _humanizeFieldLabel(key), nextValue);
  }

  const previewFieldSource = previewItems?.[0]?.fields && typeof previewItems[0].fields === "object"
    ? previewItems[0].fields
    : {};
  for (const [key, value] of Object.entries(previewFieldSource)) {
    if (/(_id$|^id$)/i.test(key)) continue;
    _pushStructuredField(fields, key, _humanizeFieldLabel(key), value);
  }

  for (const [key, diff] of Object.entries(changes || {})) {
    if (/(_id$|^id$|^body$|^content$|^description$|^notes?$|^text$)/i.test(key)) continue;
    const nextValue = diff && typeof diff === "object" && "to" in diff ? diff.to : diff;
    _pushStructuredField(fields, key, _humanizeFieldLabel(key), nextValue);
  }

  for (const [key, value] of Object.entries(payload || {})) {
    if (/(_id$|^id$|^body$|^content$|^description$|^notes?$|^text$|^entityType$)/i.test(key)) continue;
    _pushStructuredField(fields, key, _humanizeFieldLabel(key), value);
  }

  if (fields.length === 1) {
    const fallbackId = params?.entityId || params?.target?.id || affectedEntities?.[0]?.id || null;
    if (fallbackId) {
      _pushStructuredField(fields, "reference", "Reference", `#${fallbackId}`);
    }
  }

  return fields.slice(0, 8);
}

function _buildStructuredContentPreview({ payload = {}, changes = {}, previewItems = [], proposal = null } = {}) {
  const candidates = [
    ["Note Content", payload?.body],
    ["Note Content", payload?.content],
    ["Note Content", payload?.description],
    ["Note Content", payload?.note],
    ["Note Content", payload?.notes],
    ["Note Content", payload?.text],
    ["Note Content", changes?.body?.to],
    ["Note Content", changes?.content?.to],
    ["Note Content", changes?.description?.to],
    ["Note Content", changes?.note?.to],
    ["Note Content", changes?.notes?.to],
    ["Note Content", changes?.text?.to],
    ["Note Content", proposal?.confirmation?.preview?.planner?.legalSummary],
  ];
  for (const [label, value] of candidates) {
    const text = _normalizeStructuredText(value);
    if (text) return { label, text };
  }
  const previewTitle = _normalizeStructuredText(previewItems?.[0]?.title);
  if (previewTitle) return { label: "Summary", text: previewTitle };
  return null;
}

function _buildStructuredResultTarget({ entityType = "record", params = {}, affectedEntities = [], rawAffectedEntities = [] } = {}) {
  const targetCandidates = [
    params?.target && typeof params.target === "object" ? params.target : null,
    rawAffectedEntities.find((entry) => String(entry?.type || "").toLowerCase() === "dossier") || null,
    rawAffectedEntities.find((entry) => String(entry?.type || "").toLowerCase() === "lawsuit") || null,
    rawAffectedEntities.find((entry) => String(entry?.type || "").toLowerCase() === "client") || null,
    rawAffectedEntities.find((entry) => String(entry?.type || "").toLowerCase() === entityType) || null,
    affectedEntities.find((entry) => String(entry?.type || "").toLowerCase() === "dossier") || null,
    affectedEntities.find((entry) => String(entry?.type || "").toLowerCase() === "lawsuit") || null,
    affectedEntities.find((entry) => String(entry?.type || "").toLowerCase() === "client") || null,
    affectedEntities.find((entry) => String(entry?.type || "").toLowerCase() === entityType) || null,
  ].filter(Boolean);

  const match = targetCandidates.find((entry) => {
    const id = Number(entry?.id);
    return (Number.isInteger(id) && id > 0) || String(entry?.label || entry?.reference || "").trim();
  });
  if (!match) return null;
  return {
    type: String(match.type || entityType || "record").trim().toLowerCase(),
    ...(match.id !== undefined && match.id !== null ? { id: match.id } : {}),
    label: _normalizeStructuredText(match.label || match.reference || `${_toTitleCase(match.type || entityType)}`),
  };
}

function _buildStructuredProposal({ proposal = null, displayProposal = null, workflowPreview = null } = {}) {
  const params =
    displayProposal?.params && typeof displayProposal.params === "object" && !Array.isArray(displayProposal.params)
      ? displayProposal.params
      : {};
  const payload =
    params?.payload && typeof params.payload === "object" && !Array.isArray(params.payload)
      ? params.payload
      : {};
  const changes =
    params?.changes && typeof params.changes === "object" && !Array.isArray(params.changes)
      ? params.changes
      : {};
  const affectedEntities = Array.isArray(displayProposal?.affectedEntities) ? displayProposal.affectedEntities : [];
  const rawAffectedEntities = Array.isArray(proposal?.affectedEntities) ? proposal.affectedEntities : [];
  const previewItems = Array.isArray(workflowPreview?.previewItems) ? workflowPreview.previewItems : [];
  const workflow =
    params?.workflow && typeof params.workflow === "object" && !Array.isArray(params.workflow)
      ? params.workflow
      : null;
  const entityType = _pickStructuredEntityType(proposal, params, workflow, affectedEntities);
  const title = _deriveStructuredTitle({
    proposal: displayProposal,
    workflowPreview,
    previewItems,
    entityType,
    payload,
    changes,
  });
  return {
    verb: _toOperationLabel(proposal?.actionType),
    entityType,
    reversible: typeof proposal?.reversible === "boolean" ? proposal.reversible : null,
    title,
    subtitle: _deriveStructuredSubtitle({
      proposal: displayProposal,
      entityType,
      payload,
      changes,
      affectedEntities,
      previewItems,
    }),
    fields: _buildStructuredFields({
      proposal: displayProposal,
      params,
      entityType,
      payload,
      changes,
      affectedEntities,
      previewItems,
    }),
    contentPreview: _buildStructuredContentPreview({ payload, changes, previewItems, proposal: displayProposal }) || undefined,
    resultTarget: _buildStructuredResultTarget({ entityType, params, affectedEntities, rawAffectedEntities }) || undefined,
  };
}

function toProposalArtifact(proposal, sessionId) {
  const passthroughType = String(proposal?.type || "").toLowerCase();
  if (["identity_collision", "context_suggestion", "entity_creation_form", "error"].includes(passthroughType)) {
    return {
      ...proposal,
      sessionId: proposal?.sessionId || sessionId || null,
    };
  }
  const rawParams =
    proposal?.params && typeof proposal.params === "object" && !Array.isArray(proposal.params)
      ? proposal.params
      : {};
  const workflow =
    rawParams?.workflow && typeof rawParams.workflow === "object" && !Array.isArray(rawParams.workflow)
      ? rawParams.workflow
      : null;
  const inferredWorkflowEntityType =
    (workflow?.requestedGoal && typeof workflow.requestedGoal === "object"
      ? String(workflow.requestedGoal.entityType || "").trim().toLowerCase()
      : "") ||
    (Array.isArray(workflow?.steps)
      ? workflow.steps
          .map((step) =>
            step?.params && typeof step.params === "object"
              ? String(step.params.entityType || "").trim().toLowerCase()
              : "",
          )
          .find(Boolean) || ""
      : "");
  const normalizedParams = {
    ...rawParams,
    ...(String(rawParams?.entityType || "").trim()
      ? {}
      : inferredWorkflowEntityType
        ? { entityType: inferredWorkflowEntityType }
        : {}),
  };
  const displayProposal = sanitizeForDisplay({
    ...proposal,
    params: normalizedParams,
    humanReadableSummary: buildProposalDisplaySummary(proposal),
  });
  const workflowPreview =
    String(proposal?.actionType || "").toUpperCase() === "EXECUTE_MUTATION_WORKFLOW"
      ? _buildWorkflowPreview(
          workflow,
          Array.isArray(displayProposal?.affectedEntities) ? displayProposal.affectedEntities : [],
          String(displayProposal?.humanReadableSummary || "").trim(),
          rawParams?.preview && typeof rawParams.preview === "object" ? rawParams.preview : null,
        )
      : null;
  const displaySummary =
    workflowPreview?.detailedSummary || displayProposal?.humanReadableSummary || "";
  const proposalPreview = _buildProposalPreview({
    proposal: displayProposal,
    workflowPreview,
  });
  const structured = _buildStructuredProposal({
    proposal,
    displayProposal,
    workflowPreview,
  });

  const artifact = {
    type: "proposal",
    sessionId: sessionId || null,
    proposals: [
      {
        proposalId: proposal.proposalId,
        status: proposal.status,
        actionType: proposal.actionType,
        requiresConfirmation: proposal.requiresConfirmation,
        humanReadableSummary: displaySummary,
        affectedEntities: Array.isArray(displayProposal?.affectedEntities)
          ? displayProposal.affectedEntities
          : [],
        reversible: proposal.reversible,
        version: proposal.version,
        posture: proposal.posture,
        confirmation:
          displayProposal?.confirmation && typeof displayProposal.confirmation === "object"
            ? displayProposal.confirmation
            : null,
        snapshot:
          displayProposal?.snapshot && typeof displayProposal.snapshot === "object"
            ? displayProposal.snapshot
            : null,
        sessionId: proposal.sessionId || sessionId || null,
        params:
          displayProposal?.params && typeof displayProposal.params === "object"
            ? displayProposal.params
            : {},
        preview: proposalPreview,
        structured,
        workflowPreview,
        previewItems: Array.isArray(workflowPreview?.previewItems) ? workflowPreview.previewItems : [],
      },
    ],
  };

  if (PROPOSAL_DEBUG_ENABLED) {
    try {
      const first = artifact.proposals?.[0] || {};
      const confirmation = first.confirmation || null;
      console.warn("[agent-proposal-debug]", {
        source: "toProposalArtifact",
        actionType: first.actionType || null,
        proposalId: first.proposalId || null,
        hasConfirmation: Boolean(confirmation),
        confirmationKeys: confirmation ? Object.keys(confirmation) : [],
        extraRiskAck: confirmation?.extraRiskAck === true,
      });
    } catch (_) {}
  }

  try {
    const first = artifact.proposals?.[0] || {};
    if (first?.requiresConfirmation) {
      console.warn("[CONFIRM_DEBUG][backend][proposalArtifact]", {
        proposalId: first.proposalId || null,
        actionType: first.actionType || null,
        humanReadableSummary: first.humanReadableSummary || null,
        reversible: first.reversible,
        confirmation: first.confirmation || null,
        affectedEntities: first.affectedEntities || [],
        workflow: first.params?.workflow || null,
        preview: first.preview || null,
        params: first.params || null,
      });
    }
  } catch (_) {}

  if (PROPOSAL_DEBUG_ENABLED) {
    try {
      const first = artifact.proposals?.[0] || {};
      const workflowSteps = Array.isArray(first?.params?.workflow?.steps) ? first.params.workflow.steps : [];
      const previewItems = Array.isArray(first?.preview?.items) ? first.preview.items : [];
      console.warn("[PROPOSAL_PREVIEW_DEBUG][backend]", {
        proposalId: first?.proposalId || null,
        actionType: first?.actionType || null,
        workflowStepCount: workflowSteps.length,
        workflowFirstStep: workflowSteps[0] || null,
        previewShape: {
          title: first?.preview?.title || null,
          itemCount: previewItems.length,
          firstItem: previewItems[0] || null,
          warningCount: Array.isArray(first?.preview?.warnings) ? first.preview.warnings.length : 0,
        },
      });
    } catch (_) {}
  }

  return artifact;
}

module.exports = {
  toProposalArtifact,
};
