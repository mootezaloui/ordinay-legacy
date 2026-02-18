"use strict";

function localVisualSummary(docType, filename) {
  const name = String(filename || "document");
  if (docType === "image") {
    return `Image analyzed offline (${name}). OCR text was extracted locally.`;
  }
  if (docType === "pdf") {
    return `PDF analyzed offline (${name}). Embedded text and OCR page context were merged locally.`;
  }
  if (docType === "docx") {
    return `DOCX analyzed offline (${name}). Native text extraction was used.`;
  }
  return `Document analyzed offline (${name}).`;
}

function buildArtifact({
  docId,
  docType,
  combinedText,
  pages,
  warnings,
  limitations,
  provenance,
  processingStats,
  needsUserContinue,
  remainingPages,
  filename,
}) {
  const normalizedPages = Array.isArray(pages) ? pages : [];
  const riskFlags = [...new Set([...(warnings || []), ...(limitations || [])])];
  return {
    extracted_text: combinedText || "",
    visual_summary: localVisualSummary(docType, filename),
    key_entities: [],
    risk_flags: riskFlags,
    docId,
    docType,
    combinedText: combinedText || "",
    pages: normalizedPages,
    languageGuess: null,
    processingStats: processingStats || {},
    limitations: limitations || [],
    provenance: provenance || {},
    needsUserContinue: Boolean(needsUserContinue),
    remainingPages: Array.isArray(remainingPages) ? remainingPages : [],
  };
}

module.exports = {
  buildArtifact,
};

