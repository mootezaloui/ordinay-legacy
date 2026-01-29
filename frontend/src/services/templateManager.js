/**
 * Template Manager - User-Custom Templates
 *
 * Phase 2: Allow users to create and manage their own document templates
 *
 * Rules:
 * - System templates: Read-only, provided by Ordinay
 * - User templates: Editable, deletable, created by user
 * - No AI, no rich editing, no automation
 * - Templates are pure document generators
 */

import { LocalStorageProvider } from "./storage/LocalStorageProvider.js";

const STORAGE_KEY = "ordinay_user_templates";
const TEMPLATE_DIRECTORY = "templates";
const TEMPLATE_EXTENSIONS = ["docx"];

/**
 * Template model
 * @typedef {Object} DocumentTemplate
 * @property {string} id - Unique identifier
 * @property {string} name - Template name
 * @property {string} entity_type - "dossier" | "proces"
 * @property {string} language - "ar" | "fr"
 * @property {string} template_type - "system" | "user"
 * @property {string} file_path - Path/reference to DOCX file
 * @property {string[]} required_fields - Optional list of required placeholders
 * @property {Array} variants - Optional list of template variants
 * @property {string} created_at - ISO date
 * @property {string} updated_at - ISO date
 */

/**
 * System templates (read-only, from Phase 1)
 */
const SYSTEM_TEMPLATES = [
  {
    id: "sys_proces_jugement_ar",
    name: "مطلب استخراج حكم",
    entity_type: "proces",
    language: "ar",
    template_type: "system",
    file_path: "system/proces/jugement_request_ar.docx",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "sys_proces_jugement_fr",
    name: "Demande d'extraction de jugement",
    entity_type: "proces",
    language: "fr",
    template_type: "system",
    file_path: "system/proces/jugement_request_fr.docx",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "sys_dossier_mise_ar",
    name: "إنذار رسمي",
    entity_type: "dossier",
    language: "ar",
    template_type: "system",
    file_path: "system/dossier/Mise_en_Demeure_ar.docx",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "sys_dossier_mise_fr",
    name: "Mise en demeure",
    entity_type: "dossier",
    language: "fr",
    template_type: "system",
    file_path: "system/dossier/Mise_en_Demeure_fr.docx",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "sys_session_renvoi_ar",
    name: "طلب تأجيل الجلسة",
    entity_type: "session",
    language: "ar",
    template_type: "system",
    file_path: "system/hearing/Demande_de_Renvoi_ar.docx",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "sys_session_renvoi_fr",
    name: "Demande de renvoi d'audience",
    entity_type: "session",
    language: "fr",
    template_type: "system",
    file_path: "system/hearing/Demande_de_Renvoi_fr.docx",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  // Removed dossier-level judgment extraction templates as per legal domain logic
];

class TemplateManager {
  constructor() {
    this.storageProvider = new LocalStorageProvider();
    this.userTemplates = this.loadUserTemplates();
  }

  /**
   * Load user templates from localStorage
   * @private
   */
  loadUserTemplates() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error("[TemplateManager] Failed to load user templates:", error);
      return [];
    }
  }

  /**
   * Save user templates to localStorage
   * @private
   */
  saveUserTemplates() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.userTemplates));
    } catch (error) {
      console.error("[TemplateManager] Failed to save user templates:", error);
      throw new Error("Failed to save templates");
    }
  }

  /**
   * Get all templates (system + user)
   * @param {string} entityType - Optional filter by entity type
   * @param {string} language - Optional filter by language
   * @returns {DocumentTemplate[]}
   */
  getAllTemplates(entityType = null, language = null) {
    let templates = [...SYSTEM_TEMPLATES, ...this.userTemplates];

    if (entityType) {
      templates = templates.filter((t) => t.entity_type === entityType);
    }

    if (language) {
      templates = templates.filter((t) => t.language === language);
    }

    return templates;
  }

  /**
   * Get system templates only
   * @returns {DocumentTemplate[]}
   */
  getSystemTemplates() {
    return SYSTEM_TEMPLATES;
  }

  /**
   * Get user templates only
   * @returns {DocumentTemplate[]}
   */
  getUserTemplates() {
    return this.userTemplates;
  }

  /**
   * Get template by ID
   * @param {string} templateId
   * @returns {DocumentTemplate|null}
   */
  getTemplateById(templateId) {
    // Check system templates first
    const systemTemplate = SYSTEM_TEMPLATES.find((t) => t.id === templateId);
    if (systemTemplate) return systemTemplate;

    // Check user templates
    const userTemplate = this.userTemplates.find((t) => t.id === templateId);
    return userTemplate || null;
  }

  /**
   * Create a new user template
   * @param {Object} data - Template data
   * @param {string} data.name - Template name
   * @param {string} data.entity_type - "dossier" | "proces"
   * @param {string} data.language - "ar" | "fr"
   * @param {File} data.file - DOCX template file
   * @returns {DocumentTemplate}
   */
  async createUserTemplate(data) {
    // Validate required fields
    if (!data.name || !data.entity_type || !data.language || !data.file) {
      throw new Error("Missing required fields");
    }

    // Validate entity type
    if (!["dossier", "proces", "session"].includes(data.entity_type)) {
      throw new Error("Invalid entity type");
    }

    // Validate language
    if (!["ar", "fr"].includes(data.language)) {
      throw new Error("Invalid language");
    }

    const extension = (data.file.name || "").split(".").pop()?.toLowerCase();
    if (!TEMPLATE_EXTENSIONS.includes(extension)) {
      throw new Error("Invalid template file type");
    }

    const storageResult = await this.storageProvider.storeFile(data.file, {
      directory: TEMPLATE_DIRECTORY,
    });

    if (!storageResult.success) {
      throw new Error(storageResult.error || "Failed to store template file");
    }

    const template = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: data.name,
      entity_type: data.entity_type,
      language: data.language,
      template_type: "user",
      file_path: storageResult.path,
      required_fields: Array.isArray(data.required_fields)
        ? data.required_fields
        : [],
      variants: Array.isArray(data.variants) ? data.variants : [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.userTemplates.push(template);
    this.saveUserTemplates();

    return template;
  }

  /**
   * Update a user template
   * @param {string} templateId - Template ID
   * @param {Object} updates - Fields to update
   * @returns {DocumentTemplate}
   */
  async updateUserTemplate(templateId, updates) {
    const template = this.userTemplates.find((t) => t.id === templateId);

    if (!template) {
      throw new Error("Template not found");
    }

    // Cannot update system templates
    if (template.template_type === "system") {
      throw new Error("Cannot update system templates");
    }

    // Update allowed fields
    if (updates.name) template.name = updates.name;
    if (
      updates.entity_type &&
      ["dossier", "proces", "session"].includes(updates.entity_type)
    ) {
      template.entity_type = updates.entity_type;
    }
    if (updates.language && ["ar", "fr"].includes(updates.language)) {
      template.language = updates.language;
    }
    if (updates.required_fields) {
      template.required_fields = Array.isArray(updates.required_fields)
        ? updates.required_fields
        : template.required_fields;
    }
    if (updates.variants) {
      template.variants = Array.isArray(updates.variants)
        ? updates.variants
        : template.variants;
    }

    if (updates.file) {
      const extension = (updates.file.name || "")
        .split(".")
        .pop()
        ?.toLowerCase();
      if (!TEMPLATE_EXTENSIONS.includes(extension)) {
        throw new Error("Invalid template file type");
      }

      const storageResult = await this.storageProvider.storeFile(updates.file, {
        directory: TEMPLATE_DIRECTORY,
      });

      if (!storageResult.success) {
        throw new Error(storageResult.error || "Failed to store template file");
      }

      const previousPath = template.file_path;
      template.file_path = storageResult.path;
      if (previousPath) {
        this.storageProvider.deleteFile(previousPath).catch((error) => {
          console.error(
            "[TemplateManager] Failed to delete old template file:",
            error,
          );
        });
      }
    }

    template.updated_at = new Date().toISOString();

    this.saveUserTemplates();

    return template;
  }

  /**
   * Delete a user template
   * @param {string} templateId - Template ID
   * @returns {boolean}
   */
  async deleteUserTemplate(templateId) {
    const index = this.userTemplates.findIndex((t) => t.id === templateId);

    if (index === -1) {
      throw new Error("Template not found");
    }

    const template = this.userTemplates[index];

    // Cannot delete system templates
    if (template.template_type === "system") {
      throw new Error("Cannot delete system templates");
    }

    this.userTemplates.splice(index, 1);
    this.saveUserTemplates();

    if (template.file_path) {
      try {
        await this.storageProvider.deleteFile(template.file_path);
      } catch (error) {
        console.error(
          "[TemplateManager] Failed to delete template file:",
          error,
        );
      }
    }

    return true;
  }

  /**
   * Check if template is system template
   * @param {string} templateId
   * @returns {boolean}
   */
  isSystemTemplate(templateId) {
    return SYSTEM_TEMPLATES.some((t) => t.id === templateId);
  }

  /**
   * Get template content
   * @param {string} templateId
   * @returns {string|null}
   */
  getTemplateContent(templateId) {
    const template = this.getTemplateById(templateId);
    if (!template) return null;

    // For user templates, return stored content
    if (template.template_type === "user") {
      return null;
    }

    // For system templates, return null (handled by templateService)
    return null;
  }

  /**
   * Validate template file selection
   * @param {File|null} file - Template file
   * @returns {Object} Validation result
   */
  validateTemplateFile(file) {
    if (!file) {
      return {
        valid: false,
        message: "Aucun fichier s‚lectionn‚",
      };
    }

    const extension = (file.name || "").split(".").pop()?.toLowerCase();
    if (!TEMPLATE_EXTENSIONS.includes(extension)) {
      return {
        valid: false,
        message: "Seuls les fichiers DOCX sont autoris‚s",
      };
    }

    return {
      valid: true,
      message: "Fichier DOCX valide",
    };
  }
}

// Export singleton
const templateManager = new TemplateManager();
export default templateManager;
