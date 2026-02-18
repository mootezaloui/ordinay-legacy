"use strict";

const assert = require("assert");
const { buildDraftContext } = require("./draft.context.builder");
const operatorsService = require("../../services/operators.service");

async function testOfficialDraftIncludesBoundLawyerIdentity() {
  const originalGetCurrentOperator = operatorsService.getCurrentOperator;
  operatorsService.getCurrentOperator = () => ({
    id: 1,
    name: "Amina El Idrissi",
    title: "Attorney",
    office_name: "Cabinet Amina",
    office_address: "12 Rue Example, Casablanca",
    email: "amina@example.com",
    phone: "+212600000000",
    bar_number: "BAR-5541",
  });

  const fakeContext = {
    async _callReadTool(toolName, params) {
      if (toolName === "getDossier") {
        return {
          dossier: {
            id: params.dossierId,
            reference: "DOS-2026-009",
            court: "Rabat Court",
            client_id: 7,
          },
        };
      }
      if (toolName === "getClient") {
        return { client: { id: 7, name: "Youssef Daly" } };
      }
      return {};
    },
  };

  try {
    const result = await buildDraftContext.call(fakeContext, {
      entityType: "dossier",
      entityId: 10,
      draftType: "COURT_MOTION",
      originalMessage: "Draft an official court motion for this case.",
      policy: { version: "v3" },
    });

    assert.strictEqual(result.isComplete, true);
    assert.strictEqual(result.context.author.name, "Amina El Idrissi");
    assert.strictEqual(result.context.author.licenseNumber, "BAR-5541");
    assert.strictEqual(result.context.matter.dossierReference, "DOS-2026-009");
    assert.strictEqual(result.context.matter.courtName, "Rabat Court");
    assert.ok(!/\[.*?\]/.test(JSON.stringify(result.context)));
  } finally {
    operatorsService.getCurrentOperator = originalGetCurrentOperator;
  }
}

async function testMissingLegalArticleDoesNotBlockContextBuild() {
  const originalGetCurrentOperator = operatorsService.getCurrentOperator;
  operatorsService.getCurrentOperator = () => ({
    id: 1,
    name: "Amina El Idrissi",
    office_address: "12 Rue Example, Casablanca",
    email: "amina@example.com",
    bar_number: "BAR-5541",
  });

  const fakeContext = {
    async _callReadTool(toolName, params) {
      if (toolName === "getDossier") {
        return {
          dossier: {
            id: params.dossierId,
            reference: "DOS-2026-111",
            client_id: 8,
          },
        };
      }
      if (toolName === "getClient") {
        return { client: { id: 8, name: "Client Eight" } };
      }
      return {};
    },
  };

  try {
    const result = await buildDraftContext.call(fakeContext, {
      entityType: "dossier",
      entityId: 11,
      draftType: "COURT_MOTION",
      originalMessage: "Prepare a court motion and cite the applicable legal article.",
      policy: { version: "v3" },
    });

    assert.strictEqual(result.isComplete, true);
    assert.ok(
      !result.ambiguities.some((item) => item.type === "missing_legal_article"),
    );
    assert.strictEqual(result.context.legalReference, null);
  } finally {
    operatorsService.getCurrentOperator = originalGetCurrentOperator;
  }
}

async function run() {
  await testOfficialDraftIncludesBoundLawyerIdentity();
  await testMissingLegalArticleDoesNotBlockContextBuild();
  console.log("draft.context.builder tests passed");
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { run };
