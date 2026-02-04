"use strict";

const path = require("path");
const { resolveEntityDisplayLabel } = require("../../../utils/entityDisplay");

function createDocumentAppender({
  engine,
  context,
  policy,
  message,
  details,
  sources,
}) {
  const documentMode = policy?.documentHandling?.mode
    ? String(policy.documentHandling.mode).toLowerCase()
    : policy?.version === "v1"
      ? "text"
      : "metadata";
  const allowText = documentMode === "text" || documentMode === "analyzed";

  const formatDocumentLabel = (doc) => {
    return resolveEntityDisplayLabel("document", doc, {
      fallback: "Document",
    });
  };

  const formatCount = (value) => {
    if (!Number.isFinite(value)) return "0";
    return new Intl.NumberFormat("en-US").format(value);
  };

  const getDocumentExtension = (doc) => {
    const source =
      doc?.original_filename ||
      doc?.file_path ||
      doc?.title ||
      doc?.name ||
      "";
    return path.extname(String(source)).toLowerCase();
  };

  const detectDocumentKind = (doc) => {
    const mime = String(doc?.mime_type || "").toLowerCase();
    const ext = getDocumentExtension(doc);
    if (mime.startsWith("image/")) return "image";
    if (mime === "application/pdf" || ext === ".pdf") return "pdf";
    if (
      mime ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ext === ".docx"
    ) {
      return "docx";
    }
    if (
      mime.startsWith("text/") ||
      mime === "application/json" ||
      [".txt", ".md", ".csv", ".json", ".rtf"].includes(ext)
    ) {
      return "text";
    }
    return "unknown";
  };

  const describeUnreadableReason = (doc) => {
    const kind = detectDocumentKind(doc);
    if (kind === "image") {
      return "image file (not readable in this version)";
    }
    if (kind === "pdf") {
      return "PDF with no embedded text (not readable in this version)";
    }
    if (kind === "docx") {
      return "DOCX with no extractable text (not readable in this version)";
    }
    if (kind === "text") {
      return "text file with no readable content (not readable in this version)";
    }
    return "content not readable in this version";
  };

  const appendDocumentDetails = async (entityType, entity) => {
    if (!entity || !entity.id) return;
    const docResult = engine._loadDocumentMetadata(
      entityType,
      entity.id,
      context,
      { previewLength: 0 },
    );
    if (!docResult.permitted) {
      details.push("Documents: access not available.");
      return;
    }
    const documents = docResult.documents || [];
    entity.documents = documents;
    if (documents.length === 0) {
      details.push("Documents: none attached.");
      sources.push({
        sourceType: "system",
        reference: "documents.metadata",
        note: "Document metadata",
      });
      return;
    }
    const readableDocs = documents.filter(
      (doc) => doc.has_text && !doc.unreadable_text,
    );
    const unreadableDocs = documents.filter(
      (doc) => !doc.has_text || doc.unreadable_text,
    );

    details.push(
      `Documents: ${formatCount(documents.length)} attached; ${formatCount(
        readableDocs.length,
      )} readable, ${formatCount(unreadableDocs.length)} not readable.`,
    );

    if (readableDocs.length > 0) {
      details.push(`Readable documents (${readableDocs.length}):`);
      readableDocs.forEach((doc) => {
        const length =
          typeof doc.text_length === "number" ? doc.text_length : null;
        const lengthLabel =
          length !== null ? `text loaded (${formatCount(length)} characters)` : "text loaded";
        details.push(`${formatDocumentLabel(doc)} - ${lengthLabel}`);
      });
    }

    if (unreadableDocs.length > 0) {
      details.push(`Unreadable documents (${unreadableDocs.length}):`);
      unreadableDocs.forEach((doc) => {
        details.push(
          `${formatDocumentLabel(doc)} - ${describeUnreadableReason(doc)}`,
        );
      });
    }

    if (allowText && readableDocs.length > 0) {
      const textResult = engine._loadDocumentTexts(
        readableDocs.map((doc) => doc.document_id),
        context,
      );
      if (textResult.permitted) {
        entity.document_texts = textResult.documents;
        sources.push({
          sourceType: "system",
          reference: "documents.text",
          note: "Document text",
        });
      } else {
        details.push(
          "Document text access not available; showing metadata only.",
        );
      }
    }

    sources.push({
      sourceType: "system",
      reference: "documents.metadata",
      note: "Document metadata",
    });
  };

  return {
    appendDocumentDetails,
  };
}

module.exports = {
  createDocumentAppender,
};
