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
    const reason = doc?.text_failure_reason || doc?.failure_reason || null;
    if (doc?.text_status === "processing") {
      return "OCR in progress";
    }
    if (reason) {
      if (reason.startsWith("ocr_failed:")) {
        return `OCR failed (${reason.replace("ocr_failed:", "").trim()})`;
      }
      if (reason.startsWith("ocr_spawn_failed:")) {
        return `OCR failed to start (${reason.replace("ocr_spawn_failed:", "").trim()})`;
      }
      if (reason.startsWith("ingestion_error:")) {
        return `Ingestion error (${reason.replace("ingestion_error:", "").trim()})`;
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
      if (friendly[reason]) return friendly[reason];
    }
    const kind = detectDocumentKind(doc);
    if (kind === "image") return "image could not be read";
    if (kind === "pdf") return "PDF contains no readable text";
    if (kind === "docx") return "DOCX contains no readable text";
    if (kind === "text") return "text file contains no readable content";
    return "document unreadable";
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
      sources.push({
        sourceType: "system",
        reference: "documents.metadata",
        note: "Document metadata",
      });
      return;
    }
    const readableDocs = documents.filter(
      (doc) => doc.text_status === "readable" || (doc.has_text && !doc.unreadable_text),
    );
    const unreadableDocs = documents.filter(
      (doc) => doc.text_status === "unreadable" || doc.unreadable_text,
    );
    const processingDocs = documents.filter(
      (doc) =>
        doc.text_status === "processing" &&
        !readableDocs.includes(doc) &&
        !unreadableDocs.includes(doc),
    );

    details.push(
      `Documents: ${formatCount(documents.length)} attached; ${formatCount(
        readableDocs.length,
      )} readable, ${formatCount(unreadableDocs.length)} unreadable, ${formatCount(
        processingDocs.length,
      )} processing.`,
    );

    if (readableDocs.length > 0) {
      details.push(`Readable documents (${readableDocs.length}):`);
      readableDocs.forEach((doc) => {
        const length =
          typeof doc.text_length === "number" ? doc.text_length : null;
        const lengthLabel =
          length !== null ? `text loaded (${formatCount(length)} characters)` : "text loaded";
        const sourceLabel = doc.text_source === "ocr" ? " (OCR)" : "";
        details.push(`${formatDocumentLabel(doc)} - ${lengthLabel}${sourceLabel}`);
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

    if (processingDocs.length > 0) {
      details.push(`Processing documents (${processingDocs.length}):`);
      processingDocs.forEach((doc) => {
        details.push(`${formatDocumentLabel(doc)} - OCR in progress`);
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
