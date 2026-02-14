"use strict";

function toLowerSet(values = []) {
  return new Set(
    (Array.isArray(values) ? values : [])
      .map((value) =>
        String(value || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean),
  );
}

function parseDateValue(value) {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function lexicalSimilarity(query, candidateText) {
  const queryTokens = tokenize(query);
  const candidateTokens = tokenize(candidateText);
  if (!queryTokens.length || !candidateTokens.length) return 0;

  const queryJoined = queryTokens.join(" ");
  const candidateJoined = candidateTokens.join(" ");
  if (queryJoined && candidateJoined.includes(queryJoined)) return 0.95;

  const querySet = new Set(queryTokens);
  const candidateSet = new Set(candidateTokens);
  let overlap = 0;
  for (const token of querySet) {
    if (candidateSet.has(token)) overlap += 1;
  }

  const dice = (2 * overlap) / (querySet.size + candidateSet.size);
  return Math.max(0, Math.min(1, dice));
}

function formatIsoDate(value) {
  const ts = parseDateValue(value);
  if (!ts) return "unknown date";
  return new Date(ts).toISOString().slice(0, 10);
}

function formatSessionProximity(sessionDate, nowDate) {
  const diffMs = parseDateValue(sessionDate) - parseDateValue(nowDate);
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor(diffMs / dayMs);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "tomorrow";
  return `in ${diffDays} days`;
}

function computeDaysLate(oldestDueDate, nowDate) {
  const dueTs = parseDateValue(oldestDueDate);
  const nowTs = parseDateValue(nowDate);
  if (!dueTs || !nowTs) return null;
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((nowTs - dueTs) / dayMs));
}

function isOverdueClientEmailIntent(intent, userMessage) {
  const normalizedIntent = String(intent || "").toUpperCase();
  if (normalizedIntent !== "DRAFT_CLIENT_EMAIL") return false;
  const message = String(userMessage || "").toLowerCase();
  if (!message) return false;
  const keywords = [
    "overdue",
    "unpaid",
    "late payment",
    "payment reminder",
    "past due",
    "late invoice",
  ];
  return keywords.some((keyword) => message.includes(keyword));
}

function inferWorkspaceScope(requestContext = {}, options = {}) {
  const allowActiveEntity = options?.allowActiveEntity !== false;
  const activeType = allowActiveEntity
    ? String(requestContext?.activeEntity?.type || "").toLowerCase()
    : "";
  const activeId = allowActiveEntity ? requestContext?.activeEntity?.id || null : null;
  return {
    clientId:
      requestContext?.clientId ||
      (activeType === "client" ? activeId : null) ||
      null,
    dossierId:
      requestContext?.dossierId ||
      (activeType === "dossier" ? activeId : null) ||
      null,
    lawsuitId:
      requestContext?.lawsuitId ||
      (activeType === "lawsuit" ? activeId : null) ||
      null,
  };
}

async function discoverClientSuggestions(
  { policy, requestContext, now },
  runtime,
) {
  const scope = inferWorkspaceScope(requestContext);

  const [clientsResult, overdueResult, dossiersResult, tasksResult] =
    await Promise.all([
      runtime.readTool("listClients", { limit: 200 }, policy),
      runtime.readTool(
        "listFinancialEntries",
        {
          paymentStatus: "overdue",
          ...(scope.clientId ? { clientId: scope.clientId } : {}),
          limit: 300,
        },
        policy,
      ),
      runtime.readTool(
        "listDossiers",
        {
          ...(scope.clientId ? { clientId: scope.clientId } : {}),
          limit: 300,
        },
        policy,
      ),
      runtime.readTool("listTasks", { limit: 400 }, policy),
    ]);

  const clients = Array.isArray(clientsResult?.clients)
    ? clientsResult.clients
    : [];
  const overdueEntries = Array.isArray(overdueResult?.financialEntries)
    ? overdueResult.financialEntries
    : [];
  const dossiers = Array.isArray(dossiersResult?.dossiers)
    ? dossiersResult.dossiers
    : [];
  const tasks = Array.isArray(tasksResult?.tasks) ? tasksResult.tasks : [];

  const dossierClientMap = new Map();
  for (const dossier of dossiers) {
    if (dossier?.id && dossier?.client_id) {
      dossierClientMap.set(Number(dossier.id), Number(dossier.client_id));
    }
  }

  const metrics = new Map();
  for (const client of clients) {
    metrics.set(Number(client.id), {
      client,
      overdueCount: 0,
      openTasksCount: 0,
      activeDossiersCount: 0,
      lastInteraction: parseDateValue(
        client?.updated_at || client?.created_at || 0,
      ),
    });
  }

  for (const entry of overdueEntries) {
    const clientId = Number(entry?.client_id || 0);
    if (!clientId || !metrics.has(clientId)) continue;
    const row = metrics.get(clientId);
    row.overdueCount += 1;
    row.lastInteraction = Math.max(
      row.lastInteraction,
      parseDateValue(
        entry?.updated_at || entry?.occurred_at || entry?.due_date,
      ),
    );
  }

  for (const dossier of dossiers) {
    const clientId = Number(dossier?.client_id || 0);
    if (!clientId || !metrics.has(clientId)) continue;
    const row = metrics.get(clientId);
    const status = String(dossier?.status || "").toLowerCase();
    if (!["closed", "cancelled", "archived"].includes(status)) {
      row.activeDossiersCount += 1;
    }
    row.lastInteraction = Math.max(
      row.lastInteraction,
      parseDateValue(
        dossier?.updated_at || dossier?.opened_at || dossier?.created_at,
      ),
    );
  }

  for (const task of tasks) {
    const status = String(task?.status || "").toLowerCase();
    if (["done", "cancelled", "completed"].includes(status)) continue;
    const dossierId = Number(task?.dossier_id || 0);
    const clientId = dossierClientMap.get(dossierId);
    if (!clientId || !metrics.has(clientId)) continue;
    const row = metrics.get(clientId);
    row.openTasksCount += 1;
    row.lastInteraction = Math.max(
      row.lastInteraction,
      parseDateValue(task?.updated_at || task?.due_date || task?.created_at),
    );
  }

  let candidates = Array.from(metrics.values()).filter(
    (row) =>
      row.overdueCount > 0 ||
      row.openTasksCount > 0 ||
      row.activeDossiersCount > 0,
  );

  if (scope.clientId) {
    candidates = candidates.filter(
      (row) => Number(row?.client?.id) === Number(scope.clientId),
    );
  } else if (scope.dossierId) {
    const scopedClient = dossierClientMap.get(Number(scope.dossierId));
    if (scopedClient) {
      candidates = candidates.filter(
        (row) => Number(row?.client?.id) === Number(scopedClient),
      );
    }
  }

  candidates.sort((a, b) => {
    if (b.overdueCount !== a.overdueCount)
      return b.overdueCount - a.overdueCount;
    if (b.lastInteraction !== a.lastInteraction)
      return b.lastInteraction - a.lastInteraction;
    if (b.openTasksCount !== a.openTasksCount)
      return b.openTasksCount - a.openTasksCount;
    return b.activeDossiersCount - a.activeDossiersCount;
  });

  return candidates.slice(0, 5).map((row) => ({
    entityType: "client",
    entityId: row.client.id,
    label: row.client.name || `Client #${row.client.id}`,
    score:
      row.overdueCount * 1000 +
      row.openTasksCount * 10 +
      row.activeDossiersCount,
    signal: `${row.overdueCount} overdue invoice(s), ${row.openTasksCount} open task(s), ${row.activeDossiersCount} active dossier(s), last interaction ${formatIsoDate(row.lastInteraction || now)}`,
  }));
}

async function discoverOverdueClientSuggestions(
  { policy, requestContext, now },
  runtime,
) {
  const scope = inferWorkspaceScope(requestContext, {
    allowActiveEntity: false,
  });
  const params = { limit: 5 };
  if (scope.clientId) params.clientId = Number(scope.clientId);

  const result = await runtime.readTool(
    "findClientsWithOverdueInvoices",
    params,
    policy,
  );
  const rows = Array.isArray(result?.clients) ? result.clients : [];

  return rows
    .map((row) => {
      const overdueCount = Number(row?.overdue_count || 0);
      if (overdueCount <= 0) return null;
      const totalOverdueAmount = Number(row?.total_overdue_amount || 0);
      const oldestDueDate = row?.oldest_due_date || null;
      const daysLate = computeDaysLate(oldestDueDate, now);
      const clientId = Number(row?.client_id || 0);
      const clientName = row?.client_name || `Client #${clientId}`;
      return {
        entityType: "client",
        entityId: clientId,
        label: clientName,
        score: overdueCount * 1000 + totalOverdueAmount,
        signal: `${overdueCount} overdue invoice(s), total overdue ${totalOverdueAmount}, oldest due ${formatIsoDate(oldestDueDate)}`,
        metadata: {
          clientId,
          clientName,
          overdueCount,
          totalOverdueAmount,
          oldestDueDate,
          daysLate,
        },
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.metadata.overdueCount !== a.metadata.overdueCount) {
        return b.metadata.overdueCount - a.metadata.overdueCount;
      }
      return b.metadata.totalOverdueAmount - a.metadata.totalOverdueAmount;
    });
}

async function discoverRecentClientSuggestions(
  { policy, requestContext, now },
  runtime,
) {
  const scope = inferWorkspaceScope(requestContext, {
    allowActiveEntity: false,
  });
  const result = await runtime.readTool("listClients", { limit: 200 }, policy);
  const clients = Array.isArray(result?.clients) ? result.clients : [];

  let candidates = clients
    .map((client) => {
      const lastInteraction = parseDateValue(
        client?.updated_at || client?.created_at || 0,
      );
      return { client, lastInteraction };
    })
    .filter((row) => row.client);

  if (scope.clientId) {
    candidates = candidates.filter(
      (row) => Number(row?.client?.id) === Number(scope.clientId),
    );
  }

  candidates.sort((a, b) => b.lastInteraction - a.lastInteraction);

  return candidates.slice(0, 5).map((row) => ({
    entityType: "client",
    entityId: row.client.id,
    label: row.client.name || `Client #${row.client.id}`,
    score: row.lastInteraction || 0,
    signal: `last interaction ${formatIsoDate(row.lastInteraction || now)}`,
  }));
}

async function discoverSessionSuggestions(
  { policy, requestContext, now },
  runtime,
) {
  const scope = inferWorkspaceScope(requestContext);
  const params = {
    timeframe: "upcoming",
    limit: 200,
  };
  if (scope.dossierId) params.dossierId = scope.dossierId;
  if (scope.lawsuitId) params.lawsuitId = scope.lawsuitId;

  const result = await runtime.readTool("listSessions", params, policy);
  const nowTs = parseDateValue(now);
  const sessions = Array.isArray(result?.sessions) ? result.sessions : [];

  const candidates = sessions
    .filter((session) => parseDateValue(session?.scheduled_at) >= nowTs)
    .sort(
      (a, b) =>
        parseDateValue(a?.scheduled_at) - parseDateValue(b?.scheduled_at),
    )
    .slice(0, 5)
    .map((session) => ({
      entityType: "session",
      entityId: session.id,
      label: session.title || session.session_type || `Session #${session.id}`,
      score: 1,
      signal: `${formatSessionProximity(session.scheduled_at, now)} (${formatIsoDate(session.scheduled_at)})`,
    }));

  return candidates;
}

async function discoverDossierSuggestions(
  { policy, requestContext, userMessage },
  runtime,
) {
  const query = String(userMessage || "").trim();
  if (!query) return [];

  const vectorSearch = requestContext?.vectorSearch?.searchDossiers;
  if (typeof vectorSearch === "function") {
    try {
      const raw = await vectorSearch({
        query,
        limit: 5,
        threshold: 0.75,
        context: requestContext,
      });
      const vectorCandidates = Array.isArray(raw) ? raw : [];
      return vectorCandidates
        .filter((item) => Number(item?.score || 0) > 0.75)
        .slice(0, 5)
        .map((item) => ({
          entityType: "dossier",
          entityId: item.id,
          label: item.reference
            ? `${item.reference} - ${item.title || "Untitled"}`
            : item.title || `Dossier #${item.id}`,
          score: Number(item.score || 0),
          signal: `similarity ${(Number(item.score || 0) * 100).toFixed(0)}%`,
        }));
    } catch {
      // Fall back to lexical scoring.
    }
  }

  const scope = inferWorkspaceScope(requestContext);
  const listResult = await runtime.readTool(
    "listDossiers",
    {
      ...(scope.clientId ? { clientId: scope.clientId } : {}),
      limit: 200,
    },
    policy,
  );
  const dossiers = Array.isArray(listResult?.dossiers)
    ? listResult.dossiers
    : [];

  return dossiers
    .map((dossier) => {
      const candidateText = [
        dossier.reference,
        dossier.title,
        dossier.description,
        dossier.phase,
        dossier.category,
        dossier.adversary_name,
      ]
        .filter(Boolean)
        .join(" ");
      const score = lexicalSimilarity(query, candidateText);
      return { dossier, score };
    })
    .filter((row) => row.score > 0.75)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((row) => ({
      entityType: "dossier",
      entityId: row.dossier.id,
      label: row.dossier.reference
        ? `${row.dossier.reference} - ${row.dossier.title || "Untitled"}`
        : row.dossier.title || `Dossier #${row.dossier.id}`,
      score: row.score,
      signal: `similarity ${(row.score * 100).toFixed(0)}%`,
    }));
}

async function getContextSuggestions(intent, missingEntities, context = {}) {
  const runtime = {
    readTool:
      typeof this?._callReadTool === "function"
        ? this._callReadTool.bind(this)
        : context?.readTool,
  };
  if (typeof runtime.readTool !== "function") return [];

  const entities = toLowerSet(missingEntities);
  const policy = context?.policy || null;
  const requestContext = context?.requestContext || {};
  const now = context?.now || new Date().toISOString();
  const userMessage = context?.userMessage || "";

  if (entities.has("client")) {
    if (isOverdueClientEmailIntent(intent, userMessage)) {
      console.log("[OverdueResolver] Using overdue invoice resolver");
      const overdueSuggestions = await discoverOverdueClientSuggestions(
        { intent, policy, requestContext, now, userMessage },
        runtime,
      );
      console.log(
        `[OverdueResolver] Results: ${Array.isArray(overdueSuggestions) ? overdueSuggestions.length : 0} clients`,
      );
      if (Array.isArray(overdueSuggestions) && overdueSuggestions.length > 0) {
        return overdueSuggestions;
      }
      console.log("[OverdueResolver] No overdue clients found, falling back");
      return await discoverRecentClientSuggestions(
        { intent, policy, requestContext, now, userMessage },
        runtime,
      );
    }

    return await discoverClientSuggestions(
      { intent, policy, requestContext, now, userMessage },
      runtime,
    );
  }
  if (entities.has("session") || entities.has("hearing")) {
    return await discoverSessionSuggestions(
      { intent, policy, requestContext, now, userMessage },
      runtime,
    );
  }
  if (entities.has("dossier")) {
    return await discoverDossierSuggestions(
      { intent, policy, requestContext, now, userMessage },
      runtime,
    );
  }
  return [];
}

function formatSuggestionResponse(entityType, suggestions = []) {
  const normalized = String(entityType || "entity").toLowerCase();
  const lines = suggestions
    .slice(0, 5)
    .map((candidate) => `• ${candidate.label} - ${candidate.signal}`);
  if (!lines.length) {
    return {
      summary: `Which ${normalized} should this be for?`,
      details: [],
    };
  }
  return {
    summary: `I found these possible ${normalized} options that might match your request:`,
    details: [
      ...lines,
      "Do you want me to use one of these or search for another?",
    ],
  };
}

module.exports = {
  getContextSuggestions,
  formatSuggestionResponse,
  lexicalSimilarity,
  isOverdueClientEmailIntent,
};
