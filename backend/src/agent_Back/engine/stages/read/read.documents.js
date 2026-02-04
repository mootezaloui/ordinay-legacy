"use strict";

const { selectRelevantDocuments } = require("../../../llm.client");

function createDocumentAppender({
  engine,
  context,
  policy,
  message,
  details,
  sources,
}) {
  const formatDocumentLabel = (doc) => {
    const name = doc.title || doc.original_filename || "Untitled document";
    return `${name} (ID: ${doc.document_id})`;
  };

  const appendDocumentDetails = async (entityType, entity) => {
    if (!entity || !entity.id) return;
    const docResult = engine._loadDocumentMetadata(
      entityType,
      entity.id,
      context,
      {
        previewLength: 200,
      },
    );
    if (!docResult.permitted) {
      details.push("Documents considered (0).");
      details.push("Documents excluded: access disabled.");
      return;
    }
    const documents = docResult.documents || [];
    entity.documents = documents;
    if (documents.length === 0) {
      details.push("Documents considered (0).");
      details.push("Documents excluded (0).");
      return;
    }
    const isTaggedIrrelevant = (doc) => {
      const tags = [];
      if (Array.isArray(doc.tags)) tags.push(...doc.tags);
      if (Array.isArray(doc.metadata?.tags)) tags.push(...doc.metadata.tags);
      if (typeof doc.tags === "string") {
        doc.tags.split(",").forEach((tag) => tags.push(tag.trim()));
      }
      if (typeof doc.tag === "string") tags.push(doc.tag.trim());
      return tags.some(
        (tag) => String(tag || "").toLowerCase() === "irrelevant",
      );
    };

    const excluded = documents.filter(
      (doc) =>
        !doc.has_text || doc.unreadable_text || isTaggedIrrelevant(doc),
    );
    const considered = documents.filter(
      (doc) =>
        doc.has_text && !doc.unreadable_text && !isTaggedIrrelevant(doc),
    );

    details.push(`Documents reviewed (${considered.length}):`);
    considered.forEach((doc) => {
      details.push(`${formatDocumentLabel(doc)} — text available`);
    });
    details.push(`Documents excluded (${excluded.length}):`);
    excluded.forEach((doc) => {
      const reason = isTaggedIrrelevant(doc)
        ? "tagged irrelevant"
        : doc.unreadable_text
          ? "text unavailable (unreadable)"
          : "text unavailable";
      details.push(`${formatDocumentLabel(doc)} — ${reason}`);
    });

    if (policy.version === "v1" && considered.length > 0) {
      const selection = await selectRelevantDocuments({
        question: message,
        entityType,
        entityId: entity.id,
        documents: considered,
      });

      if (!selection) {
        details.push("Relevance gate: unavailable. No documents selected.");
      } else {
        const selectedMap = new Map();
        selection.selected.forEach((item) => {
          const reason = item.reason || "Relevant to the current request.";
          selectedMap.set(item.document_id, reason);
        });

        const selectedDocs = considered.filter((doc) =>
          selectedMap.has(doc.document_id),
        );
        const excludedByGate = considered.filter(
          (doc) => !selectedMap.has(doc.document_id),
        );

        details.push(`Documents selected (${selectedDocs.length}):`);
        selectedDocs.forEach((doc) => {
          details.push(
            `${formatDocumentLabel(doc)} — ${selectedMap.get(doc.document_id)}`,
          );
        });
        details.push(
          `Documents excluded by relevance (${excludedByGate.length}):`,
        );
        excludedByGate.forEach((doc) => {
          details.push(
            `${formatDocumentLabel(doc)} — not relevant to this request`,
          );
        });

        if (selectedDocs.length > 0) {
          const textResult = engine._loadDocumentTexts(
            selectedDocs.map((doc) => doc.document_id),
            context,
          );
          if (textResult.permitted) {
            entity.document_texts = textResult.documents;
          }
        }
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
