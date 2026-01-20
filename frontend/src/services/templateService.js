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
      "client.name": MISSING_VALUE,
      "dossier.reference": MISSING_VALUE,
      "proces.reference": MISSING_VALUE,
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
      "lawyer.bar_id": MISSING_VALUE,
      "lawyer.vpa": MISSING_VALUE,
      "lawyer.signature": MISSING_VALUE,
      "session.date": MISSING_VALUE,
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
    if (operator?.bar_id || operator?.barId || operator?.bar_number || operator?.barNumber) {
      data["lawyer.bar_id"] =
        operator.bar_id ||
        operator.barId ||
        operator.bar_number ||
        operator.barNumber;
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

    // Map client name
    if (entityData?.client?.name) {
      data["client.name"] = entityData.client.name;
    } else if (typeof entityData?.client === "string") {
      data["client.name"] = entityData.client;
    } else if (entityData?.clientId && contextData?.clients) {
      const client = contextData.clients.find(
        (c) => String(c.id) === String(entityData.clientId),
      );
      if (client?.name) data["client.name"] = client.name;
    } else if (
      entityType === "proces" &&
      entityData?.dossierId &&
      contextData?.dossiers &&
      contextData?.clients
    ) {
      const dossier = contextData.dossiers.find(
        (d) => String(d.id) === String(entityData.dossierId),
      );
      if (dossier?.clientId) {
        const client = contextData.clients.find(
          (c) => String(c.id) === String(dossier.clientId),
        );
        if (client?.name) data["client.name"] = client.name;
      }
    }

    if (entityType === "proces") {
      data["proces.reference"] = entityData?.caseNumber || MISSING_VALUE;
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

      if (entityData?.dossier?.caseNumber) {
        data["dossier.reference"] = entityData.dossier.caseNumber;
      } else if (entityData?.dossierId && contextData?.dossiers) {
        const dossier = contextData.dossiers.find(
          (d) => String(d.id) === String(entityData.dossierId),
        );
        if (dossier?.caseNumber) {
          data["dossier.reference"] = dossier.caseNumber;
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
      data["dossier.reference"] = entityData?.caseNumber || MISSING_VALUE;
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
        (session) => String(session?.caseId) === String(entityData?.id),
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
      if (!["proces", "dossier"].includes(entityType)) {
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

      const timestamp = new Date().toISOString().split("T")[0];
      const safeName = (template.name || "document").replace(
        /[^a-zA-Z0-9]/g,
        "_",
      );
      const fileName = `${safeName}_${timestamp}.docx`;

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
