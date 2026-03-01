"use strict";

const { parseJsonResponse } = require("../llm/llm.validation");
const {
  normalizeArtifactKind,
  normalizeStructureHints,
} = require("../../domain/documentFormatGovernance");
const {
  StorageHint,
  normalizeStorageHint,
} = require("../../domain/document.storage.resolver");

const OUTPUT_TYPES = new Set(["message", "document", "mutation", "research"]);

function parseFinalOutputContract(text) {
  const raw = String(text || "").trim();
  const parsed = parseJsonResponse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      error: {
        code: "OUTPUT_CONTRACT_INVALID_JSON",
        message: "Final assistant response must be valid JSON output contract.",
      },
    };
  }

  const outputType = String(parsed.outputType || "").trim().toLowerCase();
  const content = String(parsed.content || "");
  const title =
    parsed.title == null ? null : typeof parsed.title === "string" ? parsed.title : null;
  const metadata =
    parsed.metadata && typeof parsed.metadata === "object" && !Array.isArray(parsed.metadata)
      ? parsed.metadata
      : parsed.metadata == null
        ? {}
        : null;

  const errors = [];
  if (!OUTPUT_TYPES.has(outputType)) {
    errors.push({
      field: "outputType",
      message: "outputType must be one of: message, document, mutation, research",
    });
  }
  if (typeof parsed.content !== "string" || !content.trim()) {
    errors.push({
      field: "content",
      message: "content is required and must be a non-empty string",
    });
  }
  if (parsed.title != null && typeof parsed.title !== "string") {
    errors.push({
      field: "title",
      message: "title must be a string when provided",
    });
  }
  if (metadata === null) {
    errors.push({
      field: "metadata",
      message: "metadata must be an object when provided",
    });
  }

  if (errors.length > 0) {
    return {
      ok: false,
      error: {
        code: "OUTPUT_CONTRACT_SCHEMA_INVALID",
        message: "Final assistant response failed output contract validation.",
        details: errors,
      },
    };
  }

  const normalizedContract = {
    outputType,
    title: title ? title.trim() : null,
    content: content.trim(),
    metadata: metadata || {},
  };

  if (normalizedContract.outputType === "document") {
    const rawMetadata = normalizedContract.metadata || {};
    const artifactKind = normalizeArtifactKind(rawMetadata.artifactKind) || "document";
    const structureHints = normalizeStructureHints(rawMetadata.structureHints);
    const storageHint =
      normalizeStorageHint(rawMetadata.storageHint) || StorageHint.INHERIT;
    const warnings = [];

    if (rawMetadata.artifactKind != null && !normalizeArtifactKind(rawMetadata.artifactKind)) {
      warnings.push({
        code: "DOCUMENT_ARTIFACT_KIND_INVALID",
        message: "metadata.artifactKind is invalid; defaulted to 'document'.",
      });
    } else if (rawMetadata.artifactKind == null) {
      warnings.push({
        code: "DOCUMENT_ARTIFACT_KIND_MISSING",
        message: "metadata.artifactKind missing; defaulted to 'document'.",
      });
    }

    if (
      rawMetadata.structureHints != null &&
      (typeof rawMetadata.structureHints !== "object" || Array.isArray(rawMetadata.structureHints))
    ) {
      warnings.push({
        code: "DOCUMENT_STRUCTURE_HINTS_INVALID",
        message: "metadata.structureHints invalid; defaulted to deterministic false booleans.",
      });
    } else if (rawMetadata.structureHints == null) {
      warnings.push({
        code: "DOCUMENT_STRUCTURE_HINTS_MISSING",
        message: "metadata.structureHints missing; defaulted to deterministic false booleans.",
      });
    }

    if (rawMetadata.storageHint != null && !normalizeStorageHint(rawMetadata.storageHint)) {
      warnings.push({
        code: "DOCUMENT_STORAGE_HINT_INVALID",
        message: "metadata.storageHint is invalid; defaulted to 'inherit'.",
      });
    }

    normalizedContract.metadata = {
      ...rawMetadata,
      artifactKind,
      structureHints,
      storageHint,
      ...(warnings.length > 0 ? { _outputContractWarnings: warnings } : {}),
    };
  }

  return {
    ok: true,
    contract: normalizedContract,
  };
}

module.exports = {
  parseFinalOutputContract,
};
