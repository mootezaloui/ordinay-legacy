"use strict";

const { ACTION_TYPES } = require("../context/conversation.context");

function _updateConversationContext(requestContext, query, result, source) {
  if (!result || !result.output) return;

  const { intent, output } = result;

  // Determine entity type from intent, output.entityId, or query
  let entityType = null;

  // Try to extract from intent first
  if (intent) {
    if (intent.includes("CLIENT")) entityType = "client";
    else if (intent.includes("DOSSIER")) entityType = "dossier";
    else if (intent.includes("LAWSUIT")) entityType = "lawsuit";
    else if (intent.includes("TASK")) entityType = "task";
    else if (intent.includes("PERSONAL_TASK")) entityType = "personal_task";
    else if (intent.includes("SESSION")) entityType = "session";
    else if (intent.includes("MISSION")) entityType = "mission";
    else if (intent.includes("FINANCIAL_ENTRY"))
      entityType = "financial_entry";
    else if (intent.includes("DOCUMENT")) entityType = "document";
    else if (intent.includes("NOTIFICATION")) entityType = "notification";
    else if (intent.includes("HISTORY")) entityType = "history_event";
  }

  // If not found in intent, try output.entityId (e.g., "read:list_clients", "command:clients")
  if (!entityType && output.entityId) {
    const entityIdLower = output.entityId.toLowerCase();
    if (entityIdLower.includes("client")) entityType = "client";
    else if (entityIdLower.includes("dossier")) entityType = "dossier";
    else if (entityIdLower.includes("lawsuit")) entityType = "lawsuit";
    else if (entityIdLower.includes("personal_task")) entityType = "personal_task";
    else if (entityIdLower.includes("task")) entityType = "task";
    else if (entityIdLower.includes("session")) entityType = "session";
    else if (entityIdLower.includes("mission")) entityType = "mission";
    else if (entityIdLower.includes("financial")) entityType = "financial_entry";
    else if (entityIdLower.includes("document")) entityType = "document";
    else if (entityIdLower.includes("notification")) entityType = "notification";
    else if (entityIdLower.includes("history")) entityType = "history_event";
  }

  if (!entityType && output.entityType) {
    entityType = output.entityType;
  }

  // If still not found, try the query itself
  if (!entityType && query) {
    const queryLower = query.toLowerCase();
    if (/\bclient/i.test(queryLower)) entityType = "client";
    else if (/\bdossier/i.test(queryLower)) entityType = "dossier";
    else if (/\blawsuit|case/i.test(queryLower)) entityType = "lawsuit";
    else if (/\bpersonal\s+task/i.test(queryLower)) entityType = "personal_task";
    else if (/\btask/i.test(queryLower)) entityType = "task";
    else if (/\bsession|hearing/i.test(queryLower)) entityType = "session";
    else if (/\bmission/i.test(queryLower)) entityType = "mission";
    else if (/\baccounting|financial|invoice|payment/i.test(queryLower))
      entityType = "financial_entry";
    else if (/\bdocument|file|attachment|pdf|docx/i.test(queryLower))
      entityType = "document";
    else if (/\bnotification|alert/i.test(queryLower))
      entityType = "notification";
    else if (/\bhistory|audit/i.test(queryLower))
      entityType = "history_event";
  }

  // Determine action type
  let actionType = ACTION_TYPES.LIST;
  if (intent && intent.startsWith("READ_")) actionType = ACTION_TYPES.GET;
  if (
    intent &&
    (intent.startsWith("EXPLAIN_") || intent.startsWith("SUMMARIZE_"))
  )
    actionType = ACTION_TYPES.EXPLAIN;
  if (intent && intent.startsWith("LIST_")) actionType = ACTION_TYPES.LIST;
  if (intent === "COMMAND") actionType = ACTION_TYPES.LIST;
  if (intent === "READ_DATA" && output.entityId) {
    const derived = output.entityId.replace(/^read:/i, "").toUpperCase();
    if (derived.startsWith("LIST_")) actionType = ACTION_TYPES.LIST;
    else if (derived.startsWith("READ_")) actionType = ACTION_TYPES.GET;
    else if (
      derived.startsWith("EXPLAIN_") ||
      derived.startsWith("SUMMARIZE_")
    )
      actionType = ACTION_TYPES.EXPLAIN;
  }

  const readMeta = result.readMeta || null;
  const contextPromotion = result.contextPromotion || null;

  // Extract result count from output details (fallback when readMeta missing)
  let count = 0;
  let emptyResult = false;
  if (readMeta && typeof readMeta.count === "number") {
    count = readMeta.count;
  } else if (output.facts && Array.isArray(output.facts.details)) {
    count = output.facts.details.length;
  } else if (output.details && Array.isArray(output.details)) {
    count = output.details.filter((d) => d.startsWith("•")).length;
  }
  const summaryText = output.facts?.summary || output.summary;
  if (summaryText) {
    // Try to extract count from summary
    const countMatch = summaryText.match(
      /(\d+)\s+(client|dossier|task|session|item)/i,
    );
    if (countMatch) count = parseInt(countMatch[1], 10);
    if (/no\s+(client|dossier|task|session|result)/i.test(summaryText)) {
      count = 0;
      emptyResult = true;
    }
  }

  if (
    count === 0 &&
    output.entityId &&
    !String(output.entityId).toLowerCase().startsWith("list:") &&
    summaryText &&
    !/no\s+|not\s+found|multiple|which|provide/i.test(summaryText)
  ) {
    count = 1;
  }

  const entityIdsFromMeta = Array.isArray(readMeta?.entityIds)
    ? readMeta.entityIds
    : [];
  if (readMeta?.entityType) {
    entityType = readMeta.entityType;
  }

  const inferredActiveEntity = (() => {
    if (contextPromotion?.activeEntity) return contextPromotion.activeEntity;
    if (readMeta?.count === 1) {
      const singleId =
        readMeta.singleId ?? (entityIdsFromMeta.length === 1 ? entityIdsFromMeta[0] : null);
      if (singleId !== null && singleId !== undefined) {
        return {
          type: readMeta.entityType || entityType,
          id: singleId,
          source,
        };
      }
    }
    return null;
  })();

  // Update context store
  this.contextStore.update(requestContext, {
    intent,
    entityType,
    entityIds: entityIdsFromMeta,
    actionType,
    resultSummary: {
      count,
      emptyResult,
      filters: {},
    },
    activeEntity: inferredActiveEntity,
    pendingSelection:
      contextPromotion && "pendingSelection" in contextPromotion
        ? contextPromotion.pendingSelection
        : undefined,
    query,
    source,
  });

  this.ledger.record({
    type: "conversation_context_updated",
    intent,
    entityType,
    actionType,
    resultCount: count,
    activeEntityType: contextPromotion?.activeEntity?.type || null,
    activeEntityId: contextPromotion?.activeEntity?.id || null,
    pendingSelection: contextPromotion?.pendingSelection || null,
    source,
    timestamp: new Date().toISOString(),
  });
}

module.exports = {
  _updateConversationContext,
};
