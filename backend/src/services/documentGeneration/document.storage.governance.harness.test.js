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
  DEFAULT_PREVIEW_FORMAT,
  isIngestibleFormat,
  resolveIngestionDocType,
} = require("../../domain/documentFormatGovernance");

function ensureClient() {
  const existing = db
    .prepare("SELECT id FROM clients WHERE deleted_at IS NULL ORDER BY id ASC LIMIT 1")
    .get();
  if (existing?.id) return Number(existing.id);
  const inserted = db
    .prepare("INSERT INTO clients (name, status) VALUES (@name, @status)")
    .run({
      name: `Storage Harness Client ${Date.now()}`,
      status: "active",
    });
  return Number(inserted.lastInsertRowid);
}

function ensureDossier(clientId) {
  const existing = db
    .prepare(
      "SELECT id FROM dossiers WHERE client_id = @client_id AND deleted_at IS NULL ORDER BY id DESC LIMIT 1",
    )
    .get({ client_id: clientId });
  if (existing?.id) return Number(existing.id);
  const ref = `DOS-${new Date().getFullYear()}-${Date.now()}`;
  const inserted = db
    .prepare(
      "INSERT INTO dossiers (reference, client_id, title, status, priority) VALUES (@reference, @client_id, @title, @status, @priority)",
    )
    .run({
      reference: ref,
      client_id: clientId,
      title: `Storage Harness Dossier ${Date.now()}`,
      status: "open",
      priority: "medium",
    });
  return Number(inserted.lastInsertRowid);
}

function ensureTask(dossierId) {
  const inserted = db
    .prepare(
      "INSERT INTO tasks (dossier_id, lawsuit_id, title, status, priority) VALUES (@dossier_id, NULL, @title, @status, @priority)",
    )
    .run({
      dossier_id: dossierId,
      title: `Storage Harness Task ${Date.now()}`,
      status: "todo",
      priority: "medium",
    });
  return Number(inserted.lastInsertRowid);
}

async function confirmAndMaybeGenerate({ target, storageGovernance, title }) {
  const markdown = `# ${title}\n\nStorage governance harness content.`;
  const preview = documentGenerationPreviewService.createPreview(
    {
      target,
      documentType: "TASK_MEMO",
      language: "en",
      // Scope-governance tests validate attachment targeting, not PDF rendering.
      canonicalFormat: DocumentFormat.DOCX,
      previewFormat: DEFAULT_PREVIEW_FORMAT,
      format: DocumentFormat.DOCX,
      templateKey: "MARKDOWN_DIRECT",
      schemaVersion: "1.0.0",
      storageGovernance,
      contentJson: {
        content: {
          title,
          markdown,
        },
      },
      previewHtml: renderMarkdownToHtml(markdown, { language: "en" }),
    },
    {
      conversationId: `storage_harness_${Date.now()}`,
      sessionId: `storage_harness_${Date.now()}`,
      createdBy: "storage_harness",
    },
  );

  let generation = null;
  const output = await documentGenerationPreviewService.confirmPreview(preview.previewId, {
    createProposal: async ({ target: resolvedTarget, payload }) => {
      if (String(payload?.storageGovernance?.status || "").toLowerCase() === "missing") {
        return {
          type: "context_suggestion",
          message: "Scope missing for storage.",
          entityType: "dossier",
          reason: "missing_context",
          suggestions: [],
          timestamp: new Date().toISOString(),
          allowManualInput: true,
          manualInputHint: "Select a dossier or client.",
        };
      }
      generation = await documentGenerationService.generateFromAttachmentPayload({
        target: resolvedTarget,
        payload,
        createdBy: "storage_harness",
      });
      return {
        proposalId: `proposal_${Date.now()}`,
        requiresConfirmation: true,
        sessionId: null,
      };
    },
  });

  return {
    preview,
    output,
    generation,
    storedPreview: documentGenerationPreviewService.getPreviewByUid(preview.previewId),
  };
}

test("resolved dossier scope stores generated document under dossier_id", async () => {
  const clientId = ensureClient();
  const dossierId = ensureDossier(clientId);

  const result = await confirmAndMaybeGenerate({
    target: { type: "client", id: clientId },
    storageGovernance: {
      storageHint: "inherit",
      activeScope: {
        clientId,
        dossierId,
      },
    },
    title: `Storage Harness Dossier ${Date.now()}`,
  });

  assert.ok(result.generation, "generation should be created");
  const document = documentsService.get(result.generation.documentId);
  assert.equal(Number(document?.dossier_id || 0), dossierId);
  assert.equal(document?.client_id, null);
  assert.ok(fs.existsSync(document.file_path), "generated file should exist");
  const ingestType = resolveIngestionDocType({
    filePath: document.file_path,
    mimeType: document.mime_type,
  });
  assert.equal(isIngestibleFormat(ingestType), true);
});

test("client-only scope stores generated document under client_id", async () => {
  const clientId = ensureClient();

  const result = await confirmAndMaybeGenerate({
    target: { type: "client", id: clientId },
    storageGovernance: {
      storageHint: "inherit",
      activeScope: {
        clientId,
      },
    },
    title: `Storage Harness Client ${Date.now()}`,
  });

  assert.ok(result.generation, "generation should be created");
  const document = documentsService.get(result.generation.documentId);
  assert.equal(Number(document?.client_id || 0), clientId);
});

test("explicit client storageHint overrides deeper task scope", async () => {
  const clientId = ensureClient();
  const dossierId = ensureDossier(clientId);
  const taskId = ensureTask(dossierId);

  const result = await confirmAndMaybeGenerate({
    target: { type: "task", id: taskId },
    storageGovernance: {
      storageHint: "client",
      activeScope: {
        taskId,
        dossierId,
        clientId,
      },
    },
    title: `Storage Harness Explicit Client ${Date.now()}`,
  });

  assert.ok(result.generation, "generation should be created");
  const document = documentsService.get(result.generation.documentId);
  assert.equal(Number(document?.client_id || 0), clientId);
  assert.equal(document?.task_id, null);
});

test("missing scope returns context_suggestion and does not mark preview proposed", async () => {
  const clientId = ensureClient();
  const result = await confirmAndMaybeGenerate({
    target: { type: "client", id: clientId },
    storageGovernance: {
      storageHint: "dossier",
      activeScope: {
        clientId,
      },
    },
    title: `Storage Harness Missing Scope ${Date.now()}`,
  });

  assert.equal(result.generation, null);
  assert.equal(result.output?.type, "context_suggestion");
  assert.equal(String(result.storedPreview?.status || "").toLowerCase(), "preview_ready");
});
