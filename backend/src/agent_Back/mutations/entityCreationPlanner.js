"use strict";

const { generateChatResponse } = require("../llm.client");
const { parseJsonResponse } = require("../llm/llm.validation");
const { getAllowedFields, validatePayload } = require("../engine/entityAdapters");

const PLACEHOLDER_PATTERNS = [
  /user requested/i,
  /update in conversation/i,
  /\bnew item\b/i,
  /\bplaceholder\b/i,
  /\btbd\b/i,
];

const ENTITY_CREATION_SPECS = Object.freeze({
  client: {
    defaults: { status: "active", priority: "medium" },
    criticalSemantic: [],
    blockingFields: ["name"],
    inferableFields: ["status", "priority"],
    optionalFields: ["email", "phone", "address"],
  },
  dossier: {
    defaults: { status: "open", priority: "medium", phase: "initiation" },
    criticalSemantic: ["case_type_or_category"],
    blockingFields: ["client_id"],
    inferableFields: ["category", "title", "phase", "priority", "status", "description"],
    optionalFields: ["opposing_party", "jurisdiction", "court", "notes"],
  },
  lawsuit: {
    defaults: { status: "open", priority: "medium" },
    criticalSemantic: ["case_type_or_category"],
    blockingFields: ["dossier_id"],
    inferableFields: ["title", "status", "priority"],
    optionalFields: ["court", "hearing_date", "opposing_party"],
  },
  task: {
    defaults: { status: "pending", priority: "medium" },
    criticalSemantic: ["title_or_goal"],
    blockingFields: [],
    inferableFields: ["title", "status", "priority"],
    optionalFields: ["due_date", "assigned_to", "description"],
  },
  personal_task: {
    defaults: { status: "pending", priority: "medium" },
    criticalSemantic: ["title_or_goal"],
    blockingFields: [],
    inferableFields: ["title", "status", "priority"],
    optionalFields: ["due_date", "description"],
  },
  mission: {
    defaults: { status: "planned", priority: "medium" },
    criticalSemantic: ["title_or_goal"],
    blockingFields: [],
    inferableFields: ["title", "status", "priority"],
    optionalFields: ["description"],
  },
  session: {
    defaults: { status: "scheduled", priority: "medium" },
    criticalSemantic: ["title_or_goal"],
    blockingFields: [],
    inferableFields: ["title", "status", "priority"],
    optionalFields: ["scheduled_at", "location", "description"],
  },
  financial_entry: {
    defaults: { priority: "medium" },
    criticalSemantic: ["entry_type_or_purpose"],
    blockingFields: [],
    inferableFields: ["title", "priority"],
    optionalFields: ["amount", "description"],
  },
  document: {
    defaults: {},
    criticalSemantic: ["title_or_kind"],
    blockingFields: [],
    inferableFields: ["title", "description"],
    optionalFields: ["status", "reference"],
  },
  note: {
    defaults: {},
    criticalSemantic: ["content_or_summary"],
    blockingFields: [],
    inferableFields: ["content", "title"],
    optionalFields: [],
  },
});

const DOSSIER_HIGH_CONFIDENCE_RULES = [
  { test: /\b(divorce|custody|alimony|marriage breakdown|parenting plan)\b/i, category: "Family Law", subtype: "Divorce", tags: ["family-law", "divorce"] },
  { test: /\b(criminal|assault|theft|police|prosecutor)\b/i, category: "Criminal", subtype: "Criminal", tags: ["criminal-law"] },
  { test: /\b(contract|breach|agreement|invoice dispute|commercial dispute)\b/i, category: "Civil / Contract", subtype: "Contract", tags: ["civil", "contract"] },
  { test: /\b(employment|dismissal|labor|labour|termination)\b/i, category: "Labor", subtype: "Labor", tags: ["labor-law"] },
  { test: /\b(immigration|visa|residency|residence permit)\b/i, category: "Immigration", subtype: "Immigration", tags: ["immigration"] },
];

function normalizeText(value) {
  return String(value || "").trim();
}

function lower(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeEntityType(value) {
  return String(value || "").trim().toLowerCase();
}

function isPlaceholderText(value) {
  const text = normalizeText(value);
  if (!text) return true;
  return PLACEHOLDER_PATTERNS.some((p) => p.test(text));
}

function containsPlaceholderDeep(value) {
  if (value == null) return false;
  if (typeof value === "string") return isPlaceholderText(value);
  if (Array.isArray(value)) return value.some(containsPlaceholderDeep);
  if (typeof value === "object") return Object.values(value).some(containsPlaceholderDeep);
  return false;
}

function parseClientNameFromContext(conversationContext, extractedSignals = {}) {
  const explicit = normalizeText(
    extractedSignals?.parentLabel ||
    extractedSignals?.parentName ||
    extractedSignals?.resolvedEntityContext?.parent?.label,
  );
  if (explicit) return explicit;
  const text = String(conversationContext || "");
  const m1 = text.match(
    /\bmy\s+client\s+(.+?)(?:\s+is\b|\s+has\b|\s+will\b|\s+going\b|\s+he(?:['’]s|\s+is)\b|\s+she(?:['’]s|\s+is)\b|\s+they(?:['’]ve|\s+have|['’]re|\s+are)\b|\s*[—–-]\s*|[,:;.]|$)/iu,
  );
  if (m1?.[1]) return normalizeText(m1[1]);
  const m2 = text.match(/\bfor\s+([A-Za-z][\p{L}\p{N}' -]{1,80})(?:\s+(?:can|please|so|who|with|on|its|it's)\b|[,.?!]|$)/iu);
  if (m2?.[1]) return normalizeText(m2[1]);
  return "";
}

function inferUrgency(conversationContext) {
  const text = lower(conversationContext);
  if (/\b(urgent|asap|immediately|today|emergency)\b/.test(text)) return "high";
  if (/\b(low priority|whenever|not urgent)\b/.test(text)) return "low";
  return "medium";
}

function baselineSemanticProfile(entityType, conversationContext, extractedSignals = {}) {
  const normalizedType = normalizeEntityType(entityType);
  const spec = ENTITY_CREATION_SPECS[normalizedType] || { defaults: {} };
  const title = normalizeText(extractedSignals?.seedTitle) || `${normalizedType.replace(/_/g, " ")} draft`;
  return {
    entityType: normalizedType,
    title,
    category: null,
    subtype: null,
    priority: spec.defaults.priority || inferUrgency(conversationContext),
    phaseOrState: spec.defaults.phase || spec.defaults.status || null,
    tags: [],
    summary: `Create a ${normalizedType.replace(/_/g, " ")} based on the chat request.`,
    assumptions: [],
    missingCritical: [],
    missingOptional: Array.isArray(spec.optionalFields) ? [...spec.optionalFields] : [],
  };
}

function detectDossierDomain(conversationContext = "") {
  const text = String(conversationContext || "");
  const matches = DOSSIER_HIGH_CONFIDENCE_RULES.filter((r) => r.test.test(text));
  if (matches.length !== 1) return null;
  return matches[0];
}

function extractTimelineMarkers(conversationContext = "") {
  const text = String(conversationContext || "");
  const markers = [];
  const marriageYear = text.match(/\bmarried\s+since\s+(\d{4})\b/i);
  if (marriageYear?.[1]) markers.push(`Married since ${marriageYear[1]}`);
  const separatedSince = text.match(/\b(?:lived\s+apart|separated)\s+since\s+([A-Za-z]+\s+\d{4}|[A-Za-z]+)\b/i);
  if (separatedSince?.[1]) markers.push(`Separated since ${normalizeText(separatedSince[1])}`);
  if (/\bcounsel(?:ing|ling)\b/i.test(text)) markers.push("Prior counseling attempt mentioned");
  return markers;
}

function deriveDossierLegalFraming(conversationContext = "", extractedSignals = {}) {
  const text = String(conversationContext || "");
  const lowerText = lower(text);
  const clientName = parseClientNameFromContext(text, extractedSignals);
  const domain = detectDossierDomain(text);
  const urgency = inferUrgency(text);
  const timeline = extractTimelineMarkers(text);

  const focus = [];
  if (/\b(child|children|custody|parenting plan|visitation|see[s]?\s+the\s+children)\b/i.test(text)) {
    focus.push("Parenting arrangements and child contact / custody planning");
  }
  if (/\bdebt\b/i.test(text) || /\bran up debt in his name\b/i.test(lowerText)) {
    focus.push("Debt allocation and liabilities incurred in the client's name");
  }
  if (/\basset\b/i.test(text) || /\beven split\b/i.test(lowerText) || /\bproperty\b/i.test(text)) {
    focus.push("Asset division and marital property split");
  }
  if (/\bmoved away\b/i.test(text) || /\blived apart\b/i.test(text) || /\bseparat/i.test(text)) {
    focus.push("Separation circumstances and timeline");
  }
  if (focus.length === 0 && domain) {
    focus.push(`${domain.subtype} matter intake and initial filing preparation`);
  }
  for (const marker of timeline) {
    focus.push(`Timeline marker: ${marker}`);
  }

  const subtype = domain?.subtype || null;
  const category = domain?.category || null;
  const tags = Array.isArray(domain?.tags) ? domain.tags : [];
  const title = clientName && subtype ? `${subtype} - ${clientName}` : clientName ? `Dossier - ${clientName}` : subtype ? `${subtype} dossier` : "Legal dossier";

  const legalSummaryParts = [];
  if (clientName) legalSummaryParts.push(`New matter for ${clientName}`);
  else legalSummaryParts.push("New legal matter intake");
  if (subtype) legalSummaryParts.push(`${subtype} matter`);
  if (/\bchildren?\b/i.test(text) || /\bparenting plan\b/i.test(text)) {
    legalSummaryParts.push("with child-related parenting arrangements requested");
  }
  if (/\bdebt\b/i.test(text)) {
    legalSummaryParts.push("and disputed debt/liability concerns");
  }
  const legalSummary = legalSummaryParts.join(", ").replace(/\s+,/g, ",") + ".";

  const suggestedNextSteps = [];
  if (subtype && /divorce/i.test(subtype)) {
    suggestedNextSteps.push("Prepare an initial divorce petition / filing draft");
  }
  if (focus.some((f) => /Parenting/.test(f))) {
    suggestedNextSteps.push("Prepare a preliminary parenting plan framework and custody/visitation points");
  }
  if (focus.some((f) => /Debt allocation/.test(f))) {
    suggestedNextSteps.push("Collect debt statements and documents supporting liabilities in the client's name");
  }
  if (focus.some((f) => /Asset division/.test(f))) {
    suggestedNextSteps.push("Prepare an initial asset and debt inventory for division discussions");
  }
  if (suggestedNextSteps.length === 0) {
    suggestedNextSteps.push("Prepare the initial case intake note and opening checklist");
  }

  const riskSignals = [];
  if (/\bdebt\b/i.test(text)) riskSignals.push("Debt/liability exposure");
  if (/\bchildren?\b/i.test(text)) riskSignals.push("Child custody / parenting arrangements");
  if (/\bmoved away\b/i.test(text)) riskSignals.push("Potential jurisdiction / residence coordination issues");

  return {
    category,
    subtype,
    tags,
    title,
    priority: urgency,
    legalSummary,
    caseFocusPoints: focus,
    suggestedNextSteps,
    riskSignals,
    timeline,
    clientName,
  };
}

function buildPlannerPrompt({ entityType, conversationContext, extractedSignals, allowedCreateFields, requiredCreateFields }) {
  const spec = ENTITY_CREATION_SPECS[normalizeEntityType(entityType)] || { defaults: {}, criticalSemantic: [] };
  const parent = extractedSignals?.parent || null;
  const parentContext = parent
    ? `Parent context: ${JSON.stringify(parent)}`
    : "Parent context: none";
  return [
    "You are a legal operations entity creation planner.",
    "Return EXACTLY ONE JSON OBJECT and nothing else.",
    "Do not use markdown fences. Do not prefix or suffix the JSON with commentary.",
    "If you are unsure, return decision='clarify' with clarificationQuestions instead of placeholders.",
    `Target entityType: ${entityType}`,
    `Allowed create fields: ${JSON.stringify(allowedCreateFields || [])}`,
    `Required create fields: ${JSON.stringify(requiredCreateFields || [])}`,
    `Entity defaults: ${JSON.stringify(spec.defaults || {})}`,
    `Critical semantic info: ${JSON.stringify(spec.criticalSemantic || [])}`,
    parentContext,
    `Conversation context: ${conversationContext}`,
    "JSON schema:",
    JSON.stringify({
      decision: "proceed",
      semanticProfile: {
        entityType,
        title: "string",
        category: "string|null",
        subtype: "string|null",
        priority: "string|null",
        phaseOrState: "string|null",
        tags: ["string"],
        summary: "string",
        assumptions: ["string"],
        missingCritical: ["string"],
        missingOptional: ["string"],
      },
      legalSummary: "string",
      caseFocusPoints: ["string"],
      suggestedNextSteps: ["string"],
      riskSignals: ["string"],
      payloadCandidate: { anyAllowedField: "value" },
      clarificationQuestions: ["string"],
      suggestedChildren: [{ entityType: "task", payload: { title: "..." }, rationale: "..." }],
      riskFlags: ["string"],
      confidence: 0.0,
    }),
    "Valid example (proceed):",
    JSON.stringify({
      decision: "proceed",
      semanticProfile: {
        entityType,
        title: "Divorce - Client Name",
        category: "Family Law",
        subtype: "Divorce",
        priority: "medium",
        phaseOrState: "initiation",
        tags: ["family-law", "divorce"],
        summary: "Create a divorce dossier for the client based on the intake narrative.",
        assumptions: ["Defaulting phase to initiation."],
        missingCritical: [],
      },
      payloadCandidate: { title: "Divorce - Client Name", category: "Family Law", phase: "initiation", priority: "medium", status: "open" },
      clarificationQuestions: [],
      suggestedChildren: [],
      riskFlags: [],
      confidence: 0.88,
    }),
    "Valid example (clarify):",
    JSON.stringify({
      decision: "clarify",
      semanticProfile: {
        entityType,
        title: "Dossier draft",
        category: null,
        subtype: null,
        priority: "medium",
        phaseOrState: "initiation",
        tags: [],
        summary: "Prepare a dossier draft once the case type is confirmed.",
        assumptions: [],
        missingCritical: ["case_type_or_category"],
      },
      payloadCandidate: {},
      clarificationQuestions: ["What type of case is this (family/divorce, criminal, civil/contract, labor, etc.)?"],
      suggestedChildren: [],
      riskFlags: [],
      confidence: 0.75,
    }),
    "Rules:",
    "- If critical domain information is missing, set decision='clarify' and provide clarificationQuestions.",
    "- Infer/default non-blocking fields when confidence is high, and record assumptions + missingOptional instead of asking for everything.",
    "- Do not use placeholders like 'User requested update in conversation', 'new item', 'TBD', or 'placeholder'.",
    "- payloadCandidate must only include fields likely valid for the target entity.",
    "- semanticProfile.summary must be a concise, structured legal operations summary.",
  ].join("\n");
}

function summarizeRawPlannerOutput(raw, limit = 500) {
  const text = normalizeText(raw);
  if (!text) return null;
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function extractFirstJsonObjectText(raw) {
  const text = String(raw || "");
  if (!text.trim()) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidateSource = fenced?.[1] ? fenced[1] : text;

  const start = candidateSource.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidateSource.length; i += 1) {
    const ch = candidateSource[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return candidateSource.slice(start, i + 1);
    }
  }
  return null;
}

function parsePlannerJsonWithRecovery(raw) {
  try {
    return parseJsonResponse(raw);
  } catch (primaryError) {
    const recoveredText = extractFirstJsonObjectText(raw);
    if (!recoveredText) throw primaryError;
    try {
      return parseJsonResponse(recoveredText);
    } catch (secondaryError) {
      secondaryError.recoveryAttempted = true;
      secondaryError.recoveredText = recoveredText;
      throw secondaryError;
    }
  }
}

function coercePlannerOutput(raw, { entityType }) {
  const normalizedType = normalizeEntityType(entityType);
  const semanticProfileInput = raw?.semanticProfile && typeof raw.semanticProfile === "object" ? raw.semanticProfile : {};
  const semanticProfile = {
    entityType: normalizedType,
    title: normalizeText(semanticProfileInput.title),
    category: normalizeText(semanticProfileInput.category) || null,
    subtype: normalizeText(semanticProfileInput.subtype) || null,
    priority: normalizeText(semanticProfileInput.priority) || null,
    phaseOrState: normalizeText(semanticProfileInput.phaseOrState) || null,
    tags: Array.isArray(semanticProfileInput.tags)
      ? semanticProfileInput.tags.map((v) => normalizeText(v)).filter(Boolean)
      : [],
    summary: normalizeText(semanticProfileInput.summary),
    assumptions: Array.isArray(semanticProfileInput.assumptions)
      ? semanticProfileInput.assumptions.map((v) => normalizeText(v)).filter(Boolean)
      : [],
    missingCritical: Array.isArray(semanticProfileInput.missingCritical)
      ? semanticProfileInput.missingCritical.map((v) => normalizeText(v)).filter(Boolean)
      : [],
    missingOptional: Array.isArray(semanticProfileInput.missingOptional)
      ? semanticProfileInput.missingOptional.map((v) => normalizeText(v)).filter(Boolean)
      : [],
  };
  return {
    decision: normalizeText(raw?.decision).toLowerCase() === "clarify" ? "clarify" : "proceed",
    semanticProfile,
    payloadCandidate:
      raw?.payloadCandidate && typeof raw.payloadCandidate === "object" && !Array.isArray(raw.payloadCandidate)
        ? { ...raw.payloadCandidate }
        : {},
    clarificationQuestions: Array.isArray(raw?.clarificationQuestions)
      ? raw.clarificationQuestions.map((v) => normalizeText(v)).filter(Boolean)
      : [],
    suggestedChildren: Array.isArray(raw?.suggestedChildren)
      ? raw.suggestedChildren
          .filter((v) => v && typeof v === "object")
          .map((v) => ({
            entityType: normalizeEntityType(v.entityType),
            payload: v.payload && typeof v.payload === "object" && !Array.isArray(v.payload) ? v.payload : {},
            rationale: normalizeText(v.rationale) || undefined,
          }))
          .filter((v) => v.entityType)
      : [],
    riskFlags: Array.isArray(raw?.riskFlags) ? raw.riskFlags.map((v) => normalizeText(v)).filter(Boolean) : [],
    legalSummary: normalizeText(raw?.legalSummary),
    caseFocusPoints: Array.isArray(raw?.caseFocusPoints)
      ? raw.caseFocusPoints.map((v) => normalizeText(v)).filter(Boolean)
      : [],
    suggestedNextSteps: Array.isArray(raw?.suggestedNextSteps)
      ? raw.suggestedNextSteps.map((v) => normalizeText(v)).filter(Boolean)
      : [],
    riskSignals: Array.isArray(raw?.riskSignals)
      ? raw.riskSignals.map((v) => normalizeText(v)).filter(Boolean)
      : [],
    confidence: Number.isFinite(Number(raw?.confidence)) ? Math.max(0, Math.min(1, Number(raw.confidence))) : 0.5,
  };
}

function validatePlannerResult(result, { entityType, allowedCreateFields }) {
  const errors = [];
  if (!result || typeof result !== "object") errors.push("result_invalid");
  if (!result.semanticProfile || typeof result.semanticProfile !== "object") errors.push("semantic_profile_missing");
  if (!normalizeText(result?.semanticProfile?.title)) errors.push("semantic_title_missing");
  if (!normalizeText(result?.semanticProfile?.summary)) errors.push("semantic_summary_missing");
  if (!normalizeText(result?.legalSummary)) errors.push("legal_summary_missing");
  if (!Array.isArray(result?.caseFocusPoints) || result.caseFocusPoints.length === 0) errors.push("case_focus_missing");
  if (!Array.isArray(result?.suggestedNextSteps) || result.suggestedNextSteps.length === 0) errors.push("next_steps_missing");
  if (containsPlaceholderDeep(result)) errors.push("placeholder_text_detected");
  if (result.decision === "clarify" && (!Array.isArray(result.clarificationQuestions) || result.clarificationQuestions.length === 0)) {
    errors.push("clarification_questions_missing");
  }
  if (result.decision === "proceed") {
    if (!result.payloadCandidate || typeof result.payloadCandidate !== "object" || Array.isArray(result.payloadCandidate)) {
      errors.push("payload_candidate_missing");
    }
    if (allowedCreateFields && Array.isArray(allowedCreateFields) && Object.keys(result.payloadCandidate || {}).some((k) => !allowedCreateFields.includes(k))) {
      // allowed; filtered later. Keep as warning-like validation issue only if all keys invalid.
      const validKeys = Object.keys(result.payloadCandidate || {}).filter((k) => allowedCreateFields.includes(k));
      if (validKeys.length === 0) errors.push("payload_candidate_no_allowed_fields");
    }
  }
  return { ok: errors.length === 0, errors };
}

function filterPayloadToAllowed(payloadCandidate, allowedFields) {
  const allowed = new Set(Array.isArray(allowedFields) ? allowedFields : []);
  const out = {};
  for (const [k, v] of Object.entries(payloadCandidate || {})) {
    if (v === undefined) continue;
    if (allowed.size === 0 || allowed.has(k)) out[k] = v;
  }
  return out;
}

function buildValidationPayloadWithResolvedParent(entityType, payload, extractedSignals = {}, resolvedEntityContext = null) {
  const out = { ...(payload || {}) };
  const parent =
    (extractedSignals && extractedSignals.parent && typeof extractedSignals.parent === "object" ? extractedSignals.parent : null) ||
    (resolvedEntityContext && resolvedEntityContext.parent && typeof resolvedEntityContext.parent === "object" ? resolvedEntityContext.parent : null);
  if (!parent) return out;
  const parentType = normalizeEntityType(parent.entityType);
  const parentId = Number(parent.entityId);
  if (!Number.isInteger(parentId) || parentId <= 0) return out;
  if (entityType === "dossier" && parentType === "client" && !out.client_id) out.client_id = parentId;
  if (entityType === "lawsuit" && parentType === "dossier" && !out.dossier_id) out.dossier_id = parentId;
  if (entityType === "task") {
    if (parentType === "dossier" && !out.dossier_id && !out.lawsuit_id) out.dossier_id = parentId;
    if (parentType === "lawsuit" && !out.lawsuit_id && !out.dossier_id) out.lawsuit_id = parentId;
  }
  if (entityType === "session") {
    if (parentType === "dossier" && !out.dossier_id && !out.lawsuit_id) out.dossier_id = parentId;
    if (parentType === "lawsuit" && !out.lawsuit_id && !out.dossier_id) out.lawsuit_id = parentId;
  }
  if (entityType === "mission") {
    if (parentType === "dossier" && !out.dossier_id && !out.lawsuit_id) out.dossier_id = parentId;
    if (parentType === "lawsuit" && !out.lawsuit_id && !out.dossier_id) out.lawsuit_id = parentId;
  }
  return out;
}

function findRequiredFieldMessage(err) {
  const msg = normalizeText(err?.message);
  if (!msg) return null;
  const m = msg.match(/^([a-z_]+)\s+is required$/i);
  return m ? String(m[1]).toLowerCase() : null;
}

function buildClarificationForValidation({ entityType, missingField }) {
  const typeLabel = String(entityType || "record").replace(/_/g, " ");
  if (entityType === "dossier" && (missingField === "category" || missingField === "title")) {
    return "What type of case is this dossier (for example divorce/family, criminal, contract/civil, labor, or immigration)?";
  }
  if (missingField === "title") return `What title should I use for the new ${typeLabel}?`;
  return `I need one more detail (${missingField}) before I can create the new ${typeLabel}.`;
}

function inferDossierFallbackWhenPlannerFails(conversationContext, extractedSignals = {}) {
  const text = String(conversationContext || "");
  const lowerText = lower(text);
  const framing = deriveDossierLegalFraming(text, extractedSignals);
  if (!framing?.category || !framing?.subtype) return null;
  const clientName = framing.clientName;
  const urgency = framing.priority || inferUrgency(text);
  const spouseMentioned = /\b(wife|husband|spouse)\b/i.test(text);
  const title = framing.title;
  const assumptions = [
    "Inferred dossier category from the intake narrative.",
    "Defaulted dossier phase to initiation.",
    `Defaulted priority to ${urgency}.`,
  ];
  if (spouseMentioned) {
    assumptions.push("Opposing party appears to be the spouse (name not provided yet).");
  }
  const missingOptional = ["opposing_party_name", "court", "jurisdiction"];
  const descriptionParts = [
    `Intake dossier for a ${framing.subtype.toLowerCase()} matter.`,
    clientName ? `Client: ${clientName}.` : null,
    /parenting plan/i.test(lowerText) ? "Parenting plan requested." : null,
    /assets?/i.test(lowerText) ? "Asset split requested." : null,
    spouseMentioned ? "Opposing party mentioned as spouse." : null,
  ].filter(Boolean);
  return {
    decision: "proceed",
    payloadCandidate: {
      title,
      category: framing.category,
      phase: "initiation",
      priority: urgency,
      status: "open",
      description: descriptionParts.join(" "),
    },
    semanticProfile: {
      entityType: "dossier",
      title,
      category: framing.category,
      subtype: framing.subtype,
      priority: urgency,
      phaseOrState: "initiation",
      tags: framing.tags,
      summary: clientName
        ? `Open a ${framing.subtype.toLowerCase()} dossier for ${clientName}.`
        : `Open a ${framing.subtype.toLowerCase()} dossier.`,
      assumptions,
      missingCritical: [],
      missingOptional,
    },
    legalSummary: framing.legalSummary,
    caseFocusPoints: framing.caseFocusPoints,
    suggestedNextSteps: framing.suggestedNextSteps,
    suggestedChildren: [
      {
        entityType: "task",
        payload: { title: "Collect divorce intake documents", status: "pending", priority: urgency },
        rationale: "Typical first step after a divorce intake.",
      },
      {
        entityType: "note",
        payload: { content: descriptionParts.join(" ") },
        rationale: "Capture the initial intake narrative summary.",
      },
    ],
    riskFlags: ["planner_llm_fallback_inference"],
    riskSignals: framing.riskSignals,
    confidence: 0.82,
    source: "deterministic",
  };
}

function inferMatterHintForClarification(conversationContext = "") {
  const text = lower(conversationContext);
  if (!text) return null;
  if (/\b(divorce|custody|alimony|marriage|parenting plan)\b/.test(text)) {
    return "I detected a family/divorce matter from your message.";
  }
  if (/\b(criminal|assault|theft|police|prosecutor)\b/.test(text)) {
    return "I detected a likely criminal matter from your message.";
  }
  if (/\b(contract|agreement|breach|invoice dispute|commercial dispute)\b/.test(text)) {
    return "I detected a likely civil/contract matter from your message.";
  }
  if (/\b(employment|dismissal|labor|labour|termination)\b/.test(text)) {
    return "I detected a likely labor matter from your message.";
  }
  if (/\b(immigration|visa|residency|residence permit)\b/.test(text)) {
    return "I detected a likely immigration matter from your message.";
  }
  return null;
}

function buildPlannerUnavailableClarification({ entityType, conversationContext, extractedSignals }) {
  const typeLabel = String(entityType || "record").replace(/_/g, " ");
  const clientName = parseClientNameFromContext(conversationContext, extractedSignals);
  const matterHint = inferMatterHintForClarification(conversationContext);
  const introParts = [];
  if (matterHint) introParts.push(matterHint);
  if (clientName) introParts.push(`I also identified the client as ${clientName}.`);
  if (!introParts.length) {
    introParts.push("I couldn't generate a reliable create plan yet.");
  } else {
    introParts.unshift("I couldn't generate a reliable create plan yet.");
  }

  const prompt =
    entityType === "dossier"
      ? "Please confirm the dossier type/category (for example family/divorce, criminal, civil/contract, labor, or immigration), and any title wording you want me to use."
      : `Please provide the ${typeLabel} type/purpose and any key details you want included so I can prepare a precise draft.`;

  return `${introParts.join(" ")} ${prompt}`;
}

async function tryLlmPlanner({ prompt, llmGenerate }) {
  const raw = await llmGenerate(prompt);
  if (!raw) {
    const err = new Error("Planner LLM returned no content");
    err.code = "PLANNER_LLM_EMPTY";
    throw err;
  }
  let parsed;
  try {
    parsed = parsePlannerJsonWithRecovery(raw);
  } catch (error) {
    const err = new Error("Planner LLM returned invalid JSON");
    err.code = "PLANNER_LLM_INVALID_JSON";
    err.cause = error;
    err.raw = raw;
    throw err;
  }
  return { parsed, raw };
}

async function planEntityCreation(input = {}, deps = {}) {
  const entityType = normalizeEntityType(input.entityType);
  if (!entityType) throw new Error("entityType is required");
  const conversationContext = normalizeText(input.conversationContext);
  const extractedSignals = input.extractedSignals && typeof input.extractedSignals === "object" ? input.extractedSignals : {};
  const resolvedEntityContext = input.resolvedEntityContext && typeof input.resolvedEntityContext === "object" ? input.resolvedEntityContext : null;
  const llmGenerate = typeof deps.llmGenerate === "function" ? deps.llmGenerate : generateChatResponse;
  const logger = typeof deps.logger === "function" ? deps.logger : null;

  const allowedCreateFields = getAllowedFields(entityType, "create") || [];
  const requiredCreateFields = (() => {
    try {
      // adapter helper isn't exposed; infer required by validation errors later
      return [];
    } catch (_) {
      return [];
    }
  })();

  // Deterministic high-quality dossier planner for common legal intake; used as baseline/guard.
  const promptBase = buildPlannerPrompt({
    entityType,
    conversationContext,
    extractedSignals: { ...extractedSignals, resolvedEntityContext },
    allowedCreateFields,
    requiredCreateFields,
  });

  let llmResult = null;
  let llmSource = "llm";
  let lastLlmError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const prompt =
        attempt === 0
          ? promptBase
          : `${promptBase}\n\nPrevious planner attempt failed: ${normalizeText(lastLlmError?.message || lastLlmError?.code || "unknown")}.\nReturn corrected JSON only.`;
      const { parsed, raw } = await tryLlmPlanner({ prompt, llmGenerate });
      if (logger) {
        logger({
          type: "entity_creation_planner_llm_raw",
          entityType,
          attempt: attempt + 1,
          rawPreview: summarizeRawPlannerOutput(raw),
        });
      }
      const coerced = coercePlannerOutput(parsed, { entityType });
      const validation = validatePlannerResult(coerced, { entityType, allowedCreateFields });
      if (!validation.ok) {
        const err = new Error(`Planner output invalid: ${validation.errors.join(", ")}`);
        err.code = "PLANNER_OUTPUT_INVALID";
        err.validationErrors = validation.errors;
        err.raw = raw;
        throw err;
      }
      llmResult = coerced;
      llmSource = attempt === 0 ? "llm" : "llm_retry";
      break;
    } catch (error) {
      lastLlmError = error;
      if (logger) {
        logger({
          type: "entity_creation_planner_llm_error",
          entityType,
          attempt: attempt + 1,
          code: error?.code || null,
          message: error?.message || null,
          rawPreview: summarizeRawPlannerOutput(error?.raw || error?.cause?.raw || null),
          validationErrors: Array.isArray(error?.validationErrors) ? error.validationErrors : undefined,
        });
      }
    }
  }

  // LLM is the source of semantic authoring. If it fails twice, clarify instead of inventing content.
  let chosen = llmResult;
  let source = llmResult ? llmSource : "llm_retry";

  if (!chosen) {
    const inferredFallback =
      entityType === "dossier"
        ? inferDossierFallbackWhenPlannerFails(conversationContext, { ...extractedSignals, resolvedEntityContext })
        : null;
    if (inferredFallback) {
      chosen = inferredFallback;
      source = "deterministic";
    }
  }

  if (!chosen) {
    return {
      clarificationQuestions: [
        buildPlannerUnavailableClarification({ entityType, conversationContext, extractedSignals }),
      ],
      semanticProfile: baselineSemanticProfile(entityType, conversationContext, extractedSignals),
      suggestedChildren: [],
      riskFlags: ["planner_unavailable"],
      legalSummary: normalizeEntityType(entityType) === "dossier"
        ? (deriveDossierLegalFraming(conversationContext, extractedSignals).legalSummary || baselineSemanticProfile(entityType, conversationContext, extractedSignals).summary)
        : baselineSemanticProfile(entityType, conversationContext, extractedSignals).summary,
      caseFocusPoints:
        normalizeEntityType(entityType) === "dossier"
          ? (deriveDossierLegalFraming(conversationContext, extractedSignals).caseFocusPoints || [])
          : [],
      suggestedNextSteps:
        normalizeEntityType(entityType) === "dossier"
          ? (deriveDossierLegalFraming(conversationContext, extractedSignals).suggestedNextSteps || [])
          : [],
      riskSignals:
        normalizeEntityType(entityType) === "dossier"
          ? (deriveDossierLegalFraming(conversationContext, extractedSignals).riskSignals || [])
          : [],
      confidence: 0.3,
      source,
    };
  }

  const dossierFraming =
    entityType === "dossier"
      ? deriveDossierLegalFraming(conversationContext, { ...extractedSignals, resolvedEntityContext })
      : null;
  if (!normalizeText(chosen.legalSummary) && dossierFraming?.legalSummary) {
    chosen.legalSummary = dossierFraming.legalSummary;
  }
  if ((!Array.isArray(chosen.caseFocusPoints) || chosen.caseFocusPoints.length === 0) && dossierFraming?.caseFocusPoints?.length) {
    chosen.caseFocusPoints = dossierFraming.caseFocusPoints;
  }
  if ((!Array.isArray(chosen.suggestedNextSteps) || chosen.suggestedNextSteps.length === 0) && dossierFraming?.suggestedNextSteps?.length) {
    chosen.suggestedNextSteps = dossierFraming.suggestedNextSteps;
  }
  if ((!Array.isArray(chosen.riskSignals) || chosen.riskSignals.length === 0) && dossierFraming?.riskSignals?.length) {
    chosen.riskSignals = dossierFraming.riskSignals;
  }

  if (chosen.decision === "clarify") {
    return {
      clarificationQuestions: chosen.clarificationQuestions,
      semanticProfile: chosen.semanticProfile || baselineSemanticProfile(entityType, conversationContext, extractedSignals),
      suggestedChildren: chosen.suggestedChildren || [],
      riskFlags: chosen.riskFlags || [],
      legalSummary: chosen.legalSummary || (dossierFraming?.legalSummary || (chosen.semanticProfile?.summary || "")),
      caseFocusPoints: Array.isArray(chosen.caseFocusPoints) ? chosen.caseFocusPoints : (dossierFraming?.caseFocusPoints || []),
      suggestedNextSteps: Array.isArray(chosen.suggestedNextSteps) ? chosen.suggestedNextSteps : (dossierFraming?.suggestedNextSteps || []),
      riskSignals: Array.isArray(chosen.riskSignals) ? chosen.riskSignals : (dossierFraming?.riskSignals || []),
      confidence: chosen.confidence || 0.5,
      source,
    };
  }

  const filteredPayload = filterPayloadToAllowed(chosen.payloadCandidate || {}, allowedCreateFields);

  const validationPayload = buildValidationPayloadWithResolvedParent(
    entityType,
    filteredPayload,
    extractedSignals,
    resolvedEntityContext,
  );
  try {
    validatePayload(entityType, "create", validationPayload);
  } catch (error) {
    const missingField = findRequiredFieldMessage(error);
    return {
      clarificationQuestions: [buildClarificationForValidation({ entityType, missingField: missingField || "required field" })],
      semanticProfile: chosen.semanticProfile || baselineSemanticProfile(entityType, conversationContext, extractedSignals),
      suggestedChildren: chosen.suggestedChildren || [],
      riskFlags: [...(chosen.riskFlags || []), "validation_failed"],
      legalSummary: chosen.legalSummary || (dossierFraming?.legalSummary || ""),
      caseFocusPoints: Array.isArray(chosen.caseFocusPoints) ? chosen.caseFocusPoints : (dossierFraming?.caseFocusPoints || []),
      suggestedNextSteps: Array.isArray(chosen.suggestedNextSteps) ? chosen.suggestedNextSteps : (dossierFraming?.suggestedNextSteps || []),
      riskSignals: Array.isArray(chosen.riskSignals) ? chosen.riskSignals : (dossierFraming?.riskSignals || []),
      confidence: Math.min(0.65, chosen.confidence || 0.5),
      source,
    };
  }

  // Final placeholder guard.
  if (containsPlaceholderDeep({ semanticProfile: chosen.semanticProfile, enrichedPayload: filteredPayload })) {
    return {
      clarificationQuestions: ["I need one more clarification before creating this record because the generated summary/details were too generic."],
      semanticProfile: chosen.semanticProfile || baselineSemanticProfile(entityType, conversationContext, extractedSignals),
      suggestedChildren: chosen.suggestedChildren || [],
      riskFlags: [...(chosen.riskFlags || []), "placeholder_rejected"],
      legalSummary: chosen.legalSummary || (dossierFraming?.legalSummary || ""),
      caseFocusPoints: Array.isArray(chosen.caseFocusPoints) ? chosen.caseFocusPoints : (dossierFraming?.caseFocusPoints || []),
      suggestedNextSteps: Array.isArray(chosen.suggestedNextSteps) ? chosen.suggestedNextSteps : (dossierFraming?.suggestedNextSteps || []),
      riskSignals: Array.isArray(chosen.riskSignals) ? chosen.riskSignals : (dossierFraming?.riskSignals || []),
      confidence: Math.min(0.6, chosen.confidence || 0.5),
      source,
    };
  }

  return {
    enrichedPayload: filteredPayload,
    semanticProfile: chosen.semanticProfile || baselineSemanticProfile(entityType, conversationContext, extractedSignals),
    suggestedChildren: chosen.suggestedChildren || [],
    riskFlags: chosen.riskFlags || [],
    legalSummary: chosen.legalSummary || (dossierFraming?.legalSummary || (chosen.semanticProfile?.summary || "")),
    caseFocusPoints: Array.isArray(chosen.caseFocusPoints) ? chosen.caseFocusPoints : (dossierFraming?.caseFocusPoints || []),
    suggestedNextSteps: Array.isArray(chosen.suggestedNextSteps) ? chosen.suggestedNextSteps : (dossierFraming?.suggestedNextSteps || []),
    riskSignals: Array.isArray(chosen.riskSignals) ? chosen.riskSignals : (dossierFraming?.riskSignals || []),
    confidence: Number.isFinite(Number(chosen.confidence)) ? Number(chosen.confidence) : 0.75,
    source,
  };
}

module.exports = {
  planEntityCreation,
  validatePlannerResult,
  buildPlannerPrompt,
  coercePlannerOutput,
  isPlaceholderText,
  _internal: {
    filterPayloadToAllowed,
    containsPlaceholderDeep,
    parseClientNameFromContext,
    buildValidationPayloadWithResolvedParent,
    extractFirstJsonObjectText,
    parsePlannerJsonWithRecovery,
    inferMatterHintForClarification,
    buildPlannerUnavailableClarification,
    summarizeRawPlannerOutput,
    inferDossierFallbackWhenPlannerFails,
    deriveDossierLegalFraming,
  },
};
