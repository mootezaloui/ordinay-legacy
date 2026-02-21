/**
 * Template Service - Document Generation from DOCX Templates
 *
 * No AI, no editor, no layout manipulation.
 * Uses docxtemplater + pizzip to fill placeholders only.
 */

import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { saveAs } from "file-saver";
import templateManager from "./templateManager";
import { LocalStorageProvider } from "./storage/LocalStorageProvider.js";

const MISSING_VALUE = "";
const FIRM_INFO_KEY = "firm_info";

class TemplateService {
  constructor() {
    this.storageProvider = new LocalStorageProvider();
  }

  sanitizeFileNameSegment(value) {
    if (value === null || value === undefined) return "";
    const normalized = String(value).normalize("NFKC");
    const withoutForbidden = normalized.replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ");
    const compact = withoutForbidden
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^[._\s]+|[._\s]+$/g, "");
    return compact.slice(0, 120);
  }

  isMeaningfulFileNameSegment(value) {
    return /[\p{L}\p{N}]/u.test(String(value || ""));
  }

  buildGeneratedFileName({ templateName, entityType, entityData }) {
    const timestamp = new Date().toISOString().split("T")[0];
    const templateBase = this.sanitizeFileNameSegment(templateName || "");
    const entityHint = this.sanitizeFileNameSegment(
      entityData?.reference ||
        entityData?.lawsuitNumber ||
        entityData?.case_number ||
        entityData?.title ||
        entityData?.name ||
        entityData?.id ||
        entityType,
    );

    const baseName = this.isMeaningfulFileNameSegment(templateBase)
      ? templateBase
      : this.isMeaningfulFileNameSegment(entityHint)
        ? `${entityType}_${entityHint}`
        : `${entityType}_document`;

    return `${baseName}_${timestamp}.docx`;
  }

  /**
   * Get available templates for entity type
   * @param {string} entityType - 'proces' or 'dossier'
   * @param {string|null} language - Optional language filter
   * @returns {Array} Available templates
   */
  getAvailableTemplates(entityType, language = null) {
    return templateManager.getAllTemplates(entityType, language);
  }

  getMissingValue() {
    return MISSING_VALUE;
  }

  isMissingValue(value) {
    return value === null || value === undefined || value === "" || value === MISSING_VALUE;
  }

  loadFirmInfo() {
    try {
      const raw = localStorage.getItem(FIRM_INFO_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn("[TemplateService] Failed to read firm info:", error);
      return null;
    }
  }

  resolveOperator(contextData) {
    if (!contextData) return null;
    if (contextData.operator) return contextData.operator;
    if (Array.isArray(contextData.operators) && contextData.operators.length > 0) {
      const currentId = contextData.currentOperatorId;
      if (currentId) {
        return contextData.operators.find((op) => op.id === currentId) || contextData.operators[0];
      }
      return contextData.operators[0];
    }
    return null;
  }

  resolveSignatureValue(operator, firmInfo) {
    const signature =
      operator?.signature ||
      firmInfo?.signature ||
      operator?.signature_image ||
      firmInfo?.signature_image ||
      null;

    if (!signature) return null;

    if (typeof signature === "string") {
      // Safe mode: only blank line unless an image module is wired.
      return null;
    }

    return null;
  }

  buildVariantData(template, selectedVariantKey) {
    const variants = Array.isArray(template?.variants) ? template.variants : [];
    if (variants.length === 0) return {};

    const data = {};
    variants.forEach((variant) => {
      if (!variant?.key) return;
      const placeholder = variant.placeholder || `variant.${variant.key}`;
      if (!placeholder) return;
      if (variant.key === selectedVariantKey) {
        data[placeholder] =
          variant.value !== undefined && variant.value !== null
            ? variant.value
            : MISSING_VALUE;
      } else {
        data[placeholder] = "";
      }
    });
    return data;
  }

  /**
   * Extract data from entity for placeholder replacement
   * @param {string} entityType - 'proces' or 'dossier'
   * @param {Object} entityData - Entity data
   * @param {Object} contextData - Full context (for relations)
   * @returns {Object} Mapped data
   */
  extractEntityData(entityType, entityData, contextData) {
    const data = {
      "client.id": MISSING_VALUE,
      "client.name": MISSING_VALUE,
      "client.email": MISSING_VALUE,
      "client.phone": MISSING_VALUE,
      "client.alternate_phone": MISSING_VALUE,
      "client.address": MISSING_VALUE,
      "client.status": MISSING_VALUE,
      "client.cin": MISSING_VALUE,
      "client.date_of_birth": MISSING_VALUE,
      "client.profession": MISSING_VALUE,
      "client.company": MISSING_VALUE,
      "client.tax_id": MISSING_VALUE,
      "client.notes": MISSING_VALUE,
      "client.missing_fields": MISSING_VALUE,
      "client.join_date": MISSING_VALUE,
      "client.created_at": MISSING_VALUE,
      "client.updated_at": MISSING_VALUE,
      "client.imported": MISSING_VALUE,
      "client.validated": MISSING_VALUE,
      "client.import_source": MISSING_VALUE,
      "client.imported_at": MISSING_VALUE,
      "client.deleted_at": MISSING_VALUE,
      "dossier.id": MISSING_VALUE,
      "dossier.reference": MISSING_VALUE,
      "dossier.client_id": MISSING_VALUE,
      "dossier.title": MISSING_VALUE,
      "dossier.description": MISSING_VALUE,
      "dossier.category": MISSING_VALUE,
      "dossier.phase": MISSING_VALUE,
      "dossier.adversary_name": MISSING_VALUE,
      "dossier.adversary_party": MISSING_VALUE,
      "dossier.adversary_lawyer": MISSING_VALUE,
      "dossier.estimated_value": MISSING_VALUE,
      "dossier.court_reference": MISSING_VALUE,
      "dossier.assigned_lawyer": MISSING_VALUE,
      "dossier.status": MISSING_VALUE,
      "dossier.priority": MISSING_VALUE,
      "dossier.opened_at": MISSING_VALUE,
      "dossier.next_deadline": MISSING_VALUE,
      "dossier.closed_at": MISSING_VALUE,
      "dossier.created_at": MISSING_VALUE,
      "dossier.updated_at": MISSING_VALUE,
      "dossier.imported": MISSING_VALUE,
      "dossier.validated": MISSING_VALUE,
      "dossier.import_source": MISSING_VALUE,
      "dossier.imported_at": MISSING_VALUE,
      "dossier.deleted_at": MISSING_VALUE,
      "proces.id": MISSING_VALUE,
      "proces.reference": MISSING_VALUE,
      "proces.case_number": MISSING_VALUE,
      "proces.dossier_id": MISSING_VALUE,
      "proces.title": MISSING_VALUE,
      "proces.description": MISSING_VALUE,
      "proces.adversary_name": MISSING_VALUE,
      "proces.adversary": MISSING_VALUE,
      "proces.adversary_party": MISSING_VALUE,
      "proces.adversary_lawyer": MISSING_VALUE,
      "proces.court": MISSING_VALUE,
      "proces.filing_date": MISSING_VALUE,
      "proces.next_hearing": MISSING_VALUE,
      "proces.judgment_number": MISSING_VALUE,
      "proces.judgment_date": MISSING_VALUE,
      "proces.reference_number": MISSING_VALUE,
      "proces.status": MISSING_VALUE,
      "proces.priority": MISSING_VALUE,
      "proces.opened_at": MISSING_VALUE,
      "proces.closed_at": MISSING_VALUE,
      "proces.created_at": MISSING_VALUE,
      "proces.updated_at": MISSING_VALUE,
      "proces.imported": MISSING_VALUE,
      "proces.validated": MISSING_VALUE,
      "proces.import_source": MISSING_VALUE,
      "proces.imported_at": MISSING_VALUE,
      "proces.deleted_at": MISSING_VALUE,
      "court.name": MISSING_VALUE,
      "court.address": MISSING_VALUE,
      "court.city": MISSING_VALUE,
      "lawyer.name": MISSING_VALUE,
      "lawyer.title": MISSING_VALUE,
      "lawyer.firm_name": MISSING_VALUE,
      "lawyer.office_name": MISSING_VALUE,
      "lawyer.office_address": MISSING_VALUE,
      "lawyer.phone": MISSING_VALUE,
      "lawyer.fax": MISSING_VALUE,
      "lawyer.mobile": MISSING_VALUE,
      "lawyer.email": MISSING_VALUE,
      "lawyer.vpa": MISSING_VALUE,
      "lawyer.signature": MISSING_VALUE,
      "session.id": MISSING_VALUE,
      "session.title": MISSING_VALUE,
      "session.session_type": MISSING_VALUE,
      "session.status": MISSING_VALUE,
      "session.scheduled_at": MISSING_VALUE,
      "session.session_date": MISSING_VALUE,
      "session.duration": MISSING_VALUE,
      "session.location": MISSING_VALUE,
      "session.court_room": MISSING_VALUE,
      "session.judge": MISSING_VALUE,
      "session.outcome": MISSING_VALUE,
      "session.description": MISSING_VALUE,
      "session.notes": MISSING_VALUE,
      "session.participants": MISSING_VALUE,
      "session.dossier_id": MISSING_VALUE,
      "session.lawsuit_id": MISSING_VALUE,
      "session.created_at": MISSING_VALUE,
      "session.updated_at": MISSING_VALUE,
      "session.imported": MISSING_VALUE,
      "session.validated": MISSING_VALUE,
      "session.import_source": MISSING_VALUE,
      "session.imported_at": MISSING_VALUE,
      "session.deleted_at": MISSING_VALUE,
      "session.date": MISSING_VALUE,
      "financial_entry.id": MISSING_VALUE,
      "financial_entry.scope": MISSING_VALUE,
      "financial_entry.client_id": MISSING_VALUE,
      "financial_entry.dossier_id": MISSING_VALUE,
      "financial_entry.lawsuit_id": MISSING_VALUE,
      "financial_entry.mission_id": MISSING_VALUE,
      "financial_entry.task_id": MISSING_VALUE,
      "financial_entry.personal_task_id": MISSING_VALUE,
      "financial_entry.entry_type": MISSING_VALUE,
      "financial_entry.status": MISSING_VALUE,
      "financial_entry.category": MISSING_VALUE,
      "financial_entry.amount": MISSING_VALUE,
      "financial_entry.currency": MISSING_VALUE,
      "financial_entry.occurred_at": MISSING_VALUE,
      "financial_entry.due_date": MISSING_VALUE,
      "financial_entry.paid_at": MISSING_VALUE,
      "financial_entry.title": MISSING_VALUE,
      "financial_entry.description": MISSING_VALUE,
      "financial_entry.reference": MISSING_VALUE,
      "financial_entry.notes": MISSING_VALUE,
      "financial_entry.direction": MISSING_VALUE,
      "financial_entry.cancelled_at": MISSING_VALUE,
      "financial_entry.cancellation_reason": MISSING_VALUE,
      "financial_entry.created_at": MISSING_VALUE,
      "financial_entry.updated_at": MISSING_VALUE,
      "financial_entry.imported": MISSING_VALUE,
      "financial_entry.validated": MISSING_VALUE,
      "financial_entry.import_source": MISSING_VALUE,
      "financial_entry.imported_at": MISSING_VALUE,
      "financial_entry.deleted_at": MISSING_VALUE,
      "adversary.name": MISSING_VALUE,
      "judgment.number": MISSING_VALUE,
      "judgment.date": MISSING_VALUE,
      "document.copy_type": MISSING_VALUE,
      "today.date": new Date().toLocaleDateString("fr-FR"),
    };

    const firmInfo = this.loadFirmInfo();
    const operator = this.resolveOperator(contextData);
    if (operator?.name) {
      data["lawyer.name"] = operator.name;
    }
    const firmName =
      firmInfo?.name ||
      operator?.firm_name ||
      operator?.firmName ||
      operator?.office ||
      null;
    if (firmName) {
      data["lawyer.firm_name"] = firmName;
    }
    const officeName =
      firmInfo?.office_name ||
      firmInfo?.officeName ||
      firmInfo?.firm_name ||
      firmInfo?.firmName ||
      operator?.office_name ||
      operator?.officeName ||
      firmName ||
      null;
    if (officeName) {
      data["lawyer.office_name"] = officeName;
    }
    const officeAddress =
      firmInfo?.office_address ||
      firmInfo?.officeAddress ||
      firmInfo?.address ||
      operator?.office_address ||
      operator?.officeAddress ||
      operator?.address ||
      null;
    if (officeAddress) {
      data["lawyer.office_address"] = officeAddress;
    }
    const lawyerTitle = operator?.title || firmInfo?.title || null;
    if (lawyerTitle) {
      data["lawyer.title"] = lawyerTitle;
    }
    const lawyerPhone = operator?.phone || firmInfo?.phone || firmInfo?.telephone || null;
    if (lawyerPhone) {
      data["lawyer.phone"] = lawyerPhone;
    }
    const lawyerFax = operator?.fax || firmInfo?.fax || null;
    if (lawyerFax) {
      data["lawyer.fax"] = lawyerFax;
    }
    const lawyerMobile = operator?.mobile || operator?.cell || firmInfo?.mobile || firmInfo?.cell || null;
    if (lawyerMobile) {
      data["lawyer.mobile"] = lawyerMobile;
    }
    const lawyerEmail = operator?.email || firmInfo?.email || null;
    if (lawyerEmail) {
      data["lawyer.email"] = lawyerEmail;
    }
    const lawyerVpa = operator?.vpa || firmInfo?.vpa || firmInfo?.vpa_number || null;
    if (lawyerVpa) {
      data["lawyer.vpa"] = lawyerVpa;
    }
    const signatureValue = this.resolveSignatureValue(operator, firmInfo);
    if (signatureValue) {
      data["lawyer.signature"] = signatureValue;
    }

    const toText = (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value === "string") return value;
      if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
      }
      if (Array.isArray(value)) {
        return value
          .map((item) => {
            if (typeof item === "string") return item;
            if (item?.content) return item.content;
            try {
              return JSON.stringify(item);
            } catch (_error) {
              return String(item);
            }
          })
          .filter(Boolean)
          .join("\n");
      }
      try {
        return JSON.stringify(value);
      } catch (_error) {
        return String(value);
      }
    };

    const applyDossierFields = (dossierSource) => {
      if (!dossierSource) return;

      const reference =
        dossierSource.reference ||
        dossierSource.lawsuitNumber ||
        dossierSource.case_number ||
        null;
      const clientId =
        dossierSource.clientId ||
        dossierSource.client_id ||
        dossierSource.client?.id ||
        null;
      const adversaryName =
        dossierSource.adversaryName ||
        dossierSource.adversary_name ||
        dossierSource.adversary ||
        null;
      const adversaryParty =
        dossierSource.adversaryParty ||
        dossierSource.adversary_party ||
        dossierSource.adversary ||
        null;

      data["dossier.id"] = toText(dossierSource.id) || data["dossier.id"];
      data["dossier.reference"] =
        toText(reference) || data["dossier.reference"];
      data["dossier.client_id"] =
        toText(clientId) || data["dossier.client_id"];
      data["dossier.title"] = toText(dossierSource.title) || data["dossier.title"];
      data["dossier.description"] =
        toText(dossierSource.description) || data["dossier.description"];
      data["dossier.category"] =
        toText(dossierSource.category) || data["dossier.category"];
      data["dossier.phase"] = toText(dossierSource.phase) || data["dossier.phase"];
      data["dossier.adversary_name"] =
        toText(adversaryName) || data["dossier.adversary_name"];
      data["dossier.adversary_party"] =
        toText(adversaryParty || adversaryName) ||
        data["dossier.adversary_party"];
      data["dossier.adversary_lawyer"] =
        toText(dossierSource.adversaryLawyer || dossierSource.adversary_lawyer) ||
        data["dossier.adversary_lawyer"];
      data["dossier.estimated_value"] =
        toText(dossierSource.estimatedValue || dossierSource.estimated_value) ||
        data["dossier.estimated_value"];
      data["dossier.court_reference"] =
        toText(dossierSource.courtReference || dossierSource.court_reference) ||
        data["dossier.court_reference"];
      data["dossier.assigned_lawyer"] =
        toText(dossierSource.assignedLawyer || dossierSource.assigned_lawyer) ||
        data["dossier.assigned_lawyer"];
      data["dossier.status"] = toText(dossierSource.status) || data["dossier.status"];
      data["dossier.priority"] =
        toText(dossierSource.priority) || data["dossier.priority"];
      data["dossier.opened_at"] =
        toText(dossierSource.opened_at || dossierSource.openDate || dossierSource.openedAt) ||
        data["dossier.opened_at"];
      data["dossier.next_deadline"] =
        toText(dossierSource.next_deadline || dossierSource.nextDeadline) ||
        data["dossier.next_deadline"];
      data["dossier.closed_at"] =
        toText(dossierSource.closed_at || dossierSource.closeDate || dossierSource.closedAt) ||
        data["dossier.closed_at"];
      data["dossier.created_at"] =
        toText(dossierSource.created_at || dossierSource.createdAt) ||
        data["dossier.created_at"];
      data["dossier.updated_at"] =
        toText(dossierSource.updated_at || dossierSource.updatedAt) ||
        data["dossier.updated_at"];
      data["dossier.imported"] =
        toText(dossierSource.imported) || data["dossier.imported"];
      data["dossier.validated"] =
        toText(dossierSource.validated) || data["dossier.validated"];
      data["dossier.import_source"] =
        toText(dossierSource.import_source || dossierSource.importSource) ||
        data["dossier.import_source"];
      data["dossier.imported_at"] =
        toText(dossierSource.imported_at || dossierSource.importedAt) ||
        data["dossier.imported_at"];
      data["dossier.deleted_at"] =
        toText(dossierSource.deleted_at || dossierSource.deletedAt) ||
        data["dossier.deleted_at"];
    };

    const applyCaseFields = (caseSource) => {
      if (!caseSource) return;

      const reference =
        caseSource.reference ||
        caseSource.lawsuitNumber ||
        caseSource.case_number ||
        null;
      const lawsuitNumber = caseSource.case_number || caseSource.lawsuitNumber || null;
      const dossierId =
        caseSource.dossierId ||
        caseSource.dossier_id ||
        caseSource.dossier?.id ||
        null;
      const adversaryName =
        caseSource.adversaryName ||
        caseSource.adversary_name ||
        caseSource.adversary ||
        caseSource.adversary_party ||
        null;
      const adversary =
        caseSource.adversary ||
        caseSource.adversaire ||
        caseSource.adversary_name ||
        null;
      const adversaryParty =
        caseSource.adversaryParty ||
        caseSource.adversary_party ||
        caseSource.adversary_name ||
        caseSource.adversary ||
        null;
      const referenceNumber =
        caseSource.reference_number ||
        caseSource.referenceNumber ||
        caseSource.courtReference ||
        caseSource.court_reference ||
        null;
      const filingDate = caseSource.filingDate || caseSource.filing_date || null;
      const nextHearing =
        caseSource.nextHearing || caseSource.next_hearing || null;
      const judgmentNumber =
        caseSource.judgmentNumber ||
        caseSource.judgment_number ||
        caseSource.judgment?.number ||
        null;
      const judgmentDate =
        caseSource.judgmentDate ||
        caseSource.judgment_date ||
        caseSource.judgment?.date ||
        null;

      data["proces.id"] = toText(caseSource.id) || data["proces.id"];
      data["proces.reference"] =
        toText(reference) || data["proces.reference"];
      data["proces.case_number"] =
        toText(lawsuitNumber) || data["proces.case_number"];
      data["proces.dossier_id"] =
        toText(dossierId) || data["proces.dossier_id"];
      data["proces.title"] = toText(caseSource.title) || data["proces.title"];
      data["proces.description"] =
        toText(caseSource.description) || data["proces.description"];
      data["proces.adversary_name"] =
        toText(adversaryName) || data["proces.adversary_name"];
      data["proces.adversary"] =
        toText(adversary) || data["proces.adversary"];
      data["proces.adversary_party"] =
        toText(adversaryParty || adversaryName) ||
        data["proces.adversary_party"];
      data["proces.adversary_lawyer"] =
        toText(caseSource.adversaryLawyer || caseSource.adversary_lawyer) ||
        data["proces.adversary_lawyer"];
      data["proces.court"] = toText(caseSource.court) || data["proces.court"];
      data["proces.filing_date"] =
        toText(filingDate) || data["proces.filing_date"];
      data["proces.next_hearing"] =
        toText(nextHearing) || data["proces.next_hearing"];
      data["proces.judgment_number"] =
        toText(judgmentNumber) || data["proces.judgment_number"];
      data["proces.judgment_date"] =
        toText(judgmentDate) || data["proces.judgment_date"];
      data["proces.reference_number"] =
        toText(referenceNumber) || data["proces.reference_number"];
      data["proces.status"] = toText(caseSource.status) || data["proces.status"];
      data["proces.priority"] =
        toText(caseSource.priority) || data["proces.priority"];
      data["proces.opened_at"] =
        toText(caseSource.opened_at || caseSource.openDate || caseSource.openedAt) ||
        data["proces.opened_at"];
      data["proces.closed_at"] =
        toText(caseSource.closed_at || caseSource.closeDate || caseSource.closedAt) ||
        data["proces.closed_at"];
      data["proces.created_at"] =
        toText(caseSource.created_at || caseSource.createdAt) ||
        data["proces.created_at"];
      data["proces.updated_at"] =
        toText(caseSource.updated_at || caseSource.updatedAt) ||
        data["proces.updated_at"];
      data["proces.imported"] =
        toText(caseSource.imported) || data["proces.imported"];
      data["proces.validated"] =
        toText(caseSource.validated) || data["proces.validated"];
      data["proces.import_source"] =
        toText(caseSource.import_source || caseSource.importSource) ||
        data["proces.import_source"];
      data["proces.imported_at"] =
        toText(caseSource.imported_at || caseSource.importedAt) ||
        data["proces.imported_at"];
      data["proces.deleted_at"] =
        toText(caseSource.deleted_at || caseSource.deletedAt) ||
        data["proces.deleted_at"];
    };

    const applySessionFields = (sessionSource) => {
      if (!sessionSource) return;

      const sessionType =
        sessionSource.session_type || sessionSource.sessionType || sessionSource.type || null;
      const scheduledAt = sessionSource.scheduled_at || sessionSource.scheduledAt || null;
      const sessionDate =
        sessionSource.session_date ||
        sessionSource.sessionDate ||
        sessionSource.date ||
        null;
      const dossierId =
        sessionSource.dossierId ||
        sessionSource.dossier_id ||
        sessionSource.dossier?.id ||
        null;
      const lawsuitId =
        sessionSource.lawsuitId ||
        sessionSource.lawsuit_id ||
        sessionSource.lawsuit?.id ||
        null;
      const participants =
        sessionSource.participants ||
        sessionSource.participant_list ||
        null;

      data["session.id"] = toText(sessionSource.id) || data["session.id"];
      data["session.title"] =
        toText(sessionSource.title) || data["session.title"];
      data["session.session_type"] =
        toText(sessionType) || data["session.session_type"];
      data["session.status"] =
        toText(sessionSource.status) || data["session.status"];
      data["session.scheduled_at"] =
        toText(scheduledAt) || data["session.scheduled_at"];
      data["session.session_date"] =
        toText(sessionDate) || data["session.session_date"];
      data["session.duration"] =
        toText(sessionSource.duration) || data["session.duration"];
      data["session.location"] =
        toText(sessionSource.location) || data["session.location"];
      data["session.court_room"] =
        toText(sessionSource.court_room || sessionSource.courtRoom) ||
        data["session.court_room"];
      data["session.judge"] =
        toText(sessionSource.judge) || data["session.judge"];
      data["session.outcome"] =
        toText(sessionSource.outcome) || data["session.outcome"];
      data["session.description"] =
        toText(sessionSource.description) || data["session.description"];
      data["session.notes"] =
        toText(sessionSource.notes) || data["session.notes"];
      data["session.participants"] =
        toText(participants) || data["session.participants"];
      data["session.dossier_id"] =
        toText(dossierId) || data["session.dossier_id"];
      data["session.lawsuit_id"] =
        toText(lawsuitId) || data["session.lawsuit_id"];
      data["session.created_at"] =
        toText(sessionSource.created_at || sessionSource.createdAt) ||
        data["session.created_at"];
      data["session.updated_at"] =
        toText(sessionSource.updated_at || sessionSource.updatedAt) ||
        data["session.updated_at"];
      data["session.imported"] =
        toText(sessionSource.imported) || data["session.imported"];
      data["session.validated"] =
        toText(sessionSource.validated) || data["session.validated"];
      data["session.import_source"] =
        toText(sessionSource.import_source || sessionSource.importSource) ||
        data["session.import_source"];
      data["session.imported_at"] =
        toText(sessionSource.imported_at || sessionSource.importedAt) ||
        data["session.imported_at"];
      data["session.deleted_at"] =
        toText(sessionSource.deleted_at || sessionSource.deletedAt) ||
        data["session.deleted_at"];
    };

    const resolveClient = () => {
      if (entityData?.client && typeof entityData.client === "object") {
        return entityData.client;
      }
      if (typeof entityData?.client === "string") {
        return { name: entityData.client };
      }
      if (entityData?.clientId && Array.isArray(contextData?.clients)) {
        return contextData.clients.find(
          (client) => String(client.id) === String(entityData.clientId),
        );
      }
      if (
        entityType === "proces" &&
        entityData?.dossierId &&
        Array.isArray(contextData?.dossiers) &&
        Array.isArray(contextData?.clients)
      ) {
        const dossier = contextData.dossiers.find(
          (item) => String(item.id) === String(entityData.dossierId),
        );
        if (dossier?.clientId) {
          return contextData.clients.find(
            (client) => String(client.id) === String(dossier.clientId),
          );
        }
      }
      if (entityType === "session") {
        const lawsuits = Array.isArray(contextData?.lawsuits) ? contextData.lawsuits : [];
        const dossiers = Array.isArray(contextData?.dossiers)
          ? contextData.dossiers
          : [];
        const clients = Array.isArray(contextData?.clients)
          ? contextData.clients
          : [];
        const caseItem = entityData?.lawsuitId
          ? lawsuits.find((item) => String(item.id) === String(entityData.lawsuitId))
          : null;
        const dossierItem = entityData?.dossierId
          ? dossiers.find((item) => String(item.id) === String(entityData.dossierId))
          : caseItem?.dossierId
            ? dossiers.find((item) => String(item.id) === String(caseItem.dossierId))
            : null;
        if (dossierItem?.clientId) {
          return clients.find(
            (client) => String(client.id) === String(dossierItem.clientId),
          );
        }
      }
      return null;
    };

    const client = resolveClient();
    if (client) {
      data["client.id"] = toText(client.id) || data["client.id"];
      data["client.name"] = toText(client.name) || data["client.name"];
      data["client.email"] = toText(client.email) || data["client.email"];
      data["client.phone"] = toText(client.phone) || data["client.phone"];
      data["client.alternate_phone"] =
        toText(client.alternatePhone || client.alternate_phone) ||
        data["client.alternate_phone"];
      data["client.address"] = toText(client.address) || data["client.address"];
      data["client.status"] = toText(client.status) || data["client.status"];
      data["client.cin"] = toText(client.cin) || data["client.cin"];
      data["client.date_of_birth"] =
        toText(client.dateOfBirth || client.date_of_birth) ||
        data["client.date_of_birth"];
      data["client.profession"] =
        toText(client.profession) || data["client.profession"];
      data["client.company"] = toText(client.company) || data["client.company"];
      data["client.tax_id"] =
        toText(client.taxId || client.tax_id) || data["client.tax_id"];
      data["client.notes"] = toText(client.notes) || data["client.notes"];
      data["client.missing_fields"] =
        toText(client.missingFields || client.missing_fields) ||
        data["client.missing_fields"];
      data["client.join_date"] =
        toText(client.joinDate || client.join_date) || data["client.join_date"];
      data["client.created_at"] =
        toText(client.created_at || client.createdAt) || data["client.created_at"];
      data["client.updated_at"] =
        toText(client.updated_at || client.updatedAt) || data["client.updated_at"];
      data["client.imported"] =
        toText(client.imported) || data["client.imported"];
      data["client.validated"] =
        toText(client.validated) || data["client.validated"];
      data["client.import_source"] =
        toText(client.importSource || client.import_source) ||
        data["client.import_source"];
      data["client.imported_at"] =
        toText(client.importedAt || client.imported_at) ||
        data["client.imported_at"];
      data["client.deleted_at"] =
        toText(client.deleted_at || client.deletedAt) || data["client.deleted_at"];
    }

    if (entityType === "proces") {
      applyCaseFields(entityData);
      data["proces.reference"] =
        toText(entityData?.lawsuitNumber) || data["proces.reference"] || MISSING_VALUE;
      data["court.name"] = entityData?.court || MISSING_VALUE;
      data["court.address"] =
        entityData?.courtAddress ||
        entityData?.court_address ||
        entityData?.court?.address ||
        MISSING_VALUE;
      data["court.city"] =
        entityData?.courtCity ||
        entityData?.court_city ||
        entityData?.court?.city ||
        MISSING_VALUE;

      if (entityData?.dossier?.lawsuitNumber) {
        data["dossier.reference"] = entityData.dossier.lawsuitNumber;
      } else if (entityData?.dossierId && contextData?.dossiers) {
        const dossier = contextData.dossiers.find(
          (d) => String(d.id) === String(entityData.dossierId),
        );
        if (dossier?.lawsuitNumber) {
          data["dossier.reference"] = dossier.lawsuitNumber;
        }
      }

      const adversaryName =
        entityData?.adversaryName ||
        entityData?.adversary ||
        entityData?.adversaryParty ||
        entityData?.adversary_name ||
        entityData?.adversary_party ||
        null;
      if (adversaryName) {
        data["adversary.name"] = adversaryName;
      }
    } else if (entityType === "dossier") {
      applyDossierFields(entityData);
      data["court.name"] = entityData?.court || data["court.name"];
      data["court.address"] =
        entityData?.courtAddress ||
        entityData?.court_address ||
        entityData?.court?.address ||
        data["court.address"];
      data["court.city"] =
        entityData?.courtCity ||
        entityData?.court_city ||
        entityData?.court?.city ||
        data["court.city"];
      const adversaryName =
        entityData?.adversaryName ||
        entityData?.adversary ||
        entityData?.adversaryParty ||
        entityData?.adversary_name ||
        entityData?.adversary_party ||
        null;
      if (adversaryName) {
        data["adversary.name"] = adversaryName;
      }
    } else if (entityType === "session") {
      applySessionFields(entityData);
      const lawsuits = Array.isArray(contextData?.lawsuits) ? contextData.lawsuits : [];
      const dossiers = Array.isArray(contextData?.dossiers) ? contextData.dossiers : [];
      const clients = Array.isArray(contextData?.clients) ? contextData.clients : [];

      const caseItem = entityData?.lawsuitId
        ? lawsuits.find((caseEntry) => String(caseEntry.id) === String(entityData.lawsuitId))
        : null;
      const dossierItem = entityData?.dossierId
        ? dossiers.find((dossierEntry) => String(dossierEntry.id) === String(entityData.dossierId))
        : caseItem?.dossierId
          ? dossiers.find((dossierEntry) => String(dossierEntry.id) === String(caseItem.dossierId))
          : null;

      if (caseItem) {
        applyCaseFields(caseItem);
      }

      if (caseItem?.lawsuitNumber) {
        data["proces.reference"] = caseItem.lawsuitNumber;
      }
      if (caseItem?.court) {
        data["court.name"] = caseItem.court;
      }
      if (caseItem?.courtAddress || caseItem?.court_address) {
        data["court.address"] = caseItem.courtAddress || caseItem.court_address;
      }
      if (caseItem?.courtCity || caseItem?.court_city) {
        data["court.city"] = caseItem.courtCity || caseItem.court_city;
      }

      if (dossierItem?.lawsuitNumber) {
        data["dossier.reference"] = dossierItem.lawsuitNumber;
      }

      if (this.isMissingValue(data["client.name"]) && dossierItem?.clientId) {
        const client = clients.find((clientEntry) => String(clientEntry.id) === String(dossierItem.clientId));
        if (client?.name) {
          data["client.name"] = client.name;
        }
      }

      const adversaryName =
        caseItem?.adversaryName ||
        caseItem?.adversary ||
        caseItem?.adversaryParty ||
        caseItem?.adversary_name ||
        caseItem?.adversary_party ||
        null;
      if (adversaryName) {
        data["adversary.name"] = adversaryName;
      }

      const judgmentNumber =
        caseItem?.judgmentNumber ||
        caseItem?.judgment_number ||
        caseItem?.judgment?.number ||
        null;
      if (judgmentNumber) {
        data["judgment.number"] = judgmentNumber;
      }

      const judgmentDate =
        caseItem?.judgmentDate ||
        caseItem?.judgment_date ||
        caseItem?.judgment?.date ||
        null;
      if (judgmentDate) {
        data["judgment.date"] = judgmentDate;
      }
    }

    const judgmentNumber =
      entityData?.judgmentNumber ||
      entityData?.judgment_number ||
      entityData?.judgment?.number ||
      null;
    if (judgmentNumber) {
      data["judgment.number"] = judgmentNumber;
    }
    const judgmentDate =
      entityData?.judgmentDate ||
      entityData?.judgment_date ||
      entityData?.judgment?.date ||
      null;
    if (judgmentDate) {
      data["judgment.date"] = judgmentDate;
    }

    const sessionDate =
      entityData?.sessionDate ||
      entityData?.session_date ||
      entityData?.session?.date ||
      entityData?.date ||
      entityData?.scheduledAt?.split?.("T")?.[0] ||
      entityData?.scheduled_at?.split?.("T")?.[0] ||
      entityData?.hearingDate ||
      entityData?.hearing_date ||
      null;
    if (sessionDate) {
      data["session.date"] = sessionDate;
    } else if (entityType === "dossier") {
      const sessions = Array.isArray(contextData?.sessions)
        ? contextData.sessions
        : [];
      const dossierSessions = sessions.filter(
        (session) => String(session?.dossierId) === String(entityData?.id),
      );
      if (dossierSessions.length > 0 && dossierSessions[0]?.date) {
        data["session.date"] = dossierSessions[0].date;
      }
    }

    if (entityType === "proces" && this.isMissingValue(data["session.date"])) {
      const sessions = Array.isArray(contextData?.sessions)
        ? contextData.sessions
        : [];
      const caseSessions = sessions.filter(
        (session) => String(session?.lawsuitId) === String(entityData?.id),
      );
      if (caseSessions.length > 0 && caseSessions[0]?.date) {
        data["session.date"] = caseSessions[0].date;
      }
    }

    return data;
  }

  /**
   * Load a DOCX template file
   * @param {Object} template - Template metadata
   * @returns {Promise<Blob>} DOCX file blob
   */
  async loadTemplateFile(template) {
    if (!template?.file_path) {
      throw new Error("Template file missing");
    }

    if (template.template_type === "user") {
      return await this.storageProvider.retrieveFile(template.file_path);
    }

    const baseUrl = import.meta?.env?.BASE_URL || "/";
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const response = await fetch(`${normalizedBase}${template.file_path}`);
    if (!response.ok) {
      throw new Error("Template file missing");
    }
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      throw new Error("Template file missing");
    }
    return await response.blob();
  }

  /**
   * Generate document from template
   * @param {string} entityType - 'proces' or 'dossier'
   * @param {Object} entityData - Entity data
   * @param {string} templateId - Template identifier
   * @param {string} language - 'ar' or 'fr'
   * @param {Object} contextData - Full context
   * @returns {Promise<Object>} Generated document info
   */
  async generateDocument(
    entityType,
    entityData,
    templateId,
    language,
    contextData,
    options = {},
  ) {
    try {
      // Validate inputs
      if (!["proces", "dossier", "session"].includes(entityType)) {
        throw new Error(`Unsupported entity type: ${entityType}`);
      }
      if (!["ar", "fr"].includes(language)) {
        throw new Error(`Unsupported language: ${language}`);
      }

      const template = templateManager.getTemplateById(templateId);
      if (!template) {
        throw new Error("Template not found");
      }

      if (template.entity_type && template.entity_type !== entityType) {
        throw new Error("Template not available for this entity");
      }

      if (template.language && template.language !== language) {
        throw new Error("Template not available for this language");
      }

      const templateFile = await this.loadTemplateFile(template);
      const data = this.extractEntityData(
        entityType,
        entityData || {},
        contextData || {},
      );
      const variantData = this.buildVariantData(template, options.variantKey);
      const copyType = options.copyType || options.copy_type || null;
      const mergedData = {
        ...data,
        ...variantData,
        ...(copyType ? { "document.copy_type": copyType } : {}),
      };

      const templateBuffer = await templateFile.arrayBuffer();
      const signature = new Uint8Array(templateBuffer.slice(0, 2));
      if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
        throw new Error("DOCX template is corrupted");
      }
      const zip = new PizZip(templateBuffer);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: "{{", end: "}}" },
        nullGetter: (part) => {
          if (part?.tag) {
            return `{{${part.tag}}}`;
          }
          return MISSING_VALUE;
        },
      });

      doc.render(mergedData);

      const blob = doc.getZip().generate({
        type: "blob",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      const fileName = this.buildGeneratedFileName({
        templateName: template.name,
        entityType,
        entityData,
      });

      return {
        success: true,
        blob,
        fileName,
        metadata: {
          templateId,
          templateName: template.name,
          language,
          entityType,
          entityId: entityData?.id,
          generatedDate: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error("[TemplateService] Generation failed:", error);
      let message = error?.message || "Generation failed";
      if (
        message.toLowerCase().includes("corrupt") ||
        message.toLowerCase().includes("end of central directory")
      ) {
        message = "DOCX template is corrupted";
      }
      if (error?.properties?.errors) {
        message = "Placeholder parsing failed";
      }
      if (message === "Template file missing") {
        message = "Template file missing";
      }
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Download generated document
   * @param {Blob} blob - Document blob
   * @param {string} fileName - File name
   */
  downloadDocument(blob, fileName) {
    saveAs(blob, fileName);
  }

  /**
   * Convert blob to File for document service
   * @param {Blob} blob - Document blob
   * @param {string} fileName - File name
   * @returns {File} File object
   */
  blobToFile(blob, fileName) {
    return new File([blob], fileName, {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  }
}

// Export singleton
const templateService = new TemplateService();
export default templateService;




