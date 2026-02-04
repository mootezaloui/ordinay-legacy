"use strict";

function _checkDomainAccess(domain, context) {
  // If no dataAccess in context, allow all (backward compatibility)
  if (!context || !context.dataAccess) {
    return { permitted: true };
  }

  const domainEnabled = context.dataAccess[domain];

  // If domain is explicitly disabled, block
  if (domainEnabled === false) {
    this.ledger.record({
      type: "domain_access_denied",
      domain,
      dataAccess: context.dataAccess,
      timestamp: new Date().toISOString(),
    });

    return {
      permitted: false,
      message: `Access to ${domain} data is disabled. Enable ${domain} access in the Context panel to use this feature.`,
    };
  }

  return { permitted: true };
}


function _generateDomainDeniedResponse(domain, message, policy) {
  return {
    intent: "ACCESS_DENIED",
    agentVersion: policy.version,
    reasoner: "domain-firewall",
    output: {
      type: "explanation",
      entityId: "domain_access_denied",
      entityType: "security",
      summary: message,
      details: [
        `The ${domain} domain is currently disabled in your data access settings.`,
        "",
        "To access this data:",
        "1. Open the Context panel (right sidebar)",
        `2. Enable access to "${domain}"`,
        "3. Try your request again",
      ],
      timestamp: new Date().toISOString(),
      confidence: 1,
      sources: [
        {
          sourceType: "system",
          reference: "domain_firewall",
          note: "Data access permission check",
        },
      ],
      status: "blocked",
      source: "domain-firewall",
      requires_validation: false,
    },
    isAccessDenied: true,
  };
}

/**
 * Process UI request (with contract validation)
 *
 * This is the PRIMARY entry point for UI requests.
 * All UI requests MUST go through this method.
 *
 * @param {Object} uiRequest - Raw UI request
 * @returns {Promise<Object>} Validated agent response
 * @throws {Error} If request validation fails
 */

module.exports = {
  _checkDomainAccess,
  _generateDomainDeniedResponse,
};
