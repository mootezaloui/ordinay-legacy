"use strict";

const { READ_INTENTS } = require("../../../../intent.classifier");
const { resolveEntityDisplayLabel } = require("../../../../utils/entityDisplay");

async function handleListOfficers(state) {
  const { policy, filters, details, sources, getHintValue } = state;
  let { data, title, summary } = state;

  do {
    const hintName = getHintValue("name", "officer");
    const hintRef = getHintValue("reference", "officer");
    const query = filters?.query || hintName || hintRef || null;
    const { officers } = await this._callReadTool(
      "listOfficers",
      {
        limit: 50,
        status: filters?.status || null,
        query,
      },
      policy,
    );
    data = officers;
    title = "Read data — Officers";
    summary =
      officers.length > 0
        ? `Found ${officers.length} officer(s)`
        : "No officers found";
    officers.forEach((officer) => {
      details.push(
        `${resolveEntityDisplayLabel("officer", officer, { fallback: "Officer" })} (${officer.status || "active"})`,
      );
    });
    sources.push({
      sourceType: "system",
      reference: "tool:listOfficers",
      note: "Officer list",
    });
    break;
  } while (false);

  return { data, title, summary };
}

async function handleReadOfficer(state) {
  const {
    policy,
    entityHints,
    details,
    sources,
    getHintValue,
    formatDate,
    appendDocumentDetails,
  } = state;
  let { data, title, summary } = state;

  do {
    const hintId = entityHints.find((hint) => hint.type === "id")?.value;
    const hintName = getHintValue("name", "officer") || getHintValue("name");
    title = "Read data — Officer";

    if (hintId) {
      const result = await this._callReadTool(
        "getOfficer",
        { officerId: hintId },
        policy,
      );
      const officer = result?.officer;
      if (!officer) {
        summary = "No officer found for that identifier.";
        details.push("Try listing officers to see available records.");
        break;
      }
      summary = `Officer: ${resolveEntityDisplayLabel("officer", officer, { fallback: "Officer" })}`;
      details.push(`Status: ${officer.status || "active"}`);
      details.push(`Agency: ${officer.agency || "N/A"}`);
      details.push(`Phone: ${officer.phone || officer.alternate_phone || "N/A"}`);
      details.push(`Email: ${officer.email || "N/A"}`);
      details.push(
        `Created at: ${officer.created_at ? formatDate(officer.created_at) : "N/A"}`,
      );
      sources.push({
        sourceType: "system",
        reference: "tool:getOfficer",
        note: "Officer lookup",
      });
      data = officer;
      await appendDocumentDetails("officer", officer);
      break;
    }

    if (hintName) {
      const result = await this._callReadTool(
        "listOfficers",
        { query: hintName, limit: 10 },
        policy,
      );
      const officers = result?.officers || [];
      if (officers.length === 0) {
        summary = `No officer found for "${hintName}"`;
        details.push("Try listing all officers.");
      } else if (officers.length === 1) {
        const officer = officers[0];
        summary = `Officer: ${resolveEntityDisplayLabel("officer", officer, { fallback: "Officer" })}`;
        details.push(`Status: ${officer.status || "active"}`);
        details.push(`Agency: ${officer.agency || "N/A"}`);
        details.push(`Phone: ${officer.phone || officer.alternate_phone || "N/A"}`);
        details.push(`Email: ${officer.email || "N/A"}`);
        sources.push({
          sourceType: "system",
          reference: "tool:listOfficers",
          note: "Officer lookup",
        });
        data = officer;
        await appendDocumentDetails("officer", officer);
      } else {
        summary = `Multiple officers match "${hintName}"`;
        officers.forEach((officer) =>
          details.push(
            `${resolveEntityDisplayLabel("officer", officer, { fallback: "Officer" })} (${officer.status || "active"})`,
          ),
        );
        details.push("Please specify which officer you mean.");
      }
      break;
    }

    summary = "Which officer?";
    details.push("Provide an officer name or identifier.");
    break;
  } while (false);

  return { data, title, summary };
}

async function handleExplainOfficer(state) {
  const {
    intent,
    policy,
    context,
    entityHints,
    details,
    sources,
    getHintValue,
    formatDate,
    appendDocumentDetails,
    buildAggregateSummary,
    applyAggregateResult,
    shouldAggregateSummary,
  } = state;
  let { data, title, summary } = state;

  do {
    const hintId = getHintValue("id", "officer") || getHintValue("id");
    const hintName = getHintValue("name", "officer") || getHintValue("name");
    const scopedId = context?.officerId || null;
    const targetId = hintId || scopedId;

    if (intent === READ_INTENTS.SUMMARIZE_OFFICER && shouldAggregateSummary) {
      const aggregateResult = await buildAggregateSummary("officer");
      if (applyAggregateResult(aggregateResult)) break;
    }

    let officer = null;
    if (targetId) {
      const result = await this._callReadTool(
        "getOfficer",
        { officerId: targetId },
        policy,
      );
      officer = result?.officer || null;
    } else if (hintName) {
      const result = await this._callReadTool(
        "listOfficers",
        { query: hintName, limit: 10 },
        policy,
      );
      const officers = result?.officers || [];
      if (officers.length === 1) {
        officer = officers[0];
      } else if (officers.length > 1) {
        title =
          intent === READ_INTENTS.EXPLAIN_OFFICER_STATE
            ? "Read data — Officer state"
            : "Read data — Officer summary";
        summary = `Multiple officers match "${hintName}"`;
        officers.forEach((item) =>
          details.push(
            `${resolveEntityDisplayLabel("officer", item, { fallback: "Officer" })} (${item.status || "active"})`,
          ),
        );
        details.push("Please specify which officer you mean.");
        break;
      }
    }

    if (!officer) {
      summary = "Which officer?";
      details.push("Provide an officer name or identifier.");
      break;
    }

    if (intent === READ_INTENTS.EXPLAIN_OFFICER_STATE) {
      title = "Read data — Officer state";
      summary = `Officer: ${resolveEntityDisplayLabel("officer", officer, { fallback: "Officer" })}`;
      details.push(`Status: ${officer.status || "active"}`);
      details.push(`Agency: ${officer.agency || "N/A"}`);
      details.push(`Location: ${officer.location || "N/A"}`);
      details.push(`Specialization: ${officer.specialization || "N/A"}`);
      details.push(
        `Registration: ${officer.registration_number || "N/A"}`,
      );
      details.push(
        `Created at: ${officer.created_at ? formatDate(officer.created_at) : "N/A"}`,
      );
      sources.push({
        sourceType: "system",
        reference: "tool:getOfficer",
        note: "Officer state",
      });
      data = officer;
      await appendDocumentDetails("officer", officer);
      break;
    }

    title = "Read data — Officer summary";
    summary = `Officer: ${resolveEntityDisplayLabel("officer", officer, { fallback: "Officer" })}`;
    details.push(`Status: ${officer.status || "active"}`);
    details.push(`Agency: ${officer.agency || "N/A"}`);
    details.push(`Contacts: ${officer.phone || officer.email || "N/A"}`);
    details.push(
      `Coverage: ${officer.location || "location not specified"}${officer.specialization ? ` (${officer.specialization})` : ""}`,
    );
    sources.push({
      sourceType: "system",
      reference: "tool:getOfficer",
      note: "Officer summary",
    });
    data = officer;
    await appendDocumentDetails("officer", officer);
    break;
  } while (false);

  return { data, title, summary };
}

module.exports = {
  handleListOfficers,
  handleReadOfficer,
  handleExplainOfficer,
};
