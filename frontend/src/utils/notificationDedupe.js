// Stable JSON stringify that matches backend computeDedupeKey
function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `"${key}":${stableStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizePayload(value) {
  if (value === null || value === undefined) return {};
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (err) {
      /* ignore parse error and fall back */
    }
  }
  return { value };
}

/**
 * Build the stable dedupe key used by the backend and dismissal table.
 * Mirrors backend: type|sub_type|template_key|entity_type|entity_id|payload
 */
export function buildDedupeKey(notification = {}) {
  if (notification.dedupe_key || notification.dedupeKey) {
    return notification.dedupe_key || notification.dedupeKey;
  }

  const payload =
    notification.payload !== undefined
      ? notification.payload
      : notification.params || {};
  return [
    notification.type || "",
    notification.subType || notification.sub_type || "",
    notification.template_key || notification.templateKey || "",
    notification.entityType || notification.entity_type || "",
    notification.entityId ?? notification.entity_id ?? "",
    stableStringify(normalizePayload(payload)),
  ].join("|");
}

export function normalizeParamsForDedupe(notification = {}) {
  return normalizePayload(
    notification.payload !== undefined
      ? notification.payload
      : notification.params || {}
  );
}
