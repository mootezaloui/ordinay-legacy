/**
 * Parent entity resolvers for notification rules
 * Used to get parent context (dossier/lawsuit) for tasks, sessions, etc.
 */

import { getEntities } from "./entityLoader";

/**
 * Get variant index from text (for notification variants)
 */
export function getVariantIndexFromText(text) {
  if (typeof text !== "string") return null;
  const match = text.match(/variantIndex\s*=\s*(\d+)/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * Check if task status indicates closed
 */
export function isTaskClosedStatus(status) {
  const normalized = (status || "").toString().trim().toLowerCase();
  return [
    "done",
    "completed",
    "cancelled",
    "canceled",
    "terminee",
    "termine",
    "annule",
    "annulee",
  ].includes(normalized);
}

/**
 * Resolve parent (dossier or lawsuit) for a task
 */
export function resolveTaskParent(task) {
  const entities = getEntities();
  const dossiers = entities.dossiers || [];
  const lawsuits = entities.lawsuits || [];
  const dossierId = task.dossier_id ?? task.dossierId;
  const lawsuitId = task.lawsuit_id ?? task.lawsuitId;

  if (lawsuitId) {
    const parentLawsuit = lawsuits.find((item) => item.id === lawsuitId);
    if (parentLawsuit) {
      return {
        parentType: "lawsuit",
        parentReference:
          parentLawsuit.lawsuitNumber ||
          parentLawsuit.reference_number ||
          parentLawsuit.title ||
          `Lawsuit #${parentLawsuit.id}`,
      };
    }
  }

  if (dossierId) {
    const parentDossier = dossiers.find((item) => item.id === dossierId);
    if (parentDossier) {
      return {
        parentType: "dossier",
        parentReference:
          parentDossier.reference ||
          parentDossier.lawsuitNumber ||
          parentDossier.title ||
          `Dossier #${parentDossier.id}`,
      };
    }
  }

  return null;
}

/**
 * Resolve the correct entity reference for a session/hearing
 * Returns an object with: { reference, entityType, entityId, label }
 *
 * Resolution rules:
 * 1. If session has lawsuit_id → look up lawsuit, return lawsuit reference/title + "procès"
 * 2. Else if session has dossier_id → look up dossier, return dossier reference + "dossier"
 * 3. Else if session has title → use session title + "audience"
 * 4. Else → return null (will display as "Audience")
 */
export function resolveSessionEntity(session, entities = getEntities()) {
  const lawsuits = entities.lawsuits || [];
  const dossiers = entities.dossiers || [];

  // Priority 1: Lawsuit (procès)
  if (session.lawsuit_id) {
    const parentLawsuit = lawsuits.find((c) => c.id === session.lawsuit_id);
    if (parentLawsuit) {
      const reference =
        parentLawsuit.lawsuitNumber ||
        parentLawsuit.reference ||
        parentLawsuit.reference_number ||
        parentLawsuit.title ||
        `Procès #${parentLawsuit.id}`;
      return {
        reference,
        entityType: "lawsuit",
        entityId: parentLawsuit.id,
        label: "procès",
      };
    }
  }

  // Priority 2: Dossier
  if (session.dossier_id) {
    const parentDossier = dossiers.find((d) => d.id === session.dossier_id);
    if (parentDossier) {
      const reference =
        parentDossier.reference ||
        parentDossier.court_reference ||
        parentDossier.title ||
        `Dossier #${parentDossier.id}`;
      return {
        reference,
        entityType: "dossier",
        entityId: parentDossier.id,
        label: "dossier",
      };
    }
  }

  // Priority 3: Session title
  if (session.title && session.title.trim().length > 0) {
    return {
      reference: session.title,
      entityType: "session",
      entityId: session.id,
      label: "audience",
    };
  }

  // Priority 4: No reference (unlinked)
  return {
    reference: "Audience",
    entityType: "session",
    entityId: session.id,
    label: "",
  };
}

/**
 * Get session time from scheduled date
 */
export function getSessionTime(scheduledDate) {
  if (!scheduledDate || typeof scheduledDate !== "string") return "";
  if (!scheduledDate.includes("T")) return "";
  return scheduledDate.split("T")[1].substring(0, 5);
}

/**
 * Build parent contexts for financial entries
 */
export function buildFinancialParentContexts(financialEntry) {
  const entities = getEntities();
  const contexts = [];
  const seen = new Set();
  const addContext = (type, reference) => {
    if (!type || !reference) return;
    const key = `${type}:${reference}`;
    if (seen.has(key)) return;
    seen.add(key);
    contexts.push({ type, reference });
  };

  const missionId = financialEntry.mission_id ?? financialEntry.missionId;
  const dossierId = financialEntry.dossier_id ?? financialEntry.dossierId;
  const lawsuitId = financialEntry.lawsuit_id ?? financialEntry.lawsuitId;
  const taskId = financialEntry.task_id ?? financialEntry.taskId;
  const personalTaskId =
    financialEntry.personal_task_id ?? financialEntry.personalTaskId;

  const missions = entities.missions || [];
  const dossiers = entities.dossiers || [];
  const lawsuits = entities.lawsuits || [];
  const tasks = entities.tasks || [];
  const personalTasks = entities.personalTasks || [];
  const officers = entities.officers || [];

  if (missionId) {
    const mission = missions.find((item) => item.id === missionId);
    const missionRef =
      mission?.reference ||
      mission?.missionNumber ||
      mission?.title ||
      `Mission #${missionId}`;
    addContext("mission", missionRef);

    const officerId = mission?.officer_id ?? mission?.officerId;
    if (officerId) {
      const officer = officers.find((item) => item.id === officerId);
      const officerRef = officer?.name || `Officer #${officerId}`;
      addContext("officer", officerRef);
    }
  }

  if (dossierId) {
    const dossier = dossiers.find((item) => item.id === dossierId);
    const dossierRef =
      dossier?.reference ||
      dossier?.lawsuitNumber ||
      dossier?.lawsuitNumber ||
      dossier?.title ||
      `Dossier #${dossierId}`;
    addContext("dossier", dossierRef);
  }

  if (lawsuitId) {
    const lawsuitItem = lawsuits.find((item) => item.id === lawsuitId);
    const lawsuitRef =
      lawsuitItem?.reference ||
      lawsuitItem?.lawsuitNumber ||
      lawsuitItem?.lawsuitNumber ||
      lawsuitItem?.title ||
      `Lawsuit #${lawsuitId}`;
    addContext("lawsuit", lawsuitRef);
  }

  if (taskId) {
    const task = tasks.find((item) => item.id === taskId);
    const taskRef = task?.title || task?.reference || `Task #${taskId}`;
    addContext("task", taskRef);
  }

  if (personalTaskId) {
    const personalTask = personalTasks.find(
      (item) => item.id === personalTaskId
    );
    const personalTaskRef =
      personalTask?.title || `Personal Task #${personalTaskId}`;
    addContext("personalTask", personalTaskRef);
  }

  return contexts;
}





