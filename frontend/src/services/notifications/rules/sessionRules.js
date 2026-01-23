import { RuleResult, calculateDaysDifference, daysSinceUpdate, getPriorityWeight, resolveSessionEntity, getSessionTime, getVariantIndexFromText } from "./shared";
import { entities } from "./shared/entityLoader";

export const SessionRules = {
  /**
   * RULE: Upcoming Hearing/Audience Reminders
   * Triggers: At 7, 3, and 1 day(s) before scheduled hearing
   * Hearings are CRITICAL - missing one has serious legal consequences
   * Priority inherited from parent dossier
   *
   * EDGE CASE HANDLING: If hearing was scheduled recently, only send valid reminders
   */
  upcomingHearing(session) {
    const scheduledDate = session.scheduled_at || session.scheduledAt;
    if (!scheduledDate) return new RuleResult(false);

    // Skip if not a hearing/audience
    const isHearing =
      session.session_type === "hearing" ||
      session.session_type === "Audience" ||
      session.sessionType === "hearing" ||
      session.sessionType === "Audience";

    if (!isHearing) return new RuleResult(false);

    // Skip if cancelled or completed
    if (
      session.status === "cancelled" ||
      session.status === "Annulee" ||
      session.status === "completed" ||
      session.status === "Terminee"
    ) {
      return new RuleResult(false);
    }

    const daysLeft = calculateDaysDifference(scheduledDate);
    const reminderDays = [7, 3, 1];

    if (reminderDays.includes(daysLeft)) {
      // Edge case: Check if hearing was scheduled recently
      const createdDate = session.created_at || session.createdAt;
      if (createdDate) {
        const daysSinceCreation = daysSinceUpdate(createdDate);
        const totalDaysUntilHearing = daysLeft + daysSinceCreation;

        // Skip "missed" reminders
        if (daysLeft > totalDaysUntilHearing) {
          return new RuleResult(false);
        }
      }

      // Get parent dossier/lawsuit to inherit priority
      const dossiers = entities.dossiers || [];
      const lawsuits = entities.lawsuits || [];

      let priority = "Moyenne";
      let parentDossier = null;

      // Try to find parent via lawsuit first
      if (session.lawsuit_id) {
        const parentLawsuit = lawsuits.find((c) => c.id === session.lawsuit_id);
        if (parentLawsuit && parentLawsuit.dossier_id) {
          parentDossier = dossiers.find((d) => d.id === parentLawsuit.dossier_id);
        }
      }

      // Or directly via dossier_id
      if (!parentDossier && session.dossier_id) {
        parentDossier = dossiers.find((d) => d.id === session.dossier_id);
      }

      if (parentDossier) {
        priority = parentDossier.priority || "Moyenne";
      }

      const priorityWeight = getPriorityWeight(priority);

      // Determine priority based on days left AND dossier priority
      // Hearings are always critical, but urgency increases with proximity
      let notificationPriority = "high";
      if (daysLeft === 1) {
        notificationPriority = "urgent"; // Always urgent 1 day before
      } else if (daysLeft === 3) {
        notificationPriority = priorityWeight >= 3 ? "urgent" : "high"; // High priority dossiers get urgent
      } else if (daysLeft === 7) {
        notificationPriority = priorityWeight >= 3 ? "high" : "medium"; // High priority gets high, others medium
      }

      // Resolve the correct entity (lawsuit/dossier/session)
      const entityInfo = resolveSessionEntity(session, entities);
      const entityReference = entityInfo ? entityInfo.reference : 'Audience';
      const entityLabel = entityInfo ? entityInfo.label : '';
      const time = getSessionTime(scheduledDate);
      const sessionTitle = session.title || entityReference;
      const variantIndex = getVariantIndexFromText(
        session.description || session.title
      );

      return new RuleResult(true, {
        priority: notificationPriority,
        frequency: "once",
        subType: "upcomingHearing",
        entityType: entityInfo?.entityType || 'session',
        entityId: entityInfo?.entityId || session.id,
        titleKey: "content.session.upcomingHearing.title",
        titleParams:
          variantIndex !== null ? { count: daysLeft, variantIndex } : { count: daysLeft },
        messageKey: session.location
          ? "content.session.upcomingHearing.messageWithLocation"
          : "content.session.upcomingHearing.messageNoLocation",
        messageParams: {
          lawsuitNumber: entityReference,
          entityLabel: entityLabel,
          count: daysLeft,
          sessionTitle,
          time,
          scheduledDate,
          sessionType: session.session_type || session.sessionType,
          courtRoom: session.court_room || session.courtRoom,
          location: session.location,
          participants: session.participants,
          parentContext: "",
        },
        metadata: {
          sessionId: session.id,
          lawsuitNumber: entityReference,
          entityLabel: entityLabel,
          entityType: entityInfo?.entityType,
          entityId: entityInfo?.entityId,
          scheduledDate,
          sessionTitle,
          time,
          daysLeft,
          location: session.location,
          dossierId: parentDossier?.id,
          dossierPriority: priority,
          parentContext: "",
        },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Participant Reminder
   * Triggers: At 7, 3, and 1 day(s) before scheduled hearing
   * Only fires when participants exist
   */
  participantReminder(session) {
    const scheduledDate = session.scheduled_at || session.scheduledAt;
    if (!scheduledDate) return new RuleResult(false);

    const isHearing =
      session.session_type === "hearing" ||
      session.session_type === "Audience" ||
      session.sessionType === "hearing" ||
      session.sessionType === "Audience";

    if (!isHearing) return new RuleResult(false);

    if (
      session.status === "cancelled" ||
      session.status === "Annulee" ||
      session.status === "completed" ||
      session.status === "Terminee"
    ) {
      return new RuleResult(false);
    }

    const participants = session.participants;
    const participantsCount = Array.isArray(participants)
      ? participants.length
      : participants
        ? 1
        : 0;
    if (!participantsCount) return new RuleResult(false);

    const daysLeft = calculateDaysDifference(scheduledDate);
    const reminderDays = [7, 3, 1];
    if (!reminderDays.includes(daysLeft)) {
      return new RuleResult(false);
    }

    const createdDate = session.created_at || session.createdAt;
    if (createdDate) {
      const daysSinceCreation = daysSinceUpdate(createdDate);
      const totalDaysUntilHearing = daysLeft + daysSinceCreation;
      if (daysLeft > totalDaysUntilHearing) {
        return new RuleResult(false);
      }
    }

    const entityInfo = resolveSessionEntity(session, entities);
    const entityReference = entityInfo ? entityInfo.reference : "Audience";
    const entityLabel = entityInfo ? entityInfo.label : "";
    const time = getSessionTime(scheduledDate);
    const sessionTitle = session.title || entityReference;
    const variantIndex = getVariantIndexFromText(
      session.description || session.title
    );

    return new RuleResult(true, {
      priority: daysLeft === 1 ? "high" : "medium",
      frequency: "once",
      subType: "participantReminder",
      entityType: entityInfo?.entityType || "session",
      entityId: entityInfo?.entityId || session.id,
      titleKey: "content.session.participantReminder.title",
      titleParams:
          variantIndex !== null ? { count: daysLeft, variantIndex } : { count: daysLeft },
      messageKey: "content.session.participantReminder.message",
      messageParams: {
        sessionTitle,
        lawsuitNumber: entityReference,
        entityLabel,
        count: daysLeft,
        time,
        scheduledDate,
        sessionType: session.session_type || session.sessionType,
        courtRoom: session.court_room || session.courtRoom,
        location: session.location,
        participants,
        participantsCount,
        parentContext: "",
      },
      metadata: {
        sessionId: session.id,
        lawsuitNumber: entityReference,
        entityLabel,
        entityType: entityInfo?.entityType,
        entityId: entityInfo?.entityId,
        scheduledDate,
        sessionTitle,
        time,
        daysLeft,
        location: session.location,
        participants,
        participantsCount,
        parentContext: "",
      },
    });
  },

  /**
   * RULE: Hearing Today
   * Triggers: Morning reminder on day of hearing
   * ALWAYS notify - this is critical
   */
  hearingToday(session) {
    const scheduledDate = session.scheduled_at || session.scheduledAt;
    if (!scheduledDate) return new RuleResult(false);

    // Skip if not a hearing/audience
    const isHearing =
      session.session_type === "hearing" ||
      session.session_type === "Audience" ||
      session.sessionType === "hearing" ||
      session.sessionType === "Audience";

    if (!isHearing) return new RuleResult(false);

    // Skip if cancelled or completed
    if (
      session.status === "cancelled" ||
      session.status === "Annulee" ||
      session.status === "completed" ||
      session.status === "Terminee"
    ) {
      return new RuleResult(false);
    }

    const daysLeft = calculateDaysDifference(scheduledDate);

    if (daysLeft === 0) {
      // Resolve the correct entity (lawsuit/dossier/session)
      const entityInfo = resolveSessionEntity(session, entities);
      const entityReference = entityInfo ? entityInfo.reference : "Audience";
      const entityLabel = entityInfo ? entityInfo.label : "";

      // Extract time if available
      const time = getSessionTime(scheduledDate) || "l'heure prevue";
      const sessionTitle = session.title || entityReference;
      const variantIndex = getVariantIndexFromText(
        session.description || session.title
      );

      return new RuleResult(true, {
        priority: "urgent",
        frequency: "once",
        subType: "hearingToday",
        entityType: entityInfo?.entityType || "session",
        entityId: entityInfo?.entityId || session.id,
        titleKey: "content.session.hearingToday.title",
        titleParams: variantIndex !== null ? { variantIndex } : {},
        messageKey: session.location
          ? "content.session.hearingToday.messageWithLocation"
          : "content.session.hearingToday.message",
        messageParams: {
          lawsuitNumber: entityReference,
          entityLabel,
          time,
          sessionTitle,
          sessionType: session.session_type || session.sessionType,
          courtRoom: session.court_room || session.courtRoom,
          location: session.location,
          participants: session.participants,
          parentContext: "",
        },
        metadata: {
          sessionId: session.id,
          lawsuitNumber: entityReference,
          entityLabel,
          entityType: entityInfo?.entityType,
          entityId: entityInfo?.entityId,
          scheduledDate,
          time,
          sessionTitle,
          location: session.location,
          daysLeft: 0,
          parentContext: "",
        },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Post-Hearing Outcome Reminder
   * Triggers: 1 day after a hearing that hasn't been updated with notes
   * Prompts user to document what happened during the hearing
   * Priority inherited from parent dossier
   */
  hearingOutcomeReminder(session) {
    const scheduledDate = session.scheduled_at || session.scheduledAt;
    if (!scheduledDate) return new RuleResult(false);

    // Only check hearings/audiences
    const isHearing =
      session.session_type === "hearing" ||
      session.session_type === "Audience" ||
      session.sessionType === "hearing" ||
      session.sessionType === "Audience";

    if (!isHearing) return new RuleResult(false);

    // Skip if already completed or cancelled
    if (
      session.status === "completed" ||
      session.status === "Terminee" ||
      session.status === "cancelled" ||
      session.status === "Annulee"
    ) {
      return new RuleResult(false);
    }

    // Skip if notes are already documented
    const notesValue = session.notes;
    const hasNotes = Array.isArray(notesValue)
      ? notesValue.length > 0
      : typeof notesValue === "string"
        ? notesValue.trim().length > 0
        : Boolean(notesValue);
    if (hasNotes) {
      return new RuleResult(false);
    }

    // Check if hearing date has passed (1+ day ago)
    const daysLeft = calculateDaysDifference(scheduledDate);

    if (daysLeft < -1) {
      // Hearing was more than 1 day ago and still no outcome
      const daysSinceHearing = Math.abs(daysLeft);

      // Get parent dossier/lawsuit to inherit priority
      const dossiers = entities.dossiers || [];
      const lawsuits = entities.lawsuits || [];

      let priority = "Moyenne";
      let parentDossier = null;

      // Try to find parent via lawsuit first
      if (session.lawsuit_id) {
        const parentLawsuit = lawsuits.find((c) => c.id === session.lawsuit_id);
        if (parentLawsuit && parentLawsuit.dossier_id) {
          parentDossier = dossiers.find((d) => d.id === parentLawsuit.dossier_id);
        }
      }

      // Or directly via dossier_id
      if (!parentDossier && session.dossier_id) {
        parentDossier = dossiers.find((d) => d.id === session.dossier_id);
      }

      if (parentDossier) {
        priority = parentDossier.priority || "Moyenne";
      }

      const priorityWeight = getPriorityWeight(priority);

      // Resolve the correct entity (lawsuit/dossier/session)
      const entityInfo = resolveSessionEntity(session, entities);
      const entityReference = entityInfo ? entityInfo.reference : 'Audience';
      const entityLabel = entityInfo ? entityInfo.label : '';
      const variantIndex = getVariantIndexFromText(
        session.description || session.title
      );

      return new RuleResult(true, {
        priority: priorityWeight >= 3 ? "high" : "medium",
        frequency: daysSinceHearing <= 7 ? "once" : "weekly",
        subType: "hearingOutcome",
        entityType: entityInfo?.entityType || 'session',
        entityId: entityInfo?.entityId || session.id,
        titleKey: "content.session.hearingOutcome.title",
        titleParams: variantIndex !== null ? { variantIndex } : {},
        messageKey: "content.session.hearingOutcome.message",
        messageParams: {
          lawsuitNumber: entityReference,
          entityLabel: entityLabel,
          count: daysSinceHearing
        },
        metadata: {
          sessionId: session.id,
          lawsuitNumber: entityReference,
          entityLabel: entityLabel,
          entityType: entityInfo?.entityType,
          entityId: entityInfo?.entityId,
          scheduledDate,
          daysSinceHearing,
          dossierId: parentDossier?.id,
          dossierPriority: priority,
        },
      });
    }

    return new RuleResult(false);
  },
};



