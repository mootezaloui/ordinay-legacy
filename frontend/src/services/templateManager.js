/**
 * Template Manager - User-Custom Templates
 *
 * Phase 2: Allow users to create and manage their own document templates
 *
 * Rules:
 * - System templates: Read-only, provided by Organia
 * - User templates: Editable, deletable, created by user
 * - No AI, no rich editing, no automation
 * - Templates are pure document generators
 */

const STORAGE_KEY = "organia_user_templates";

/**
 * Template model
 * @typedef {Object} DocumentTemplate
 * @property {string} id - Unique identifier
 * @property {string} name - Template name
 * @property {string} entity_type - "dossier" | "proces"
 * @property {string} language - "ar" | "fr"
 * @property {string} template_type - "system" | "user"
 * @property {string} file_path - Path/reference to DOCX file
 * @property {string} content - Template content (for user templates)
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
    id: "sys_dossier_jugement_ar",
    name: "مطلب استخراج حكم",
    entity_type: "dossier",
    language: "ar",
    template_type: "system",
    file_path: "system/dossier/jugement_request_ar.docx",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "sys_dossier_jugement_fr",
    name: "Demande d'extraction de jugement",
    entity_type: "dossier",
    language: "fr",
    template_type: "system",
    file_path: "system/dossier/jugement_request_fr.docx",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

class TemplateManager {
  constructor() {
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
   * @param {string} data.content - DOCX content (text for now)
   * @returns {DocumentTemplate}
   */
  createUserTemplate(data) {
    // Validate required fields
    if (!data.name || !data.entity_type || !data.language || !data.content) {
      throw new Error("Missing required fields");
    }

    // Validate entity type
    if (!["dossier", "proces"].includes(data.entity_type)) {
      throw new Error("Invalid entity type");
    }

    // Validate language
    if (!["ar", "fr"].includes(data.language)) {
      throw new Error("Invalid language");
    }

    const template = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: data.name,
      entity_type: data.entity_type,
      language: data.language,
      template_type: "user",
      file_path: `user/${data.entity_type}/${Date.now()}_${data.name.replace(/[^a-zA-Z0-9]/g, "_")}.docx`,
      content: data.content,
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
  updateUserTemplate(templateId, updates) {
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
    if (updates.content) template.content = updates.content;
    if (
      updates.entity_type &&
      ["dossier", "proces"].includes(updates.entity_type)
    ) {
      template.entity_type = updates.entity_type;
    }
    if (updates.language && ["ar", "fr"].includes(updates.language)) {
      template.language = updates.language;
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
  deleteUserTemplate(templateId) {
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
      return template.content;
    }

    // For system templates, return null (handled by templateService)
    return null;
  }

  /**
   * Validate template content for placeholders
   * @param {string} content - Template content
   * @returns {Object} Validation result
   */
  validateTemplateContent(content) {
    // List of valid placeholders
    const validPlaceholders = [
      "client.name",
      "dossier.reference",
      "proces.reference",
      "court.name",
      "today.date",
      "operator.name",
    ];

    // Find all placeholders in content
    const placeholderRegex = /\{\{([^}]+)\}\}/g;
    const found = [];
    let match;

    while ((match = placeholderRegex.exec(content)) !== null) {
      found.push(match[1].trim());
    }

    // Check for unknown placeholders
    const unknown = found.filter((p) => !validPlaceholders.includes(p));

    return {
      valid: unknown.length === 0,
      found,
      unknown,
      message:
        unknown.length > 0
          ? `Unknown placeholders: ${unknown.join(", ")}. These will not be replaced.`
          : "All placeholders are valid",
    };
  }
}

// Export singleton
const templateManager = new TemplateManager();
export default templateManager;
