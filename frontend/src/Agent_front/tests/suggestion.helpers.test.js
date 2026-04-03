import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveAssistSuggestionDeclinePrompt,
  resolveAssistSuggestionQuestion,
  resolveAssistSuggestionPrompt,
  resolveSuggestionActionButtonLabel,
  resolveSuggestionActionMeta,
} from "../utils/suggestionHelpers.js";

test("frontend suggestion helper: domain-aware action meta for draft/execute", () => {
  const draftMeta = resolveSuggestionActionMeta({
    actionType: "GENERATE_DOCUMENT",
    domain: "draft",
  });
  assert.equal(draftMeta.label, "Draft");

  const executeCreateMeta = resolveSuggestionActionMeta({
    actionType: "CREATE_ENTITY",
    domain: "execute",
  });
  assert.equal(executeCreateMeta.label, "Plan Create");

  const executeUpdateMeta = resolveSuggestionActionMeta({
    actionType: "ENRICH_FIELD",
    domain: "execute",
  });
  assert.equal(executeUpdateMeta.label, "Plan Update");

  const executeDeleteMeta = resolveSuggestionActionMeta({
    actionType: "DELETE_ENTITY",
    domain: "execute",
  });
  assert.equal(executeDeleteMeta.label, "Plan Delete");
});

test("frontend suggestion helper: domain-aware CTA button labels", () => {
  assert.equal(
    resolveSuggestionActionButtonLabel({ domain: "draft" }),
    "Use Draft",
  );
  assert.equal(
    resolveSuggestionActionButtonLabel({ domain: "execute" }),
    "Use Plan",
  );
  assert.equal(resolveSuggestionActionButtonLabel({}), "Do it");
});

test("frontend suggestion helper: CTA prompt prefers followUpPrompt then label fallback", () => {
  assert.equal(
    resolveAssistSuggestionPrompt({
      followUpPrompt: "Create a formal client letter draft.",
      label: "Ignored label",
      actionType: "GENERATE_DOCUMENT",
    }),
    "Create a formal client letter draft.",
  );

  assert.equal(
    resolveAssistSuggestionPrompt({
      followUpPrompt: "   ",
      label: "Update task status",
      actionType: "ENRICH_FIELD",
    }),
    "Update task status",
  );

  assert.equal(
    resolveAssistSuggestionPrompt({
      actionType: "GENERATE_DOCUMENT",
    }),
    "Create the suggested draft.",
  );
});

test("frontend suggestion helper: binary question copy is domain-aware", () => {
  assert.equal(
    resolveAssistSuggestionQuestion({
      domain: "draft",
      label: "Suggested Welcome Letter Draft",
    }),
    "I can generate this suggested draft now: Suggested Welcome Letter Draft. Continue?",
  );

  assert.equal(
    resolveAssistSuggestionQuestion({
      domain: "execute",
      label: "Suggested Task Status Update",
    }),
    "I can prepare this plan suggestion now: Suggested Task Status Update. Continue?",
  );
});

test("frontend suggestion helper: decline prompt is deterministic and domain-aware", () => {
  assert.equal(
    resolveAssistSuggestionDeclinePrompt({ domain: "draft" }),
    "No. Skip this suggestion and ask me one concise clarification question so we can continue directly with the draft.",
  );
  assert.equal(
    resolveAssistSuggestionDeclinePrompt({ domain: "execute" }),
    "No. Skip this suggestion and ask me one concise clarification question so we can continue with the exact plan.",
  );
});
