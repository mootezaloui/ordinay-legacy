/**
 * Rule result structure
 * Returns i18n keys + params instead of translated strings
 */
export class RuleResult {
  constructor(shouldNotify = false, config = {}) {
    this.shouldNotify = shouldNotify;
    this.priority = config.priority || "medium";
    this.frequency = config.frequency || "once"; // once, daily, urgent
    this.subType = config.subType || "reminder";
    this.metadata = config.metadata || {};

    // i18n keys and params instead of hardcoded strings
    this.titleKey = config.titleKey || "";
    this.titleParams = config.titleParams || {};
    this.messageKey = config.messageKey || "";
    this.messageParams = config.messageParams || {};

    // DEPRECATED: Keep for backward compatibility during migration
    this.title = config.title || "";
    this.message = config.message || "";
  }
}
