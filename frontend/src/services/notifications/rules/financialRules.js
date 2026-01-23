import { RuleResult, daysUntilDate, daysSinceUpdate, getVariantIndexFromText, buildFinancialParentContexts } from "./shared";
import { entities } from "./shared/entityLoader";
import { formatCurrency, getStoredCurrency } from "../../../utils/currency";

export const FinancialRules = {
  /**
   * RULE: Upcoming Payment Due Date Reminder
   * Triggers: 7, 3, 1 days before due_date
   * Applies to unpaid income/revenue entries (client payments expected)
   */
  upcomingPaymentReminder(financialEntry) {
    const dueDate = financialEntry.due_date || financialEntry.dueDate;
    if (!dueDate) return new RuleResult(false);

    // Only for income/revenue entries (payments we expect to receive)
    const isPaymentExpected =
      financialEntry.entry_type === "income" ||
      financialEntry.entry_type === "revenue";

    if (!isPaymentExpected) return new RuleResult(false);

    // Skip if already paid or voided
    if (financialEntry.status === "paid" || financialEntry.status === "void") {
      return new RuleResult(false);
    }

    const daysLeft = daysUntilDate(dueDate);
    const reminderDays = [7, 3, 1];

    // Edge case: Don't trigger "missed" reminders for recently created entries
    const createdDate = financialEntry.created_at || financialEntry.createdAt;
    if (createdDate) {
      const daysSinceCreation = daysSinceUpdate(createdDate);
      const totalDaysUntilDueDate = daysLeft + daysSinceCreation;

      // Skip "missed" reminders
      if (daysLeft > totalDaysUntilDueDate) {
        return new RuleResult(false);
      }
    }

    if (reminderDays.includes(daysLeft)) {
      // Look up parent entities to get context
      const clients = entities.clients || [];
      const dossiers = entities.dossiers || [];
      const lawsuits = entities.lawsuits || [];

      const clientId = financialEntry.client_id ?? financialEntry.clientId;
      const dossierId = financialEntry.dossier_id ?? financialEntry.dossierId;
      const lawsuitId = financialEntry.lawsuit_id ?? financialEntry.lawsuitId;

      let clientName = "Client";
      let parentType = null;
      let parentReference = "";

      // Try to get client directly
      if (clientId) {
        const client = clients.find((c) => c.id === clientId);
        if (client) {
          clientName = client.name;
        }
      }

      // Try to get dossier context
      if (dossierId) {
        const dossier = dossiers.find((d) => d.id === dossierId);
        if (dossier) {
          parentType = "dossier";
          parentReference = dossier.lawsuitNumber || dossier.reference;
          // If no client found yet, get from dossier
          if (clientName === "Client" && dossier.client_id) {
            const client = clients.find((c) => c.id === dossier.client_id);
            if (client) clientName = client.name;
          }
        }
      }

      // Try to get lawsuit context
      if (lawsuitId) {
        const lawsuitItem = lawsuits.find((c) => c.id === lawsuitId);
        if (lawsuitItem) {
          parentType = "lawsuit";
          parentReference = lawsuitItem.lawsuitNumber || lawsuitItem.reference;
          // Get dossier from lawsuit to find client
          if (clientName === "Client" && lawsuitItem.dossier_id) {
            const dossier = dossiers.find((d) => d.id === lawsuitItem.dossier_id);
            if (dossier && dossier.client_id) {
              const client = clients.find((c) => c.id === dossier.client_id);
              if (client) clientName = client.name;
            }
          }
        }
      }

      const parentContexts = buildFinancialParentContexts(financialEntry);
      const primaryContext = parentContexts[0] || {};
      parentType = primaryContext.type || null;
      parentReference = primaryContext.reference || "";

      const amount = Number(financialEntry.amount || 0);
      const formattedAmount = formatCurrency(amount);
      const currency = getStoredCurrency();
      const variantIndex = getVariantIndexFromText(financialEntry.description);

      // Determine priority based on proximity
      let notificationPriority = "medium";
      if (daysLeft === 1) {
        notificationPriority = "high";
      } else if (daysLeft === 3) {
        notificationPriority = "medium";
      }

      return new RuleResult(true, {
        priority: notificationPriority,
        frequency: "once",
        subType: "upcomingPayment",
        titleKey: "content.financial.upcomingPayment.title",
        titleParams:
          variantIndex !== null ? { count: daysLeft, variantIndex } : { count: daysLeft },
        messageKey: financialEntry.description
          ? "content.financial.upcomingPayment.messageWithDescription"
          : "content.financial.upcomingPayment.message",
        messageParams: {
          amount: formattedAmount,
          clientName,
          count: daysLeft,
          description: financialEntry.description || "",
          parentType,
          parentReference,
          parentContexts,
          ...(variantIndex !== null ? { variantIndex } : {}),
        },
        metadata: {
          financialEntryId: financialEntry.id,
          clientId,
          clientName,
          amount,
          currency,
          dueDate,
          daysLeft,
          entryType: financialEntry.entry_type,
          dossierId: financialEntry.dossier_id,
          lawsuitId: financialEntry.lawsuit_id,
        },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Overdue Payment Reminder
   * Triggers: 1, 3, 7, 14 days after due_date if payment not received
   * Multiple reminders to follow up on late payments
   */
  overduePaymentReminder(financialEntry) {
    const dueDate = financialEntry.due_date || financialEntry.dueDate;
    if (!dueDate) return new RuleResult(false);

    // Only for income/revenue entries (payments we expect to receive)
    const isPaymentExpected =
      financialEntry.entry_type === "income" ||
      financialEntry.entry_type === "revenue";

    if (!isPaymentExpected) return new RuleResult(false);

    // Skip if already paid or voided
    if (financialEntry.status === "paid" || financialEntry.status === "void") {
      return new RuleResult(false);
    }

    const daysLeft = daysUntilDate(dueDate);
    const overdueReminderDays = [1, 3, 7, 14]; // Days after due date to remind

    // Check if payment is overdue
    if (daysLeft < 0) {
      const daysOverdue = Math.abs(daysLeft);

      // Only send reminder on specific days
      if (overdueReminderDays.includes(daysOverdue)) {
        // Look up parent entities to get context
        const clients = entities.clients || [];
        const dossiers = entities.dossiers || [];
        const lawsuits = entities.lawsuits || [];
        const clientId = financialEntry.client_id ?? financialEntry.clientId;
        const dossierId = financialEntry.dossier_id ?? financialEntry.dossierId;
        const lawsuitId = financialEntry.lawsuit_id ?? financialEntry.lawsuitId;

        let clientName = "Client";
        let parentType = null;
        let parentReference = "";

        // Try to get client directly
        if (clientId) {
          const client = clients.find((c) => c.id === clientId);
          if (client) {
            clientName = client.name;
          }
        }

        // Try to get dossier context
        if (dossierId) {
          const dossier = dossiers.find((d) => d.id === dossierId);
          if (dossier) {
            parentType = "dossier";
            parentReference = dossier.lawsuitNumber || dossier.reference;
            // If no client found yet, get from dossier
            if (clientName === "Client" && dossier.client_id) {
              const client = clients.find((c) => c.id === dossier.client_id);
              if (client) clientName = client.name;
            }
          }
        }

        // Try to get lawsuit context
        if (lawsuitId) {
          const lawsuitItem = lawsuits.find((c) => c.id === lawsuitId);
          if (lawsuitItem) {
            parentType = "lawsuit";
            parentReference = lawsuitItem.lawsuitNumber || lawsuitItem.reference;
            // Get dossier from lawsuit to find client
            if (clientName === "Client" && lawsuitItem.dossier_id) {
              const dossier = dossiers.find(
                (d) => d.id === lawsuitItem.dossier_id
              );
              if (dossier && dossier.client_id) {
                const client = clients.find((c) => c.id === dossier.client_id);
                if (client) clientName = client.name;
              }
            }
          }
        }

        const parentContexts = buildFinancialParentContexts(financialEntry);
        const primaryContext = parentContexts[0] || {};
        parentType = primaryContext.type || null;
        parentReference = primaryContext.reference || "";

        const amount = Number(financialEntry.amount || 0);
        const formattedAmount = formatCurrency(amount);
        const currency = getStoredCurrency();
        const variantIndex = getVariantIndexFromText(financialEntry.description);

        // Escalating priority based on how long it's overdue
        let notificationPriority = "high";
        if (daysOverdue >= 7) {
          notificationPriority = "urgent"; // Very overdue
        }

        return new RuleResult(true, {
          priority: notificationPriority,
          frequency: "once",
          subType: "overduePayment",
          titleKey: "content.financial.overduePayment.title",
          titleParams: variantIndex !== null ? { count: daysOverdue, variantIndex } : { count: daysOverdue },
          messageKey: "content.financial.overduePayment.message",
          messageParams: {
            amount: formattedAmount,
            clientName,
            count: daysOverdue,
            parentType,
            parentReference,
            parentContexts,
            ...(variantIndex !== null ? { variantIndex } : {}),
          },
        metadata: {
          financialEntryId: financialEntry.id,
          clientId,
          clientName,
          amount,
          currency,
            dueDate,
            daysOverdue,
            entryType: financialEntry.entry_type,
            dossierId: financialEntry.dossier_id,
            lawsuitId: financialEntry.lawsuit_id,
          },
        });
      }
    }

    return new RuleResult(false);
  },
};




