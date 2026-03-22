"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { generateDraftTool } = require("../../../../.agent-build/agent/tools/draft/generateDraft.tool");

const handler = generateDraftTool.handler;
const EMPTY_CONTEXT = {};

test("draft contract: FR structured court letter produces correct artifact shape", async () => {
  const result = await handler(EMPTY_CONTEXT, {
    draftType: "court_letter",
    title: "Conclusions récapitulatives",
    subtitle: "Dossier D-2024-019 — Tribunal de première instance, Casablanca",
    metadata: { client: "Leila Ben Youssef", dossier: "D-2024-019", language: "fr" },
    sections: [
      { role: "date", text: "Casablanca, le 19 mars 2026" },
      { role: "recipient", text: "Monsieur le Président du Tribunal de première instance" },
      { role: "reference", label: "Réf :", text: "D-2024-019" },
      { role: "subject", label: "Objet :", text: "Conclusions récapitulatives" },
      { role: "salutation", text: "Monsieur le Président," },
      { role: "body", text: "Plaise au tribunal de bien vouloir noter que notre cliente conteste les faits allégués." },
      { role: "body", text: "En effet, les éléments de preuve produits par la partie adverse sont insuffisants." },
      { role: "closing", text: "Dans l'attente de votre décision, veuillez agréer, Monsieur le Président, l'expression de notre haute considération." },
      { role: "signature_name", text: "Me Youssef Amrani" },
      { role: "signature_title", text: "Avocat au barreau de Casablanca" },
    ],
    layout: { direction: "ltr", language: "fr", formality: "formal", documentClass: "court_letter" },
  });

  assert.equal(result.ok, true);
  const artifact = result.data.artifact;
  assert.equal(artifact.draftType, "court_letter");
  assert.equal(artifact.title, "Conclusions récapitulatives");
  assert.ok(artifact.subtitle.includes("D-2024-019"));
  assert.equal(artifact.sections.length, 10);
  assert.equal(artifact.sections[0].role, "date");
  assert.equal(artifact.sections[3].role, "subject");
  assert.equal(artifact.sections[3].label, "Objet :");
  assert.equal(artifact.sections[8].role, "signature_name");
  assert.equal(artifact.layout.direction, "ltr");
  assert.equal(artifact.layout.language, "fr");
  assert.equal(artifact.layout.formality, "formal");
  assert.equal(artifact.layout.documentClass, "court_letter");
  assert.ok(artifact.content.length > 0);
  assert.ok(artifact.generatedAt);
  assert.equal(artifact.version, 1);
  assert.equal(artifact.metadata.client, "Leila Ben Youssef");
});

test("draft contract: AR RTL court request produces correct layout and direction", async () => {
  const result = await handler(EMPTY_CONTEXT, {
    draftType: "court_letter",
    title: "مقال افتتاحي",
    metadata: { language: "ar" },
    sections: [
      { role: "heading", text: "بسم الله الرحمن الرحيم" },
      { role: "recipient", text: "السيد رئيس المحكمة الابتدائية بالدار البيضاء" },
      { role: "reference", label: "الملف عدد:", text: "2026/1/1234" },
      { role: "subject", label: "الموضوع:", text: "مقال افتتاحي في دعوى مدنية" },
      { role: "body", text: "يتشرف العارض بأن يعرض على محكمتكم الموقرة الوقائع التالية." },
      { role: "body", text: "حيث إن المدعى عليه امتنع عن تنفيذ التزاماته التعاقدية." },
      { role: "closing", text: "لأجله، يلتمس العارض من محكمتكم الموقرة الحكم وفق الطلب." },
      { role: "signature_name", text: "الأستاذ يوسف العمراني" },
    ],
    layout: { direction: "rtl", language: "ar", formality: "formal", documentClass: "court_request" },
  });

  assert.equal(result.ok, true);
  const artifact = result.data.artifact;
  assert.equal(artifact.layout.direction, "rtl");
  assert.equal(artifact.layout.language, "ar");
  assert.equal(artifact.layout.formality, "formal");
  assert.equal(artifact.layout.documentClass, "court_request");
  assert.equal(artifact.sections.length, 8);
  assert.equal(artifact.sections[0].role, "heading");
  assert.ok(artifact.sections[0].text.includes("بسم الله"));
  assert.equal(artifact.sections[2].role, "reference");
  assert.equal(artifact.sections[2].label, "الملف عدد:");
});

test("draft contract: AR text auto-detects rtl direction when layout omitted", async () => {
  const result = await handler(EMPTY_CONTEXT, {
    draftType: "court_letter",
    title: "طلب",
    sections: [
      { role: "body", text: "السلام عليكم ورحمة الله وبركاته" },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.artifact.layout.direction, "rtl");
  assert.equal(result.data.artifact.layout.language, "ar");
});

test("draft contract: FR text auto-detects language when layout omitted", async () => {
  const result = await handler(EMPTY_CONTEXT, {
    draftType: "client_letter",
    title: "Lettre",
    sections: [
      { role: "body", text: "Veuillez agréer l'expression de nos salutations distinguées." },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.artifact.layout.language, "fr");
  assert.equal(result.data.artifact.layout.direction, "ltr");
});

test("draft contract: legacy content fallback wraps into single body section", async () => {
  const result = await handler(EMPTY_CONTEXT, {
    draftType: "email",
    title: "Quick note",
    content: "This is a plain text email.",
  });

  assert.equal(result.ok, true);
  const artifact = result.data.artifact;
  assert.equal(artifact.sections.length, 1);
  assert.equal(artifact.sections[0].role, "body");
  assert.equal(artifact.sections[0].text, "This is a plain text email.");
  assert.equal(artifact.sections[0].id, "sec_1");
});

test("draft contract: empty sections and empty content returns error", async () => {
  const result = await handler(EMPTY_CONTEXT, {
    draftType: "memo",
    title: "Empty",
    sections: [],
    content: "",
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "INVALID_DRAFT_SECTIONS");
});

test("draft contract: unknown roles are normalized to body", async () => {
  const result = await handler(EMPTY_CONTEXT, {
    draftType: "memo",
    title: "Test",
    sections: [
      { role: "unknown_role_xyz", text: "Should become body" },
      { role: "body", text: "Already body" },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.artifact.sections[0].role, "body");
  assert.equal(result.data.artifact.sections[1].role, "body");
});

test("draft contract: section ids are auto-generated when missing", async () => {
  const result = await handler(EMPTY_CONTEXT, {
    draftType: "memo",
    title: "Test",
    sections: [
      { role: "body", text: "First" },
      { role: "body", text: "Second" },
      { id: "custom_id", role: "closing", text: "End" },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.artifact.sections[0].id, "sec_1");
  assert.equal(result.data.artifact.sections[1].id, "sec_2");
  assert.equal(result.data.artifact.sections[2].id, "custom_id");
});

test("draft contract: sections capped at 60", async () => {
  const sections = Array.from({ length: 80 }, (_, i) => ({
    role: "body",
    text: `Section ${i + 1}`,
  }));

  const result = await handler(EMPTY_CONTEXT, {
    draftType: "memo",
    title: "Large",
    sections,
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.artifact.sections.length, 60);
});

test("draft contract: text truncated at max length", async () => {
  const longText = "A".repeat(15000);
  const result = await handler(EMPTY_CONTEXT, {
    draftType: "memo",
    title: "Test",
    sections: [{ role: "body", text: longText }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.artifact.sections[0].text.length, 12000);
});

test("draft contract: metadata category is DRAFT with correct draftType", async () => {
  const result = await handler(EMPTY_CONTEXT, {
    draftType: "demand_letter",
    title: "Mise en demeure",
    sections: [{ role: "body", text: "Test content" }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.metadata.category, "DRAFT");
  assert.equal(result.metadata.draftType, "demand_letter");
});

test("draft contract: structural roles produce valid sections", async () => {
  const result = await handler(EMPTY_CONTEXT, {
    draftType: "court_letter",
    title: "Structured",
    sections: [
      { role: "body", text: "Paragraph one" },
      { role: "spacer" },
      { role: "separator" },
      { role: "page_break" },
      { role: "body", text: "Paragraph two" },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.artifact.sections.length, 5);
  assert.equal(result.data.artifact.sections[1].role, "spacer");
  assert.equal(result.data.artifact.sections[2].role, "separator");
  assert.equal(result.data.artifact.sections[3].role, "page_break");
});

test("draft contract: formality defaults to formal when omitted", async () => {
  const result = await handler(EMPTY_CONTEXT, {
    draftType: "memo",
    title: "Test",
    sections: [{ role: "body", text: "Content" }],
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.artifact.layout.formality, "formal");
});
