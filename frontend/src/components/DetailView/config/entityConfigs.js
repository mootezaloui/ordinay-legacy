import { createClientConfig } from "./clientConfig.jsx";
import { createDossierConfig } from "./dossierConfig.jsx";
import { createTaskConfig } from "./taskConfig.jsx";
import { createSessionConfig } from "./sessionConfig.jsx";
import { createLawsuitConfig } from "./lawsuitConfig.jsx";
import { createOfficerConfig } from "./officerConfig.jsx";
import { createPersonalTaskConfig } from "./personalTaskConfig.jsx";
import { createFinancialEntryConfig } from "./financialEntryConfig.jsx";
import { createMissionConfig } from "./missionConfig.jsx";
import { useTranslation } from "react-i18next";

/**
 * Central registry for all entity configurations
 * Add new entity configs here as you create them
 * Note: Some configs are factory functions that accept a translation function
 */
const entityConfigFactories = {
  client: createClientConfig,
  dossier: createDossierConfig,
  task: createTaskConfig,
  session: createSessionConfig,
  lawsuit: createLawsuitConfig,
  officer: createOfficerConfig,
  personalTask: createPersonalTaskConfig,
  financialEntry: createFinancialEntryConfig,
  mission: createMissionConfig,
};

/**
 * Get configuration for a specific entity type
 * @param {string} entityType - Type of entity (client, dossier, etc.)
 * @param {function} t - Translation function (optional, required for internationalized configs)
 * @returns {object} Entity configuration object
 */
export function getEntityConfig(entityType, t = null, helpers = null) {
  const configOrFactory = entityConfigFactories[entityType];

  if (!configOrFactory) {
    throw new Error(`No configuration found for entity type: ${entityType}`);
  }

  // If it's a factory function (like createClientConfig), call it with t
  if (typeof configOrFactory === 'function') {
    if (!t) {
      // If no translation function provided, create a fallback that returns the key
      t = (key) => key;
    }
    return configOrFactory(t, helpers);
  }

  // Otherwise, return the config directly (legacy configs)
  return configOrFactory;
}

/**
 * Check if an entity type is registered
 * @param {string} entityType - Type of entity
 * @returns {boolean}
 */
export function hasEntityConfig(entityType) {
  return entityType in entityConfigFactories;
}

/**
 * Get all registered entity types
 * @returns {string[]} Array of entity type names
 */
export function getAllEntityTypes() {
  return Object.keys(entityConfigFactories);
}
