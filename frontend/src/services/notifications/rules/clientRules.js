import { RuleResult, daysSinceUpdate } from "./shared";
import { entities } from "./shared/entityLoader";

export const ClientRules = {
  /**
   * RULE: Client inActive (60+ Days)
   * Triggers: When client hasn't had ANY activity for 60+ days
   * Checks: dossier updates, tasks, sessions, payments
   */
  inActiveClient(client, context = {}) {
    if (!client.updated_at && !client.updatedAt) {
      return new RuleResult(false);
    }

    const lastUpdate = client.updated_at || client.updatedAt;
    const daysSinceLastUpdate = daysSinceUpdate(lastUpdate);

    // Only check active clients
    const isActive = client.status === "Active" || client.status === "active";
    if (!isActive) {
      return new RuleResult(false);
    }

    if (daysSinceLastUpdate >= 60) {
      // Check if client has any recent activity across all entities
      const clientId = client.id;
      const dossiers = entities.dossiers || [];
      const tasks = entities.tasks || [];
      const sessions = entities.sessions || [];
      const financialEntries = entities.financialEntries || [];

      // Find any recent activity related to this client
      const hasRecentDossierActivity = dossiers.some((d) => {
        if (d.client_id !== clientId && d.clientId !== clientId) return false;
        const dossierDays = daysSinceUpdate(d.updated_at || d.updatedAt);
        return dossierDays < 60;
      });

      const hasRecentTaskActivity = tasks.some((t) => {
        const relatedDossier = dossiers.find(
          (d) =>
            (d.id === t.dossier_id || d.id === t.dossierId) &&
            (d.client_id === clientId || d.clientId === clientId)
        );
        if (!relatedDossier) return false;
        const taskDays = daysSinceUpdate(t.updated_at || t.updatedAt);
        return taskDays < 60;
      });

      const hasRecentSessionActivity = sessions.some((s) => {
        const relatedDossier = dossiers.find(
          (d) =>
            (d.id === s.dossier_id || d.id === s.dossierId) &&
            (d.client_id === clientId || d.clientId === clientId)
        );
        if (!relatedDossier) return false;
        const sessionDays = daysSinceUpdate(s.updated_at || s.updatedAt);
        return sessionDays < 60;
      });

      const hasRecentFinancialActivity = financialEntries.some((f) => {
        if (f.client_id !== clientId && f.clientId !== clientId) return false;
        const financialDays = daysSinceUpdate(f.updated_at || f.updatedAt);
        return financialDays < 60;
      });

      // If no recent activity found, trigger notification
      if (
        !hasRecentDossierActivity &&
        !hasRecentTaskActivity &&
        !hasRecentSessionActivity &&
        !hasRecentFinancialActivity
      ) {
        return new RuleResult(true, {
          priority: "medium",
          frequency: "once",
          subType: "inActiveClient",
          titleKey: "content.client.inActive.title",
          titleParams: { count: daysSinceLastUpdate },
          messageKey: "content.client.inActive.message",
          messageParams: {
            clientName: client.name,
            count: daysSinceLastUpdate,
          },
          metadata: {
            clientId: client.id,
            clientName: client.name,
            daysSinceLastUpdate,
            suggestAction: "mark_inactive",
          },
        });
      }
    }

    return new RuleResult(false);
  },
};
