"use strict";

const assert = require("assert");

const documentsService = require("../../../services/documents.service");
const listDocumentsTool = require("./listDocuments.tool");
const getDocumentTool = require("./getDocument.tool");

function backupServiceMethods() {
  return {
    list: documentsService.list,
    get: documentsService.get,
  };
}

function restoreServiceMethods(backup) {
  documentsService.list = backup.list;
  documentsService.get = backup.get;
}

function applyFixture() {
  const documents = [
    {
      id: 1,
      document_id: 1,
      title: "Official Letter",
      original_filename: "official_letter.pdf",
      notes: "Client-facing letter",
      text_status: "readable",
      dossier_id: 10,
      uploaded_at: "2026-02-19T10:00:00.000Z",
    },
    {
      id: 2,
      document_id: 2,
      title: "Evidence Attachment",
      original_filename: "evidence_scan.png",
      notes: "",
      text_status: "processing",
      dossier_id: 10,
      uploaded_at: "2026-02-20T10:00:00.000Z",
    },
  ];

  documentsService.list = (filters = {}) => {
    if (filters.dossier_id) {
      return documents.filter((doc) => Number(doc.dossier_id) === Number(filters.dossier_id));
    }
    return documents;
  };
  documentsService.get = (id) => documents.find((doc) => Number(doc.id) === Number(id)) || null;
}

async function testListDocumentsByScope() {
  const result = await listDocumentsTool.handler({ dossierId: 10, limit: 20 });
  assert.strictEqual(result.count, 2);
  assert.strictEqual(result.documents[0].document_id, 2);
  assert.strictEqual(result.documents[1].document_id, 1);
}

async function testGetDocumentByQuery() {
  const result = await getDocumentTool.handler({ dossierId: 10, query: "official_letter" });
  assert.ok(result.document);
  assert.strictEqual(result.document.document_id, 1);
}

async function run() {
  const backup = backupServiceMethods();
  try {
    applyFixture();
    await testListDocumentsByScope();
    await testGetDocumentByQuery();
    console.log("documentRead.tools.test.js: all tests passed");
  } finally {
    restoreServiceMethods(backup);
  }
}

run().catch((error) => {
  console.error("documentRead.tools.test.js: failed");
  console.error(error);
  process.exitCode = 1;
});

