import { clientConfig } from "./clientConfig.jsx";
import { dossierConfig } from "./dossierConfig.jsx";
import { taskConfig } from "./taskConfig.jsx";
import { sessionConfig } from "./sessionConfig.jsx";
import { caseConfig } from "./caseConfig.jsx";
import { officerConfig } from "./officerConfig.jsx";
import { personalTaskConfig } from "./personalTaskConfig.jsx";

/**
 * Central registry for all entity configurations
 * Add new entity configs here as you create them
 */
const entityConfigs = {
  client: clientConfig,
  dossier: dossierConfig,
  task: taskConfig,
  session: sessionConfig,
  case: caseConfig,
  officer: officerConfig,
  personalTask: personalTaskConfig,
};

/**
 * Get configuration for a specific entity type
 * @param {string} entityType - Type of entity (client, dossier, etc.)
 * @returns {object} Entity configuration object
 */
export function getEntityConfig(entityType) {
  const config = entityConfigs[entityType];

  if (!config) {
    throw new Error(`No configuration found for entity type: ${entityType}`);
  }

  return config;
}

/**
 * Check if an entity type is registered
 * @param {string} entityType - Type of entity
 * @returns {boolean}
 */
export function hasEntityConfig(entityType) {
  return entityType in entityConfigs;
}

/**
 * Get all registered entity types
 * @returns {string[]} Array of entity type names
 */
export function getAllEntityTypes() {
  return Object.keys(entityConfigs);
}
