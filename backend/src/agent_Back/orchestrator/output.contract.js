"use strict";

const { parseJsonResponse } = require("../llm/llm.validation");

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

  return {
    ok: true,
    contract: {
      outputType,
      title: title ? title.trim() : null,
      content: content.trim(),
      metadata: metadata || {},
    },
  };
}

module.exports = {
  parseFinalOutputContract,
};

