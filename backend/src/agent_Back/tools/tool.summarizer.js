"use strict";

function toTitle(value) {
  return String(value || "").trim();
}

function toStatus(value) {
  const text = String(value || "").trim();
  return text ? text.replace(/_/g, " ") : "";
}

function countBy(rows = [], matcher) {
  return (Array.isArray(rows) ? rows : []).filter((row) => matcher(row || {})).length;
}

function summarizeList(toolName, rows = [], label = "items") {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return `No ${label} found.`;
  const first = list[0] || {};
  if (toolName === "listTasks") {
    const openCount = countBy(list, (row) => /open|pending|todo|in_progress/i.test(String(row.status || "")));
    const overdueCount = countBy(
      list,
      (row) => Boolean(row.overdue) || /overdue/i.test(String(row.status || "")),
    );
    return `${list.length} tasks: ${openCount} open, ${overdueCount} overdue`;
  }
  if (toolName === "listDossiers") {
    return `${list.length} dossiers found: ${toTitle(first.title || first.name || first.reference || "Untitled")} (${toStatus(first.status) || "unknown status"})`;
  }
  if (toolName === "listClients") {
    return `${list.length} clients found: ${toTitle(first.full_name || first.name || "Unknown client")} (${toStatus(first.status) || "unknown status"})`;
  }
  return `${list.length} ${label} found: ${toTitle(first.title || first.name || first.reference || label)}${toStatus(first.status) ? ` (${toStatus(first.status)})` : ""}`;
}

function summarizeReadTool(toolName, result) {
  const value = result && typeof result === "object" ? result : {};
  if (toolName === "getClient") {
    return `${toTitle(value.full_name || value.name || "Client")} - ${toStatus(value.status) || "client record"}`;
  }
  if (toolName === "getLawsuit") {
    return `${toTitle(value.reference || value.case_number || "Lawsuit")} - ${toTitle(value.title || value.subject || "lawsuit")}, ${toStatus(value.status) || "status unknown"}${value.court ? `, ${value.court}` : ""}`;
  }
  if (toolName === "listClients") return summarizeList(toolName, value.clients || value.rows || value.items, "clients");
  if (toolName === "listDossiers") return summarizeList(toolName, value.dossiers || value.rows || value.items, "dossiers");
  if (toolName === "listTasks") return summarizeList(toolName, value.tasks || value.rows || value.items, "tasks");
  if (toolName === "listSessions") return summarizeList(toolName, value.sessions || value.rows || value.items, "sessions");
  if (toolName === "getDossier") {
    return `${toTitle(value.reference || value.title || value.name || "Dossier")} - ${toStatus(value.status) || "status unknown"}`;
  }
  return `${toolName} completed${value && value.status ? `: ${toStatus(value.status)}` : ""}`;
}

function summarizePlanTool(toolName, result) {
  const value = result && typeof result === "object" ? result : {};
  const target = toTitle(
    value.entityType || value.targetEntityType || value.target?.type || value.artifactKind || "plan",
  );
  const steps = Array.isArray(value.steps)
    ? value.steps.length
    : Array.isArray(value.operations)
      ? value.operations.length
      : 0;
  return `${toolName} prepared ${target}${steps ? ` with ${steps} steps` : ""}`;
}

function summarizeExecuteTool(toolName, result) {
  const value = result && typeof result === "object" ? result : {};
  const changed = toTitle(
    value.entityType || value.targetEntityType || value.target?.type || value.operation || "record",
  );
  const status = value.success === false ? "failed" : value.success === true ? "succeeded" : "completed";
  return `${toolName} ${status} for ${changed}`;
}

function summarizeToolResult(toolName, result) {
  const normalizedTool = String(toolName || "").trim();
  const normalized = normalizedTool.toLowerCase();
  if (!normalizedTool) return "Tool completed.";
  if (normalized.startsWith("list") || normalized.startsWith("get") || normalized.startsWith("search")) {
    return summarizeReadTool(normalizedTool, result);
  }
  if (normalized.includes("plan") || normalized.includes("propose")) {
    return summarizePlanTool(normalizedTool, result);
  }
  if (normalized.includes("mutation") || normalized.includes("update") || normalized.includes("create") || normalized.includes("delete")) {
    return summarizeExecuteTool(normalizedTool, result);
  }
  return `${normalizedTool} completed.`;
}

module.exports = {
  summarizeToolResult,
};
