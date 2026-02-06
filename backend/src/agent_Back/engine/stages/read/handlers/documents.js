"use strict";

const { resolveEntityDisplayLabel } = require("../../../../utils/entityDisplay");
const { summarizeDocumentText } = require("../../../../llm/llm.client");
const agentDocumentsService = require("../../../../../services/agentDocuments.service");

const SUMMARY_MAX_CHARS = 800;
const DOCUMENT_WAIT_MS = Number.parseInt(
  process.env.DOCUMENT_SUMMARY_WAIT_MS || "12000",
  10,
);
const DOCUMENT_WAIT_INTERVAL_MS = Number.parseInt(
  process.env.DOCUMENT_SUMMARY_WAIT_INTERVAL_MS || "1000",
  10,
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function isPdfOcrUnsupportedReason(reason) {
  if (!reason) return false;
  const lower = String(reason).toLowerCase();
  return (
    reason === "ocr_pdf_input_unsupported" ||
    lower.includes("pdf reading is not supported") ||
    lower.includes("ocr_pdf_input_unsupported")
  );
}

function getUnreadableReasonCode(doc) {
  const reason = doc?.text_failure_reason || doc?.failure_reason || null;
  if (!reason) return null;
  if (isPdfOcrUnsupportedReason(reason)) return "ocr_pdf_input_unsupported";
  if (reason.startsWith("ocr_spawn_failed:")) {
    const detail = reason.replace("ocr_spawn_failed:", "").trim();
    if (detail.toUpperCase().includes("ENOENT")) return "ocr_engine_missing";
    return "ocr_spawn_failed";
  }
  if (reason.startsWith("ocr_failed:")) {
    const detail = reason.replace("ocr_failed:", "").trim();
    if (isPdfOcrUnsupportedReason(detail)) return "ocr_pdf_input_unsupported";
    return "ocr_failed";
  }
  return reason;
}

function buildUnreadableSummary(label, doc) {
  const code = getUnreadableReasonCode(doc);
  if (code === "unsupported_type") {
    return `Unable to read ${label} because this file type is not supported.`;
  }
  if (code === "ocr_pdf_input_unsupported") {
    return `Unable to OCR ${label} because PDF OCR conversion is not configured.`;
  }
  if (code === "ocr_engine_missing") {
    return `Unable to OCR ${label} because OCR is unavailable on this machine.`;
  }
  if (code === "ocr_timeout") {
    return `Unable to OCR ${label} because text extraction timed out.`;
  }
  if (["no_pdf_text", "no_docx_text", "empty_text", "ocr_empty"].includes(code)) {
    return `${label} contains no readable text.`;
  }
  return `${label} is unreadable.`;
}

function describeUnreadableReason(doc) {
  const reason = doc?.text_failure_reason || doc?.failure_reason || null;
  if (doc?.text_status === "processing") return "OCR in progress";
  if (reason) {
    if (isPdfOcrUnsupportedReason(reason)) {
      return "OCR cannot read PDF directly in this environment (PDF-to-image converter missing)";
    }
    if (reason === "ocr_engine_missing") {
      return "OCR is unavailable (Tesseract is not installed or not in PATH)";
    }
    if (reason.startsWith("ocr_spawn_failed:")) {
      const detail = reason.replace("ocr_spawn_failed:", "").trim();
      if (detail.toUpperCase().includes("ENOENT")) {
        return "OCR is unavailable (Tesseract is not installed or not in PATH)";
      }
      return `OCR failed to start (${detail})`;
    }
    if (reason.startsWith("ocr_failed:")) {
      const detail = reason.replace("ocr_failed:", "").trim();
      if (isPdfOcrUnsupportedReason(detail)) {
        return "OCR cannot read PDF directly in this environment (PDF-to-image converter missing)";
      }
      return `OCR failed (${detail})`;
    }
    const friendly = {
      missing_file_path: "missing file path",
      file_not_found: "file not found",
      file_stat_failed: "file metadata unavailable",
      not_a_file: "path is not a file",
      file_too_large: "file too large to process",
      unsupported_type: "unsupported file type",
      no_pdf_text: "PDF contains no embedded text",
      no_docx_text: "DOCX contains no readable text",
      empty_text: "file contains no readable text",
      ocr_timeout: "OCR timed out",
      ocr_empty: "OCR produced no readable text",
      legacy_unreadable: "document was previously marked unreadable",
    };
    return friendly[reason] || reason.replace(/_/g, " ");
  }
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

  // --- Session-attached document resolution (short-circuit) ---
  // If the user uploaded files to this session, resolve from session first
  // before requiring a dossier/client scope.
  const conversationSessionId =
    typeof context?.conversationId === "string" && context.conversationId.trim()
      ? context.conversationId.trim()
      : null;
  if (conversationSessionId) {
    let sessionDocs = agentDocumentsService.listBySession(conversationSessionId, { includeText: false });
    if (sessionDocs.length > 0) {
      let readableSessionDocs = sessionDocs.filter(
        (doc) => doc.text_status === "readable" || (doc.has_text && !doc.unreadable_text),
      );

      if (readableSessionDocs.length === 0) {
        let processingSessionDocs = sessionDocs.filter(
          (doc) => doc.text_status === "processing",
        );

        if (processingSessionDocs.length > 0 && DOCUMENT_WAIT_MS > 0) {
          const startedAt = Date.now();
          while (Date.now() - startedAt < DOCUMENT_WAIT_MS) {
            await sleep(Math.max(250, DOCUMENT_WAIT_INTERVAL_MS));
            sessionDocs = agentDocumentsService.listBySession(conversationSessionId, {
              includeText: false,
            });
            readableSessionDocs = sessionDocs.filter(
              (doc) => doc.text_status === "readable" || (doc.has_text && !doc.unreadable_text),
            );
            if (readableSessionDocs.length > 0) {
              break;
            }
            processingSessionDocs = sessionDocs.filter(
              (doc) => doc.text_status === "processing",
            );
            if (processingSessionDocs.length === 0) {
              break;
            }
          }
        }
      }

      if (readableSessionDocs.length === 0) {
        const processingSessionDocs = sessionDocs.filter(
          (doc) => doc.text_status === "processing",
        );
        if (processingSessionDocs.length > 0) {
          summary =
            processingSessionDocs.length === 1
              ? "Your attached document is still being processed."
              : "Your attached documents are still being processed.";
          processingSessionDocs.forEach((doc) => {
            details.push(`${formatDocumentLabel(doc)} - processing`);
          });
        } else {
          const reasonDetails = sessionDocs.map((doc) => ({
            label: formatDocumentLabel(doc),
            reason: describeUnreadableReason(doc),
            code: getUnreadableReasonCode(doc),
          }));
          const hasUnsupportedType = reasonDetails.some(
            (item) => item.code === "unsupported_type",
          );
          const hasMissingOcr = reasonDetails.some((item) =>
            item.reason.toLowerCase().includes("tesseract"),
          );
          const hasPdfUnsupported = reasonDetails.some((item) =>
            item.reason.toLowerCase().includes("pdf-to-image converter"),
          );
          const hasNoReadableText = reasonDetails.some((item) =>
            ["no_pdf_text", "no_docx_text", "empty_text", "ocr_empty"].includes(item.code),
          );
          summary = hasUnsupportedType
            ? "Unable to read attached documents because one or more files use unsupported types."
            : hasMissingOcr
            ? "Unable to read attached documents because OCR is unavailable on this machine."
            : hasPdfUnsupported
              ? "Unable to read attached PDF documents because PDF OCR conversion is not configured."
              : hasNoReadableText
                ? "Attached documents do not contain readable text."
                : "Attached documents are unreadable.";
          reasonDetails.forEach((item) => {
            details.push(`${item.label} - ${item.reason}`);
          });
        }
        sources.push({ sourceType: "system", reference: "documents.metadata", note: "Session documents" });
        data = sessionDocs.map((doc) => ({ ...doc, id: doc.document_id }));
        return { data, title, summary };
      }

      const docQuery = extractDocumentQuery(message);
      const normalizedQuery = normalizeText(docQuery);

      // Match by name if user specified a filename
      const matchedSessionDocs = normalizedQuery
        ? readableSessionDocs.filter((doc) =>
            normalizeText(doc.title || doc.original_filename).includes(normalizedQuery),
          )
        : [];

      let sessionDoc = null;
      if (matchedSessionDocs.length === 1) {
        sessionDoc = matchedSessionDocs[0];
      } else if (!normalizedQuery && readableSessionDocs.length === 1) {
        sessionDoc = readableSessionDocs[0];
      }

      if (!sessionDoc) {
        const listTarget =
          normalizedQuery && matchedSessionDocs.length > 0
            ? matchedSessionDocs
            : readableSessionDocs;
        summary = normalizedQuery
          ? `No attached document found matching "${docQuery}".`
          : "Which attached document should I summarize?";
        listTarget.slice(0, 8).forEach((doc) => {
          details.push(formatDocumentLabel(doc));
        });
        sources.push({ sourceType: "system", reference: "documents.metadata", note: "Session documents" });
        data = listTarget.map((doc) => ({ ...doc, id: doc.document_id }));
        return { data, title, summary };
      }

      if (sessionDoc) {
        const selectedLabel = sessionDoc.title || sessionDoc.original_filename || "Document";
        const textResult = this._loadDocumentTexts([sessionDoc.document_id], context);
        if (!textResult.permitted) {
          summary = "Document access not available.";
          details.push(textResult.message || "Document access is restricted.");
          data = { ...sessionDoc, id: sessionDoc.document_id };
          return { data, title, summary };
        }
        if (textResult.permitted) {
          const textDoc = Array.isArray(textResult.documents) ? textResult.documents[0] : null;
          if (!textDoc || !textDoc.document_text) {
            const unreadableReason = describeUnreadableReason(textDoc || sessionDoc);
            summary = buildUnreadableSummary(selectedLabel, textDoc || sessionDoc);
            details.push(`${selectedLabel} - ${unreadableReason}`);
            sources.push({ sourceType: "system", reference: "documents.metadata", note: "Session documents" });
            data = { ...sessionDoc, id: sessionDoc.document_id };
            return { data, title, summary };
          }
          if (textDoc && textDoc.document_text) {
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
            const sourceValue = textDoc.text_source || sessionDoc.text_source;
            if (sourceValue) {
              details.push(`Source: ${sourceValue === "ocr" ? "OCR" : sourceValue}`);
            }
            const lengthLabel = formatDocLength(textDoc.text_length || sessionDoc.text_length);
            if (lengthLabel) {
              details.push(`Text length: ${lengthLabel} characters`);
            }
            sources.push({ sourceType: "system", reference: "documents.text", note: "Document text" });
            sources.push({ sourceType: "system", reference: "documents.metadata", note: "Document metadata" });
            data = { ...sessionDoc, id: sessionDoc.document_id };
            return { data, title, summary };
          }
        }
      }
    }
  }
  // --- End session-attached document resolution ---

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
    const unreadableReason = describeUnreadableReason(textDoc || selectedDoc);
    summary = buildUnreadableSummary(selectedLabel, textDoc || selectedDoc);
    details.push(`${selectedLabel} - ${unreadableReason}`);
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
