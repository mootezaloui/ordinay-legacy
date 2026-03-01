"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");

const db = require("../../db/connection");
const documentsService = require("../documents.service");
const documentGenerationService = require("./documentGeneration.service");
const documentGenerationPreviewService = require("./documentGenerationPreview.service");
const { renderMarkdownToHtml } = require("./markdownRender.service");
const {
  DocumentFormat,
  DocumentOutputFormatPreference,
  DEFAULT_PREVIEW_FORMAT,
  chooseOutputFormats,
  formatToExtension,
  formatToMime,
  isIngestibleFormat,
  resolveIngestionDocType,
} = require("../../domain/documentFormatGovernance");

function ensureClientTarget() {
  const existing = db
    .prepare("SELECT id FROM clients WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 1")
    .get();
  if (existing?.id) {
    return { type: "client", id: Number(existing.id) };
  }

  const inserted = db
    .prepare("INSERT INTO clients (name, status) VALUES (@name, @status)")
    .run({
      name: `Format Harness ${Date.now()}`,
      status: "active",
    });
  return { type: "client", id: Number(inserted.lastInsertRowid) };
}

async function runPreviewConfirmAndGenerate({ target, canonicalFormat, formatSelection = null }) {
  const markdown = [
    "# Governance Harness",
    "",
    `Canonical format: ${canonicalFormat}`,
    "This content verifies preview -> confirm -> storage format governance.",
  ].join("\n");

  const preview = documentGenerationPreviewService.createPreview(
    {
      target,
      documentType: "TASK_MEMO",
      language: "en",
      canonicalFormat,
      previewFormat: DEFAULT_PREVIEW_FORMAT,
      formatSelection,
      format: canonicalFormat, // legacy compatibility field
      templateKey: "MARKDOWN_DIRECT",
      schemaVersion: "1.0.0",
      contentJson: {
        content: {
          title: `Governance Harness ${canonicalFormat.toUpperCase()}`,
          markdown,
        },
      },
      previewHtml: renderMarkdownToHtml(markdown, { language: "en" }),
    },
    {
      conversationId: `harness_${Date.now()}`,
      sessionId: `harness_${Date.now()}`,
      createdBy: "harness",
    },
  );

  assert.equal(preview.previewFormat, DEFAULT_PREVIEW_FORMAT);
  assert.equal(preview.canonicalFormat, canonicalFormat);
  if (formatSelection) {
    assert.equal(preview.formatSelection?.canonicalFormat, canonicalFormat);
  }

  let generated = null;
  await documentGenerationPreviewService.confirmPreview(preview.previewId, {
    createProposal: async ({ target: proposalTarget, payload }) => {
      assert.equal(payload.previewFormat, DEFAULT_PREVIEW_FORMAT);
      assert.equal(payload.canonicalFormat, canonicalFormat);
      assert.equal(payload.format, canonicalFormat);

      const generation = await documentGenerationService.generateFromAttachmentPayload({
        target: proposalTarget,
        payload,
        createdBy: "harness",
      });

      const document = documentsService.get(generation.documentId);
      assert.ok(document, "generated document row must exist");
      assert.ok(fs.existsSync(document.file_path), "generated file must exist on disk");
      assert.equal(document.mime_type, formatToMime(canonicalFormat));
      assert.ok(
        String(document.file_path || "")
          .toLowerCase()
          .endsWith(`.${formatToExtension(canonicalFormat)}`),
      );

      const ingestionType = resolveIngestionDocType({
        filePath: document.file_path,
        mimeType: document.mime_type,
      });
      assert.ok(isIngestibleFormat(ingestionType), "stored canonical document must be ingestible");

      generated = { generation, document, ingestionType };
      return {
        proposalId: `proposal_${Date.now()}`,
        requiresConfirmation: true,
        sessionId: null,
      };
    },
  });

  assert.ok(generated, "preview confirmation must lead to generated output");
  return generated;
}

test("preview html -> confirm -> canonical pdf storage remains ingestible", async () => {
  const target = ensureClientTarget();
  const result = await runPreviewConfirmAndGenerate({
    target,
    canonicalFormat: DocumentFormat.PDF,
  });
  assert.equal(result.ingestionType, "pdf");
});

test("auto selection scenarios map to canonical and remain ingestible", async () => {
  const target = ensureClientTarget();
  const scenarios = [
    {
      label: "table",
      artifactKind: "table",
      structureHints: {
        hasTabularData: false,
        requiresEditing: false,
        intendedForFiling: false,
      },
      expectedCanonical: DocumentFormat.XLSX,
    },
    {
      label: "editable",
      artifactKind: "document",
      structureHints: {
        hasTabularData: false,
        requiresEditing: true,
        intendedForFiling: false,
      },
      expectedCanonical: DocumentFormat.DOCX,
    },
    {
      label: "default",
      artifactKind: "document",
      structureHints: {
        hasTabularData: false,
        requiresEditing: false,
        intendedForFiling: true,
      },
      expectedCanonical: DocumentFormat.PDF,
    },
  ];

  for (const scenario of scenarios) {
    const selection = chooseOutputFormats({
      preference: DocumentOutputFormatPreference.AUTO,
      artifactKind: scenario.artifactKind,
      structureHints: scenario.structureHints,
    });
    assert.equal(selection.canonicalFormat, scenario.expectedCanonical, scenario.label);
    const result = await runPreviewConfirmAndGenerate({
      target,
      canonicalFormat: selection.canonicalFormat,
      formatSelection: selection,
    });
    assert.equal(result.ingestionType, scenario.expectedCanonical, scenario.label);
  }
});

test("explicit canonical docx/xlsx works end-to-end", async () => {
  const target = ensureClientTarget();
  for (const canonicalFormat of [DocumentFormat.DOCX, DocumentFormat.XLSX]) {
    const result = await runPreviewConfirmAndGenerate({ target, canonicalFormat });
    assert.equal(result.ingestionType, canonicalFormat);
  }
});
