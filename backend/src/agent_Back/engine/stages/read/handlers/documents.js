"use strict";

const { resolveEntityDisplayLabel } = require("../../../../utils/entityDisplay");
const { summarizeDocumentText } = require("../../../../llm/llm.client");

const SUMMARY_MAX_CHARS = 800;

function normalizeText(value) {
  return String(value || "").toLowerCase().trim();
}

function extractDocumentQuery(message) {
  const text = String(message || "").trim();
  if (!text) return null;

  const tokenMatch = text.match(
    /(?:^|\s)([^\s"'`]+?\.(?:pdf|docx|doc|txt|rtf|png|jpe?g|tiff?))\b/i,
  );
  if (tokenMatch && tokenMatch[1]) return tokenMatch[1].trim();

  const tokens = text.split(/\s+/);
  for (const token of tokens) {
    const cleaned = token.replace(/^[("'`]+|[)"'`,.?!]+$/g, "");
    if (
      /\.[A-Za-z0-9]+$/.test(cleaned) &&
      /\.(pdf|docx|doc|txt|rtf|png|jpe?g|tiff?)$/i.test(cleaned)
    ) {
      return cleaned;
    }
  }

  const fileMatch = text.match(
    /([A-Za-z0-9_\- .]+?\.(?:pdf|docx|doc|txt|rtf|png|jpe?g|tiff?))\b/i,
  );
  if (fileMatch && fileMatch[1]) return fileMatch[1].trim();

  const quotedMatch = text.match(/["“”']([^"“”']{3,})["“”']/);
  if (quotedMatch && quotedMatch[1]) return quotedMatch[1].trim();

  return null;
}

function formatDocumentLabel(doc) {
  return resolveEntityDisplayLabel("document", doc, { fallback: "Document" });
}

function formatDocLength(length) {
  if (!Number.isFinite(length)) return null;
  return new Intl.NumberFormat("en-US").format(length);
}

function describeUnreadableReason(doc) {
  const reason = doc?.text_failure_reason || doc?.failure_reason || null;
  if (doc?.text_status === "processing") return "OCR in progress";
  if (reason) return reason.replace(/_/g, " ");
  return "document unreadable";
}

async function resolveLinkedEntityLabel(engine, policy, type, id) {
  if (!type || id === null || id === undefined) return null;

  const toolMap = {
    client: { tool: "getClient", key: "client", param: "clientId" },
    dossier: { tool: "getDossier", key: "dossier", param: "dossierId" },
    lawsuit: { tool: "getLawsuit", key: "lawsuit", param: "lawsuitId" },
    mission: { tool: "getMission", key: "mission", param: "missionId" },
    task: { tool: "getTask", key: "task", param: "taskId" },
    session: { tool: "getSession", key: "session", param: "sessionId" },
    personal_task: {
      tool: "getPersonalTask",
      key: "personalTask",
      param: "personalTaskId",
    },
    financial_entry: {
      tool: "getFinancialEntry",
      key: "financialEntry",
      param: "financialEntryId",
    },
  };

  const entry = toolMap[type];
  if (!entry) return null;

  try {
    const result = await engine._callReadTool(
      entry.tool,
      { [entry.param]: id },
      policy,
    );
    const data = result?.[entry.key];
    if (!data) return null;
    return resolveEntityDisplayLabel(type, data, { fallback: null });
  } catch {
    return null;
  }
}

function resolveDocumentScope(context, engine) {
  const scope = String(context?.scope || "").toLowerCase();
  const scopeMap = {
    dossier: context?.dossierId,
    client: context?.clientId,
    lawsuit: context?.lawsuitId,
    mission: context?.missionId,
    task: context?.taskId,
    session: context?.sessionId,
    personal_task: context?.personalTaskId,
    financial_entry: context?.financialEntryId,
  };

  if (scope && scopeMap[scope]) {
    return { type: scope, id: scopeMap[scope] };
  }

  const storedContext = engine?.contextStore?.get
    ? engine.contextStore.get(context)
    : null;
  if (
    storedContext?.activeEntityType &&
    storedContext?.activeEntityId &&
    storedContext.activeEntityType !== "document"
  ) {
    return { type: storedContext.activeEntityType, id: storedContext.activeEntityId };
  }

  const fallback = [
    ["dossier", context?.dossierId],
    ["client", context?.clientId],
    ["lawsuit", context?.lawsuitId],
    ["mission", context?.missionId],
    ["task", context?.taskId],
    ["session", context?.sessionId],
    ["personal_task", context?.personalTaskId],
    ["financial_entry", context?.financialEntryId],
  ].find(([, id]) => id);

  if (fallback) {
    return { type: fallback[0], id: fallback[1] };
  }

  if (context?.activeEntityType && context?.activeEntityId) {
    return { type: context.activeEntityType, id: context.activeEntityId };
  }

  return null;
}

async function handleSummarizeDocument(state) {
  const { message, context, details, sources, policy } = state;
  let { data, title, summary } = state;

  title = "Document summary";
  const scope = resolveDocumentScope(context, this);
  if (!scope) {
    summary = "Which record's document should I summarize?";
    details.push(
      "Open a dossier or client record first, then try again.",
    );
    return { data: null, title, summary };
  }

  if (!context.activeEntityType) {
    context.activeEntityType = scope.type;
  }
  if (!context.activeEntityId) {
    context.activeEntityId = scope.id;
  }
  if (!context.scope) {
    context.scope = scope.type;
  }
  const scopeIdKeyMap = {
    client: "clientId",
    dossier: "dossierId",
    lawsuit: "lawsuitId",
    mission: "missionId",
    task: "taskId",
    session: "sessionId",
    personal_task: "personalTaskId",
    financial_entry: "financialEntryId",
  };
  const scopeKey = scopeIdKeyMap[scope.type];
  if (scopeKey && !context[scopeKey]) {
    context[scopeKey] = scope.id;
  }

  const docResult = this._loadDocumentMetadata(
    scope.type,
    scope.id,
    context,
    { previewLength: 0 },
  );
  if (!docResult.permitted) {
    summary = "Document access not available.";
    details.push(docResult.message || "Document access is restricted.");
    return { data: null, title, summary };
  }

  const documents = docResult.documents || [];
  if (documents.length === 0) {
    summary = `No documents found for this ${scope.type}.`;
    details.push("Upload a document to continue.");
    sources.push({
      sourceType: "system",
      reference: "documents.metadata",
      note: "Document metadata",
    });
    return { data: null, title, summary };
  }

  const readableDocs = documents.filter(
    (doc) =>
      doc.text_status === "readable" ||
      (doc.has_text && !doc.unreadable_text),
  );

  if (readableDocs.length === 0) {
    summary = "No readable documents available.";
    documents.forEach((doc) => {
      const label = formatDocumentLabel(doc);
      details.push(`${label} - ${describeUnreadableReason(doc)}`);
    });
    sources.push({
      sourceType: "system",
      reference: "documents.metadata",
      note: "Document metadata",
    });
    data = documents.map((doc) => ({ ...doc, id: doc.document_id }));
    return { data, title, summary };
  }

  const docQuery = extractDocumentQuery(message);
  const normalizedQuery = normalizeText(docQuery);
  const matchDocs = normalizedQuery
    ? readableDocs.filter((doc) =>
        normalizeText(formatDocumentLabel(doc)).includes(normalizedQuery),
      )
    : [];

  let selectedDoc = null;
  if (matchDocs.length === 1) {
    selectedDoc = matchDocs[0];
  } else if (!normalizedQuery && readableDocs.length === 1) {
    selectedDoc = readableDocs[0];
  }

  if (!selectedDoc) {
    const listTarget = readableDocs.length > 0 ? readableDocs : documents;
    summary = normalizedQuery
      ? `No readable document found matching "${docQuery}".`
      : "Which document should I summarize?";
    listTarget.forEach((doc) => {
      const label = formatDocumentLabel(doc);
      const lengthLabel = formatDocLength(doc.text_length);
      const statusLabel =
        doc.text_status === "readable"
          ? lengthLabel
            ? `text loaded (${lengthLabel} characters)`
            : "text loaded"
          : describeUnreadableReason(doc);
      details.push(`${label} - ${statusLabel}`);
    });
    sources.push({
      sourceType: "system",
      reference: "documents.metadata",
      note: "Document metadata",
    });
    data = listTarget.map((doc) => ({ ...doc, id: doc.document_id }));
    return { data, title, summary };
  }

  const selectedLabel = formatDocumentLabel(selectedDoc);
  const textResult = this._loadDocumentTexts(
    [selectedDoc.document_id],
    context,
  );
  if (!textResult.permitted) {
    summary = "Document text access not available.";
    details.push(
      textResult.message || "Document text access is restricted.",
    );
    data = { ...selectedDoc, id: selectedDoc.document_id };
    return { data, title, summary };
  }

  const textDoc = Array.isArray(textResult.documents)
    ? textResult.documents[0]
    : null;
  if (!textDoc || !textDoc.document_text) {
    summary = "Document is unreadable.";
    details.push(`${selectedLabel} - ${describeUnreadableReason(textDoc || selectedDoc)}`);
    data = { ...selectedDoc, id: selectedDoc.document_id };
    return { data, title, summary };
  }

  let summaryText = await summarizeDocumentText({
    title: selectedLabel,
    text: textDoc.document_text,
    question: message,
  });
  if (summaryText) {
    summaryText = summaryText.replace(/\s+/g, " ").trim();
    if (summaryText.length > SUMMARY_MAX_CHARS) {
      summaryText = `${summaryText.slice(0, SUMMARY_MAX_CHARS - 3)}...`;
    }
  }

  summary = summaryText || `Summary for ${selectedLabel}.`;
  details.push(`Document: ${selectedLabel}`);
  const sourceValue = textDoc.text_source || selectedDoc.text_source;
  if (sourceValue) {
    details.push(
      `Source: ${sourceValue === "ocr" ? "OCR" : sourceValue}`,
    );
  }
  const lengthLabel = formatDocLength(
    textDoc.text_length || selectedDoc.text_length,
  );
  if (lengthLabel) {
    details.push(`Text length: ${lengthLabel} characters`);
  }
  let linkedEntityLabel = null;
  if (selectedDoc.linked_entity_type && selectedDoc.linked_entity_id) {
    linkedEntityLabel = await resolveLinkedEntityLabel(
      this,
      policy,
      selectedDoc.linked_entity_type,
      selectedDoc.linked_entity_id,
    );
    const linkedTypeLabel = String(selectedDoc.linked_entity_type).replace(/_/g, " ");
    if (linkedEntityLabel) {
      details.push(`Linked to: ${linkedTypeLabel} ${linkedEntityLabel}`);
    } else {
      details.push(
        `Linked to: ${linkedTypeLabel} ${selectedDoc.linked_entity_id}`,
      );
    }
  }

  sources.push({
    sourceType: "system",
    reference: "documents.text",
    note: "Document text",
  });
  sources.push({
    sourceType: "system",
    reference: "documents.metadata",
    note: "Document metadata",
  });

  data = {
    ...selectedDoc,
    id: selectedDoc.document_id,
    linked_entity_label: linkedEntityLabel || null,
  };
  return { data, title, summary };
}

module.exports = {
  handleSummarizeDocument,
};
