"use strict";

const assert = require("assert");
const { resolveChatAmbiguity } = require("./chat.ambiguity.resolver");

function createEngine() {
  return {
    async resolveEntity({ entityType, identifier, mode }) {
      const idText = String(identifier || "").toLowerCase().trim();
      if (entityType === "client" && idText === "youssef daly") {
        return { found: true, entityId: 7, entity: { id: 7, name: "Youssef Daly" } };
      }
      if (entityType === "dossier" && mode === "id" && String(identifier) === "12") {
        return { found: true, entityId: 12, entity: { id: 12, title: "DOS-12" } };
      }
      if (entityType === "dossier" && idText === "unique dossier") {
        return { found: true, entityId: 44, entity: { id: 44, title: "Unique Dossier" } };
      }
      if (entityType === "dossier" && idText === "ambiguous dossier") {
        return {
          found: false,
          reason: "ambiguous",
          candidates: [
            { id: 10, name: "Dossier A", score: 0.95 },
            { id: 11, name: "Dossier B", score: 0.86 },
          ],
        };
      }
      if (entityType === "dossier" && idText === "weak ambiguous dossier") {
        return {
          found: false,
          reason: "ambiguous",
          candidates: [
            { id: 20, name: "Dossier A", score: 0.91 },
            { id: 21, name: "Dossier B", score: 0.89 },
          ],
        };
      }
      return { found: false, reason: "not_found" };
    },
    async _callReadTool(toolName) {
      if (toolName === "listClients") {
        return {
          clients: [
            { id: 7, name: "Youssef Daly", email: "youssef@example.com" },
            { id: 8, name: "Yassine Khalifi", email: "yassine@example.com" },
          ],
        };
      }
      if (toolName === "listDossiersForClient") {
        return {
          dossiers: [
            {
              id: 10,
              title: "قضية طلاق زوجية",
              reference: "DOS-2026-198756",
              client_name: "Youssef Daly",
            },
            {
              id: 13,
              title: "Commercial Case",
              reference: "DOS-2026-555555",
              client_name: "Youssef Daly",
            },
          ],
        };
      }
      if (toolName === "listDossiers") {
        return {
          dossiers: [
            {
              id: 10,
              title: "قضية طلاق زوجية",
              reference: "DOS-2026-198756",
              client_name: "نور الدين",
              phase: "Negotiation",
              status: "On Hold",
            },
            {
              id: 11,
              title: "قضية نفقة",
              reference: "DOS-2026-075241",
              client_name: "ياسين الخليفي",
              phase: "Investigation",
              status: "In Progress",
            },
            { id: 301, title: "Commercial Case", reference: "DOS-301" },
            { id: 302, title: "Divorce Case", reference: "DOS-302" },
          ],
        };
      }
      return {};
    },
  };
}

async function testExplicitIdResolves() {
  const engine = createEngine();
  const output = await resolveChatAmbiguity({
    engine,
    message: "Show dossier 12",
    policy: { version: "v3" },
    executionContext: { dataAccess: { dossiers: true } },
  });
  assert.strictEqual(output.status, "resolved");
  assert.strictEqual(output.resolvedScope.dossierId, 12);
}

async function testExactTypedNameResolves() {
  const engine = createEngine();
  const output = await resolveChatAmbiguity({
    engine,
    message: "Show dossier unique dossier",
    policy: { version: "v3" },
    executionContext: { dataAccess: { dossiers: true } },
  });
  assert.strictEqual(output.status, "resolved");
  assert.strictEqual(output.resolutionMeta.chosenId, 44);
}

async function testAmbiguousReturnsSuggestionArtifact() {
  const engine = createEngine();
  const output = await resolveChatAmbiguity({
    engine,
    message: "Show dossier weak ambiguous dossier",
    policy: { version: "v3" },
    executionContext: { dataAccess: { dossiers: true } },
  });
  assert.strictEqual(output.status, "ambiguous");
  assert.strictEqual(output.suggestionArtifact.type, "context_suggestion");
  assert.ok(Array.isArray(output.suggestionArtifact.suggestions));
  assert.ok(output.suggestionArtifact.suggestions.length >= 2);
}

async function testMissingContextReturnsSuggestionArtifact() {
  const engine = createEngine();
  const output = await resolveChatAmbiguity({
    engine,
    message: "Show dossier",
    policy: { version: "v3" },
    executionContext: { dataAccess: { dossiers: true } },
  });
  assert.strictEqual(output.status, "missing");
  assert.strictEqual(output.suggestionArtifact.reason, "missing_context");
  assert.ok(output.suggestionArtifact.suggestions.length > 0);
}

async function testNotFoundReturnsManualHint() {
  const engine = createEngine();
  const output = await resolveChatAmbiguity({
    engine,
    message: "Show dossier unknown dossier",
    policy: { version: "v3" },
    executionContext: { dataAccess: { dossiers: true } },
  });
  assert.strictEqual(output.status, "not_found");
  assert.strictEqual(output.suggestionArtifact.type, "context_suggestion");
  assert.ok(String(output.suggestionArtifact.manualInputHint || "").length > 0);
}

async function testAutopickTriggers() {
  const engine = createEngine();
  const output = await resolveChatAmbiguity({
    engine,
    message: "Show dossier ambiguous dossier",
    policy: { version: "v3" },
    executionContext: { dataAccess: { dossiers: true } },
  });
  assert.strictEqual(output.status, "resolved");
  assert.strictEqual(output.resolutionMeta.autoPicked, true);
  assert.strictEqual(output.resolutionMeta.chosenId, 10);
}

async function testAutopickSuppressedOnWeakMargin() {
  const engine = createEngine();
  const output = await resolveChatAmbiguity({
    engine,
    message: "Show dossier weak ambiguous dossier",
    policy: { version: "v3" },
    executionContext: { dataAccess: { dossiers: true } },
  });
  assert.strictEqual(output.status, "ambiguous");
  assert.strictEqual(output.resolutionMeta.autoPicked, false);
}

async function testDisabledDomainSkipped() {
  const engine = createEngine();
  const output = await resolveChatAmbiguity({
    engine,
    message: "Show dossier ambiguous dossier",
    policy: { version: "v3" },
    executionContext: { dataAccess: { dossiers: false } },
  });
  assert.strictEqual(output.status, "skipped");
}

async function testCombinedClientAndDossierPhraseResolvesScoped() {
  const engine = createEngine();
  const output = await resolveChatAmbiguity({
    engine,
    message:
      "you will help me work on youssef daly dossier which is the قضية طلاق زوجية",
    policy: { version: "v3" },
    executionContext: { dataAccess: { dossiers: true, clients: true } },
  });
  assert.strictEqual(output.status, "resolved");
  assert.strictEqual(output.resolvedScope.clientId, 7);
  assert.strictEqual(output.resolvedScope.dossierId, 10);
}

async function testArabicTitleOnlyResolves() {
  const engine = createEngine();
  const output = await resolveChatAmbiguity({
    engine,
    message: "show dossier قضية طلاق زوجية",
    policy: { version: "v3" },
    executionContext: { dataAccess: { dossiers: true } },
  });
  assert.strictEqual(output.status, "resolved");
  assert.ok(Number(output.resolutionMeta.chosenId) > 0);
}

async function testEnglishClientArabicDossierResolves() {
  const engine = createEngine();
  const output = await resolveChatAmbiguity({
    engine,
    message: "open dossier قضية طلاق زوجية for Youssef Daly",
    policy: { version: "v3" },
    executionContext: { dataAccess: { dossiers: true, clients: true } },
  });
  assert.strictEqual(output.status, "resolved");
  assert.strictEqual(output.resolvedScope.clientId, 7);
  assert.strictEqual(output.resolvedScope.dossierId, 10);
}

async function testScopedResolutionIgnoresDraftClauseTail() {
  const engine = createEngine();
  const output = await resolveChatAmbiguity({
    engine,
    message:
      "you will help me work on youssef daly dossier which is the قضية طلاق زوجية i need to write an official request for the jugdge to consider the case as a victim not as a suspect. can you do it.",
    policy: { version: "v3" },
    executionContext: { dataAccess: { dossiers: true, clients: true } },
  });
  assert.strictEqual(output.status, "resolved");
  assert.strictEqual(output.resolvedScope.clientId, 7);
  assert.strictEqual(output.resolvedScope.dossierId, 10);
}

async function run() {
  await testExplicitIdResolves();
  await testExactTypedNameResolves();
  await testMissingContextReturnsSuggestionArtifact();
  await testNotFoundReturnsManualHint();
  await testAutopickTriggers();
  await testAutopickSuppressedOnWeakMargin();
  await testAmbiguousReturnsSuggestionArtifact();
  await testDisabledDomainSkipped();
  await testCombinedClientAndDossierPhraseResolvesScoped();
  await testArabicTitleOnlyResolves();
  await testEnglishClientArabicDossierResolves();
  await testScopedResolutionIgnoresDraftClauseTail();
  console.log("chat.ambiguity.resolver tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
