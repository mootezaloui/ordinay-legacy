"use strict";

const { DATA_DOMAINS } = require("../tools/tool.firewall");
const documentsService = require("../../services/documents.service");

function _loadDocumentMetadata(entityType, entityId, context, options = {}) {
  if (!entityType || !entityId) {
    return { permitted: true, documents: [] };
  }

  const access = this._checkDomainAccess(DATA_DOMAINS.DOCUMENTS, context);
  if (!access.permitted) {
    return { permitted: false, documents: [], message: access.message };
  }

  try {
    const documents = documentsService.listMetadataByEntity(
      entityType,
      entityId,
      options,
    );
    return { permitted: true, documents };
  } catch (error) {
    this.ledger.record({
      type: "data_fetch_error",
      tool: "documents.metadata",
      error: error.message,
    });
    return { permitted: true, documents: [], error: error.message };
  }
}


function _loadDocumentTexts(documentIds, context) {
  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    return { permitted: true, documents: [] };
  }

  const access = this._checkDomainAccess(DATA_DOMAINS.DOCUMENTS, context);
  if (!access.permitted) {
    return { permitted: false, documents: [], message: access.message };
  }

  try {
    const documents = documentsService.listTextsByIds(documentIds);
    return { permitted: true, documents };
  } catch (error) {
    this.ledger.record({
      type: "data_fetch_error",
      tool: "documents.text",
      error: error.message,
    });
    return { permitted: true, documents: [], error: error.message };
  }
}

/**
 * Generate a domain access denied response
 *
 * @param {string} domain - Domain that was denied
 * @param {string} message - Denial message
 * @param {Object} policy - Current policy
 * @returns {Object} Formatted response
 * @private
 */

module.exports = {
  _loadDocumentMetadata,
  _loadDocumentTexts,
};
