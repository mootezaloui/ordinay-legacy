/**
 * Template Service - Document Generation from Templates
 *
 * MVP ONLY - Simple placeholder replacement
 * NO AI, NO editor, NO automation
 *
 * Supports:
 * - Procès and Dossier entities only
 * - Single document type: Request for judgment copy
 * - Arabic and French languages
 */

import { Packer, Document, Paragraph, TextRun } from "docx";
import { saveAs } from "file-saver";

/**
 * Available document templates
 */
const TEMPLATES = {
  proces: {
    jugement_request: {
      ar: {
        name: "مطلب استخراج حكم",
        fileName: "jugement_request_ar.docx",
        language: "ar",
      },
      fr: {
        name: "Demande d'extraction de jugement",
        fileName: "jugement_request_fr.docx",
        language: "fr",
      },
    },
  },
  dossier: {
    jugement_request: {
      ar: {
        name: "مطلب استخراج حكم",
        fileName: "jugement_request_ar.docx",
        language: "ar",
      },
      fr: {
        name: "Demande d'extraction de jugement",
        fileName: "jugement_request_fr.docx",
        language: "fr",
      },
    },
  },
};

/**
 * Template content - stored inline for MVP
 * In production, these would be loaded from .docx files
 */
const TEMPLATE_CONTENT = {
  proces: {
    jugement_request: {
      ar: `
بسم الله الرحمن الرحيم

المحكمة: {{court.name}}

مطلب استخراج نسخة حكم

المطلوب: {{client.name}}

المرجع: {{proces.reference}}
رقم الملف: {{dossier.reference}}

التاريخ: {{today.date}}

الموضوع: طلب استخراج نسخة من الحكم

السيد رئيس المحكمة المحترم،

بناءً على الحكم الصادر في القضية المشار إليها أعلاه، أطلب استخراج نسخة رسمية من الحكم.

معلومات الملف:

وتفضلوا بقبول فائق الاحترام والتقدير.

التوقيع: {{operator.name}}
`,
      fr: `
République Tunisienne

Tribunal: {{court.name}}

DEMANDE D'EXTRACTION DE JUGEMENT

Demandeur: {{client.name}}

Référence Procès: {{proces.reference}}
Référence Dossier: {{dossier.reference}}

Date: {{today.date}}

Objet: Demande d'extraction de copie de jugement

Monsieur le Président du Tribunal,

Suite au jugement rendu dans l'affaire référencée ci-dessus, je sollicite l'extraction d'une copie officielle du jugement.

Informations du dossier:

Veuillez agréer, Monsieur le Président, l'expression de ma haute considération.

Signature: {{operator.name}}
`,
    },
  },
  dossier: {
    jugement_request: {
      ar: `
بسم الله الرحمن الرحيم

مطلب استخراج وثائق

المطلوب: {{client.name}}

رقم الملف: {{dossier.reference}}

التاريخ: {{today.date}}

الموضوع: طلب استخراج وثائق رسمية

السيد المحترم،

أطلب استخراج الوثائق الرسمية المتعلقة بالملف المذكور أعلاه.

معلومات الملف:

وتفضلوا بقبول فائق الاحترام والتقدير.

التوقيع: {{operator.name}}
`,
      fr: `
République Tunisienne

DEMANDE D'EXTRACTION DE DOCUMENTS

Demandeur: {{client.name}}

Référence Dossier: {{dossier.reference}}

Date: {{today.date}}

Objet: Demande d'extraction de documents officiels

Monsieur,

Je sollicite l'extraction des documents officiels relatifs au dossier référencé ci-dessus.

Informations du dossier:

Veuillez agréer, Monsieur, l'expression de ma haute considération.

Signature: {{operator.name}}
`,
    },
  },
};

class TemplateService {
  /**
   * Get available templates for entity type
   * @param {string} entityType - 'proces' or 'dossier'
   * @returns {Array} Available templates
   */
  getAvailableTemplates(entityType) {
    if (!["proces", "dossier"].includes(entityType)) {
      throw new Error(`Unsupported entity type: ${entityType}`);
    }

    const templates = TEMPLATES[entityType];
    return Object.keys(templates).map((key) => ({
      id: key,
      name_ar: templates[key].ar.name,
      name_fr: templates[key].fr.name,
    }));
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
      "client.name": "__________",
      "dossier.reference": "__________",
      "proces.reference": "__________",
      "court.name": "__________",
      "today.date": new Date().toLocaleDateString("fr-FR"),
      "operator.name": "__________",
    };
    // Map operator name (robust)
    if (contextData?.operator && contextData.operator.name) {
      data["operator.name"] = contextData.operator.name;
    } else if (
      Array.isArray(contextData?.operators) &&
      contextData.operators.length > 0 &&
      contextData.operators[0]?.name
    ) {
      data["operator.name"] = contextData.operators[0].name;
    } else {
      data["operator.name"] = "__________";
    }
    // Operator mapping confirmed. Alert removed.

    // Map client name
    if (entityData.client?.name) {
      data["client.name"] = entityData.client.name;
    } else if (entityData.clientId && contextData?.clients) {
      // Find client by id (number or string)
      const client = contextData.clients.find(
        (c) => String(c.id) === String(entityData.clientId),
      );
      if (client) data["client.name"] = client.name;
    } else if (
      entityType === "proces" &&
      entityData.dossierId &&
      contextData?.dossiers &&
      contextData?.clients
    ) {
      // Fallback: find dossier, then its clientId
      const dossier = contextData.dossiers.find(
        (d) => String(d.id) === String(entityData.dossierId),
      );
      if (dossier && dossier.clientId) {
        const client = contextData.clients.find(
          (c) => String(c.id) === String(dossier.clientId),
        );
        if (client) data["client.name"] = client.name;
      }
    }

    if (entityType === "proces") {
      // Procès-specific data
      data["proces.reference"] = entityData.caseNumber || "__________";
      data["court.name"] = entityData.court || "__________";

      // Get parent dossier reference
      if (entityData.dossier?.caseNumber) {
        data["dossier.reference"] = entityData.dossier.caseNumber;
      } else if (entityData.dossierId && contextData?.dossiers) {
        const dossier = contextData.dossiers.find(
          (d) => d.id === entityData.dossierId,
        );
        if (dossier)
          data["dossier.reference"] = dossier.caseNumber || "__________";
      }
    } else if (entityType === "dossier") {
      // Dossier-specific data
      data["dossier.reference"] = entityData.caseNumber || "__________";
      // For dossier, proces and court may not apply
      data["proces.reference"] = "N/A";
      data["court.name"] = "N/A";
    }

    return data;
  }

  /**
   * Replace placeholders in template content
   * @param {string} template - Template text
   * @param {Object} data - Replacement data
   * @returns {string} Processed text
   */
  replacePlaceholders(template, data) {
    let result = template;

    Object.keys(data).forEach((key) => {
      const placeholder = `{{${key}}}`;
      const value = data[key] || "__________";
      result = result.split(placeholder).join(value);
    });

    return result;
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
  ) {
    try {
      // Validate inputs
      if (!["proces", "dossier"].includes(entityType)) {
        throw new Error(`Unsupported entity type: ${entityType}`);
      }
      if (!["ar", "fr"].includes(language)) {
        throw new Error(`Unsupported language: ${language}`);
      }

      const template = TEMPLATES[entityType]?.[templateId]?.[language];
      if (!template) {
        throw new Error(
          `Template not found: ${entityType}/${templateId}/${language}`,
        );
      }

      // Extract entity data
      console.log(
        "[DEBUG] templateService.generateDocument contextData:",
        contextData,
      );
      const data = this.extractEntityData(entityType, entityData, contextData);
      console.log(
        "[DEBUG] templateService.generateDocument mapped data:",
        data,
      );

      // Get template content
      const templateContent =
        TEMPLATE_CONTENT[entityType]?.[templateId]?.[language];
      if (!templateContent) {
        throw new Error(`Template content not found`);
      }

      // Replace placeholders
      const processedContent = this.replacePlaceholders(templateContent, data);

      // Generate DOCX
      const doc = new Document({
        sections: [
          {
            properties: {},
            children: processedContent.split("\n").map(
              (line) =>
                new Paragraph({
                  children: [new TextRun(line)],
                  spacing: { after: 200 },
                }),
            ),
          },
        ],
      });

      // Create blob
      const blob = await Packer.toBlob(doc);

      // Generate filename
      const timestamp = new Date().toISOString().split("T")[0];
      const fileName = `${template.name.replace(/[^a-zA-Z0-9]/g, "_")}_${timestamp}.docx`;

      return {
        success: true,
        blob,
        fileName,
        metadata: {
          templateId,
          templateName: template.name,
          language,
          entityType,
          entityId: entityData.id,
          generatedDate: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error("[TemplateService] Generation failed:", error);
      return {
        success: false,
        error: error.message,
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

// Attach TEMPLATE_CONTENT to the class for external access
TemplateService.TEMPLATE_CONTENT = TEMPLATE_CONTENT;
// Export singleton
const templateService = new TemplateService();
export default templateService;
