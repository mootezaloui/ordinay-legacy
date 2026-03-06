"use strict";

const MS_IN_DAY = 24 * 60 * 60 * 1000;

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function toDateString(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function addDays(baseDate, days) {
  const base = baseDate instanceof Date ? new Date(baseDate.getTime()) : new Date();
  base.setDate(base.getDate() + days);
  return base;
}

function classifyTaskCategoryFromTitle({ payload }) {
  const text = normalizeText(payload?.title || payload?.description || "");
  if (!text) return null;

  const urgencySignals = ["urgent", "asap", "immediately", "today", "deadline", "court", "hearing"];
  const mediumSignals = ["review", "follow up", "follow-up", "prepare", "draft"];

  const matchedUrgency = urgencySignals.filter((token) => text.includes(token));
  const matchedMedium = mediumSignals.filter((token) => text.includes(token));

  if (matchedUrgency.length > 0) {
    return {
      strategyId: "classifyTaskCategoryFromTitle",
      field: "priority",
      value: "high",
      confidenceSignals: [
        { key: "rule_match_exact", weight: 0.55, detail: `matched: ${matchedUrgency.join(", ")}` },
        { key: "data_completeness", weight: 0.2, detail: "title_or_description_present" },
      ],
      penalties: [],
    };
  }

  if (matchedMedium.length > 0) {
    return {
      strategyId: "classifyTaskCategoryFromTitle",
      field: "priority",
      value: "medium",
      confidenceSignals: [
        { key: "rule_match_weak", weight: 0.35, detail: `matched: ${matchedMedium.join(", ")}` },
        { key: "data_completeness", weight: 0.2, detail: "title_or_description_present" },
      ],
      penalties: [],
    };
  }

  return null;
}

function applyTemporalWindowPolicy({ payload }) {
  const text = normalizeText(payload?.title || payload?.description || "");
  if (!text) return null;

  const now = new Date();
  const windows = [
    { token: "today", days: 0, confidence: 0.95 },
    { token: "tomorrow", days: 1, confidence: 0.9 },
    { token: "this week", days: 5, confidence: 0.78 },
    { token: "next week", days: 10, confidence: 0.72 },
    { token: "soon", days: 7, confidence: 0.62 },
  ];

  const matched = windows.find((entry) => text.includes(entry.token));
  if (!matched) return null;

  return {
    strategyId: "applyTemporalWindowPolicy",
    field: "due_date",
    value: toDateString(addDays(now, matched.days)),
    confidenceSignals: [
      { key: "rule_match_exact", weight: matched.confidence, detail: `matched: ${matched.token}` },
      { key: "data_completeness", weight: 0.05, detail: "title_or_description_present" },
    ],
    penalties: [],
  };
}

function derivePriorityFromDeadline({ payload }) {
  const dueDate = normalizeDate(payload?.due_date);
  if (!dueDate) return null;

  const deltaMs = dueDate.getTime() - Date.now();
  const deltaDays = Math.floor(deltaMs / MS_IN_DAY);

  if (deltaDays <= 1) {
    return {
      strategyId: "derivePriorityFromDeadline",
      field: "priority",
      value: "urgent",
      confidenceSignals: [
        { key: "context_key_present", weight: 0.35, detail: "due_date" },
        { key: "rule_match_exact", weight: 0.45, detail: `delta_days=${deltaDays}` },
      ],
      penalties: [],
    };
  }

  if (deltaDays <= 3) {
    return {
      strategyId: "derivePriorityFromDeadline",
      field: "priority",
      value: "high",
      confidenceSignals: [
        { key: "context_key_present", weight: 0.35, detail: "due_date" },
        { key: "rule_match_weak", weight: 0.28, detail: `delta_days=${deltaDays}` },
      ],
      penalties: [],
    };
  }

  return null;
}

function inheritFromScope({ field, payload, activeScope }) {
  if (payload?.[field] !== undefined && payload?.[field] !== null && payload?.[field] !== "") {
    return null;
  }

  const scopeKeyMap = {
    client_id: ["clientId", "client_id"],
    dossier_id: ["dossierId", "dossier_id"],
    lawsuit_id: ["lawsuitId", "lawsuit_id"],
    officer_id: ["officerId", "officer_id"],
  };
  const candidates = scopeKeyMap[field] || [];
  for (const key of candidates) {
    const value = Number(activeScope?.[key]);
    if (Number.isInteger(value) && value > 0) {
      return {
        strategyId: "inheritFromScope",
        field,
        value,
        confidenceSignals: [
          { key: "context_key_present", weight: 1, detail: key },
        ],
        penalties: [],
      };
    }
  }
  return null;
}

function normalizeStatusByEnum({ field, value, allowedValues = [] }) {
  const normalizedAllowed = Array.isArray(allowedValues)
    ? allowedValues.map((entry) => String(entry || "").trim().toLowerCase()).filter(Boolean)
    : [];
  if (!normalizedAllowed.length) return null;

  const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!raw) return null;

  if (normalizedAllowed.includes(raw)) {
    return {
      strategyId: "normalizeStatusByEnum",
      field,
      normalized: raw,
      corrected: false,
    };
  }

  const aliases = {
    completed: "done",
    complete: "done",
    canceled: "cancelled",
    inprogress: "in_progress",
    "in-progress": "in_progress",
    pending: "todo",
  };
  const mapped = aliases[raw];
  if (mapped && normalizedAllowed.includes(mapped)) {
    return {
      strategyId: "normalizeStatusByEnum",
      field,
      normalized: mapped,
      corrected: true,
      from: value,
      to: mapped,
    };
  }
  return null;
}

function inferTaskDescriptionFromTitle({ payload }) {
  const title = String(payload?.title || "").trim();
  if (!title) return null;
  const currentDescription = String(payload?.description || "").trim();
  if (currentDescription) return null;
  const description =
    title.length > 120
      ? `Planned task: ${title.slice(0, 117).trim()}...`
      : `Planned task: ${title}`;
  return {
    strategyId: "inferTaskDescriptionFromTitle",
    field: "description",
    value: description,
    confidenceSignals: [
      { key: "data_completeness", weight: 0.45, detail: "title_present" },
      { key: "rule_match_exact", weight: 0.45, detail: "description_missing" },
    ],
    penalties: [],
  };
}

function estimateTaskEffortFromTitle({ payload }) {
  const text = normalizeText(`${payload?.title || ""} ${payload?.description || ""}`);
  if (!text) return null;

  let value = "30m";
  let weight = 0.62;
  if (/(draft|prepare|research|analy[sz]e|review|discovery|timeline|interview)/.test(text)) {
    value = "1h";
    weight = 0.74;
  }
  if (/(settlement brief|motion|hearing|forensic|valuation|expert)/.test(text)) {
    value = "2h";
    weight = 0.82;
  }

  return {
    strategyId: "estimateTaskEffortFromTitle",
    field: "estimated_time",
    value,
    confidenceSignals: [
      { key: "rule_match_exact", weight, detail: `effort=${value}` },
      { key: "data_completeness", weight: 0.12, detail: "title_or_description_present" },
    ],
    penalties: [],
  };
}

module.exports = {
  classifyTaskCategoryFromTitle,
  applyTemporalWindowPolicy,
  derivePriorityFromDeadline,
  inheritFromScope,
  normalizeStatusByEnum,
  inferTaskDescriptionFromTitle,
  estimateTaskEffortFromTitle,
};
