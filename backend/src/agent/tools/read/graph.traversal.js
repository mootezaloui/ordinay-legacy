"use strict";

const clientsService = require("../../../services/clients.service");
const dossiersService = require("../../../services/dossiers.service");
const lawsuitsService = require("../../../services/lawsuits.service");
const tasksService = require("../../../services/tasks.service");
const missionsService = require("../../../services/missions.service");
const sessionsService = require("../../../services/sessions.service");
const documentsService = require("../../../services/documents.service");

const { CHILD_CATEGORIES, addNodeToCategoryMap, toGraphNode } = require("./graph.utils");

function createServices(overrides = {}) {
  return {
    clients: overrides.clients || clientsService,
    dossiers: overrides.dossiers || dossiersService,
    lawsuits: overrides.lawsuits || lawsuitsService,
    tasks: overrides.tasks || tasksService,
    missions: overrides.missions || missionsService,
    sessions: overrides.sessions || sessionsService,
    documents: overrides.documents || documentsService,
  };
}

function createEntityNotFoundError(entityType, entityId) {
  const error = new Error(`Entity ${entityType}#${entityId} not found`);
  error.type = "entity_not_found";
  error.entityType = entityType;
  error.entityId = entityId;
  error.payload = {
    type: "entity_not_found",
    entityType,
    entityId,
  };
  return error;
}

function findRoot({ entityType, entityId, services }) {
  if (entityType === "client") return services.clients.get(entityId) || null;
  if (entityType === "dossier") return services.dossiers.get(entityId) || null;
  if (entityType === "lawsuit") return services.lawsuits.get(entityId) || null;
  if (entityType === "task") return services.tasks.get(entityId) || null;
  if (entityType === "mission") return services.missions.get(entityId) || null;
  if (entityType === "session") return services.sessions.get(entityId) || null;
  if (entityType === "document") return services.documents.get(entityId) || null;
  return null;
}

function collectParents({ rootType, rootRow, services, nowMs }) {
  const parents = {};

  const attachClientByDossierId = (dossierId) => {
    const dossier = services.dossiers.get(Number(dossierId));
    if (!dossier) return null;
    parents.dossier = toGraphNode("dossier", dossier, nowMs);
    if (dossier.client_id) {
      const client = services.clients.get(Number(dossier.client_id));
      if (client) {
        parents.client = toGraphNode("client", client, nowMs);
      }
    }
    return dossier;
  };

  const attachLawsuitChain = (lawsuitId) => {
    const lawsuit = services.lawsuits.get(Number(lawsuitId));
    if (!lawsuit) return null;
    parents.lawsuit = toGraphNode("lawsuit", lawsuit, nowMs);
    if (lawsuit.dossier_id) {
      attachClientByDossierId(lawsuit.dossier_id);
    }
    return lawsuit;
  };

  if (rootType === "dossier" && rootRow.client_id) {
    const client = services.clients.get(Number(rootRow.client_id));
    if (client) {
      parents.client = toGraphNode("client", client, nowMs);
    }
  }

  if (rootType === "lawsuit" && rootRow.dossier_id) {
    attachClientByDossierId(rootRow.dossier_id);
  }

  if (rootType === "task") {
    if (rootRow.lawsuit_id) {
      attachLawsuitChain(rootRow.lawsuit_id);
    } else if (rootRow.dossier_id) {
      attachClientByDossierId(rootRow.dossier_id);
    }
  }

  if (rootType === "mission") {
    if (rootRow.lawsuit_id) {
      attachLawsuitChain(rootRow.lawsuit_id);
    } else if (rootRow.dossier_id) {
      attachClientByDossierId(rootRow.dossier_id);
    }
  }

  if (rootType === "session") {
    if (rootRow.lawsuit_id) {
      attachLawsuitChain(rootRow.lawsuit_id);
    } else if (rootRow.dossier_id) {
      attachClientByDossierId(rootRow.dossier_id);
    }
  }

  if (rootType === "document") {
    if (rootRow.client_id) {
      const client = services.clients.get(Number(rootRow.client_id));
      if (client) {
        parents.client = toGraphNode("client", client, nowMs);
      }
    }

    if (rootRow.dossier_id) {
      attachClientByDossierId(rootRow.dossier_id);
    }

    if (rootRow.lawsuit_id) {
      attachLawsuitChain(rootRow.lawsuit_id);
    }

    if (rootRow.task_id) {
      const task = services.tasks.get(Number(rootRow.task_id));
      if (task) {
        parents.task = toGraphNode("task", task, nowMs);
        if (task.lawsuit_id) {
          attachLawsuitChain(task.lawsuit_id);
        } else if (task.dossier_id) {
          attachClientByDossierId(task.dossier_id);
        }
      }
    }

    if (rootRow.mission_id) {
      const mission = services.missions.get(Number(rootRow.mission_id));
      if (mission) {
        parents.mission = toGraphNode("mission", mission, nowMs);
        if (mission.lawsuit_id) {
          attachLawsuitChain(mission.lawsuit_id);
        } else if (mission.dossier_id) {
          attachClientByDossierId(mission.dossier_id);
        }
      }
    }

    if (rootRow.session_id) {
      const session = services.sessions.get(Number(rootRow.session_id));
      if (session) {
        parents.session = toGraphNode("session", session, nowMs);
        if (session.lawsuit_id) {
          attachLawsuitChain(session.lawsuit_id);
        } else if (session.dossier_id) {
          attachClientByDossierId(session.dossier_id);
        }
      }
    }
  }

  return parents;
}

function collectDirectChildren({
  rootType,
  rootId,
  services,
  categoryAllowance,
  nowMs,
  forceClientDossiersForTraversal = false,
}) {
  const directChildren = createEmptyChildren();

  if (rootType === "client") {
    if (categoryAllowance.dossiers || forceClientDossiersForTraversal) {
      directChildren.dossiers = mapRows(
        services.dossiers.listByClient(rootId),
        "dossier",
        nowMs,
      );
    }
    if (categoryAllowance.documents) {
      directChildren.documents = mapRows(
        services.documents.listByClient(rootId),
        "document",
        nowMs,
      );
    }
    return directChildren;
  }

  if (rootType === "dossier") {
    if (categoryAllowance.lawsuits) {
      directChildren.lawsuits = mapRows(
        services.lawsuits.listByDossier(rootId),
        "lawsuit",
        nowMs,
      );
    }
    if (categoryAllowance.tasks) {
      directChildren.tasks = mapRows(
        services.tasks.listByDossier(rootId),
        "task",
        nowMs,
      );
    }
    if (categoryAllowance.missions) {
      directChildren.missions = mapRows(
        services.missions.listByDossier(rootId),
        "mission",
        nowMs,
      );
    }
    if (categoryAllowance.sessions) {
      directChildren.sessions = mapRows(
        services.sessions.listByDossier(rootId),
        "session",
        nowMs,
      );
    }
    if (categoryAllowance.documents) {
      directChildren.documents = mapRows(
        services.documents.listByDossier(rootId),
        "document",
        nowMs,
      );
    }
    return directChildren;
  }

  if (rootType === "lawsuit") {
    if (categoryAllowance.tasks) {
      directChildren.tasks = mapRows(
        services.tasks.listByLawsuit(rootId),
        "task",
        nowMs,
      );
    }
    if (categoryAllowance.missions) {
      directChildren.missions = mapRows(
        services.missions.listByLawsuit(rootId),
        "mission",
        nowMs,
      );
    }
    if (categoryAllowance.sessions) {
      directChildren.sessions = mapRows(
        services.sessions.listByLawsuit(rootId),
        "session",
        nowMs,
      );
    }
    if (categoryAllowance.documents) {
      directChildren.documents = mapRows(
        services.documents.listByLawsuit(rootId),
        "document",
        nowMs,
      );
    }
    return directChildren;
  }

  if (rootType === "task" && categoryAllowance.documents) {
    directChildren.documents = mapRows(
      services.documents.listByTask(rootId),
      "document",
      nowMs,
    );
  }

  if (rootType === "mission" && categoryAllowance.documents) {
    directChildren.documents = mapRows(
      services.documents.listByMission(rootId),
      "document",
      nowMs,
    );
  }

  if (rootType === "session" && categoryAllowance.documents) {
    directChildren.documents = mapRows(
      services.documents.listBySession(rootId),
      "document",
      nowMs,
    );
  }

  return directChildren;
}

function collectDepthTwoChildren({
  directChildren,
  categoryMap,
  categoryAllowance,
  services,
  nowMs,
}) {
  for (const dossierNode of directChildren.dossiers) {
    const dossierId = dossierNode.id;

    if (categoryAllowance.lawsuits) {
      appendRowsToCategoryMap(
        categoryMap,
        "lawsuits",
        mapRows(services.lawsuits.listByDossier(dossierId), "lawsuit", nowMs),
      );
    }
    if (categoryAllowance.tasks) {
      appendRowsToCategoryMap(
        categoryMap,
        "tasks",
        mapRows(services.tasks.listByDossier(dossierId), "task", nowMs),
      );
    }
    if (categoryAllowance.missions) {
      appendRowsToCategoryMap(
        categoryMap,
        "missions",
        mapRows(services.missions.listByDossier(dossierId), "mission", nowMs),
      );
    }
    if (categoryAllowance.sessions) {
      appendRowsToCategoryMap(
        categoryMap,
        "sessions",
        mapRows(services.sessions.listByDossier(dossierId), "session", nowMs),
      );
    }
    if (categoryAllowance.documents) {
      appendRowsToCategoryMap(
        categoryMap,
        "documents",
        mapRows(services.documents.listByDossier(dossierId), "document", nowMs),
      );
    }
  }

  for (const lawsuitNode of directChildren.lawsuits) {
    const lawsuitId = lawsuitNode.id;

    if (categoryAllowance.tasks) {
      appendRowsToCategoryMap(
        categoryMap,
        "tasks",
        mapRows(services.tasks.listByLawsuit(lawsuitId), "task", nowMs),
      );
    }
    if (categoryAllowance.missions) {
      appendRowsToCategoryMap(
        categoryMap,
        "missions",
        mapRows(services.missions.listByLawsuit(lawsuitId), "mission", nowMs),
      );
    }
    if (categoryAllowance.sessions) {
      appendRowsToCategoryMap(
        categoryMap,
        "sessions",
        mapRows(services.sessions.listByLawsuit(lawsuitId), "session", nowMs),
      );
    }
    if (categoryAllowance.documents) {
      appendRowsToCategoryMap(
        categoryMap,
        "documents",
        mapRows(services.documents.listByLawsuit(lawsuitId), "document", nowMs),
      );
    }
  }

  if (categoryAllowance.documents) {
    for (const taskNode of directChildren.tasks) {
      appendRowsToCategoryMap(
        categoryMap,
        "documents",
        mapRows(services.documents.listByTask(taskNode.id), "document", nowMs),
      );
    }

    for (const missionNode of directChildren.missions) {
      appendRowsToCategoryMap(
        categoryMap,
        "documents",
        mapRows(services.documents.listByMission(missionNode.id), "document", nowMs),
      );
    }

    for (const sessionNode of directChildren.sessions) {
      appendRowsToCategoryMap(
        categoryMap,
        "documents",
        mapRows(services.documents.listBySession(sessionNode.id), "document", nowMs),
      );
    }
  }
}


function appendRowsToCategoryMap(categoryMap, category, nodes) {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    addNodeToCategoryMap(categoryMap, category, node);
  }
}

function mapRows(rows, entityType, nowMs) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => toGraphNode(entityType, row, nowMs));
}

function createEmptyChildren() {
  const output = {};
  for (const category of CHILD_CATEGORIES) {
    output[category] = [];
  }
  return output;
}

module.exports = {
  createServices,
  createEntityNotFoundError,
  findRoot,
  collectParents,
  collectDirectChildren,
  collectDepthTwoChildren,
};
