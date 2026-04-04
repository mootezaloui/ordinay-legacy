import { t } from "../i18n";

const LEGACY_TEMPLATE_ALIASES = {
  "content.dossier.review": "content.dossier.generalReview",
};

const applyLegacyAlias = (key = "") => {
  if (!key) return key;
  for (const [legacy, canonical] of Object.entries(LEGACY_TEMPLATE_ALIASES)) {
    if (key === legacy) return canonical;
    if (key.startsWith(`${legacy}.`)) {
      return `${canonical}${key.slice(legacy.length)}`;
    }
  }
  return key;
};

const normalizeKey = (key = "") => {
  const stripped = key.startsWith("notifications:")
    ? key.replace("notifications:", "")
    : key;
  return applyLegacyAlias(stripped);
};

const getBaseKey = (titleKey, messageKey) => {
  const key = titleKey || messageKey || "";
  const lastDotIndex = key.lastIndexOf(".");
  return lastDotIndex === -1 ? key : key.slice(0, lastDotIndex);
};

const getKeyTail = (fullKey, baseKey) => {
  if (!fullKey) return "";
  const prefix = `${baseKey}.`;
  return fullKey.startsWith(prefix) ? fullKey.slice(prefix.length) : "";
};

const hashSeed = (seed = "") => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0; // force 32-bit
  }
  return Math.abs(hash);
};

const getDateSeed = (timestamp) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toISOString().split("T")[0];
};

const getVariants = (baseKey) => {
  if (!baseKey) return [];
  const inlineVariants = t(`notifications:${baseKey}.variants`, {
    returnObjects: true,
    defaultValue: [],
  });
  if (Array.isArray(inlineVariants) && inlineVariants.length > 0) {
    return inlineVariants;
  }

  const sharedVariants = t(`notifications:contentVariants.${baseKey}`, {
    returnObjects: true,
    defaultValue: [],
  });
  return Array.isArray(sharedVariants) ? sharedVariants : [];
};

const interpolate = (template, params = {}) => {
  if (typeof template !== "string") return "";
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    params[key] !== undefined ? params[key] : ""
  );
};

const getPluralKey = (tail, params = {}) => {
  const count = params.count;
  if (count === 1 || count === "1") return `${tail}_one`;
  if (count !== undefined && count !== null) return `${tail}_other`;
  return tail;
};

const resolveVariantValue = (variant, tail, params = {}) => {
  if (!variant || typeof variant !== "object") return "";

  const pluralKey = getPluralKey(tail, params);
  if (variant[pluralKey]) return interpolate(variant[pluralKey], params);
  if (variant[tail]) return interpolate(variant[tail], params);

  // If plural fields exist but count missing, prefer _other as a fallback
  const otherKey = `${tail}_other`;
  if (variant[otherKey]) return interpolate(variant[otherKey], params);

  return "";
};

const translatePart = (
  fullKey,
  baseKey,
  variantIndex,
  params = {},
  fallbackParams = {},
  variants = []
) => {
  if (!fullKey) return "";

  const mergedParams =
    params.count == null && fallbackParams.count != null
      ? { ...params, count: fallbackParams.count }
      : params;

  if (
    Array.isArray(variants) &&
    variants.length > 0 &&
    variantIndex !== null &&
    variantIndex !== undefined
  ) {
    const variant = variants[variantIndex];
    const tail = getKeyTail(fullKey, baseKey);
    const variantValue = resolveVariantValue(variant, tail, mergedParams);
    if (variantValue) {
      return variantValue;
    }
  }

  // Try direct translation with pluralization support
  const translationPath = `notifications:${fullKey}`;
  const translatedValue = t(translationPath, { ...mergedParams, defaultValue: "" });
  
  if (
    translatedValue &&
    translatedValue !== translationPath &&
    translatedValue !== fullKey
  ) {
    return translatedValue;
  }

  // If no translation found, return empty string (don't return the key itself)
  return "";
};

export const buildVariantSeed = (seedParts = [], timestamp) => {
  const baseSeed = (Array.isArray(seedParts) ? seedParts : [seedParts])
    .filter(Boolean)
    .join("|");
  return `${baseSeed}|${getDateSeed(timestamp)}`;
};

export const translateNotificationCopy = ({
  titleKey,
  messageKey,
  titleParams = {},
  messageParams = {},
  seedParts = [],
  timestamp,
}) => {
  const normalizedTitleKey = normalizeKey(titleKey);
  const normalizedMessageKey = normalizeKey(messageKey);
  const baseKey = getBaseKey(normalizedTitleKey, normalizedMessageKey);
  const variants = getVariants(baseKey);
  const rawVariantIndex = titleParams.variantIndex ?? messageParams.variantIndex;
  const parsedVariantIndex = Number.isFinite(Number(rawVariantIndex))
    ? Math.max(0, Math.floor(Number(rawVariantIndex)))
    : null;
  const forcedVariantIndex =
    parsedVariantIndex !== null && variants.length > 0
      ? parsedVariantIndex % variants.length
      : null;
  const variantIndex =
    forcedVariantIndex !== null
      ? forcedVariantIndex
      : variants.length > 0
        ? hashSeed(buildVariantSeed(seedParts, timestamp)) % variants.length
        : null;

  return {
    title: translatePart(
      normalizedTitleKey,
      baseKey,
      variantIndex,
      titleParams,
      messageParams,
      variants
    ),
    message: translatePart(
      normalizedMessageKey,
      baseKey,
      variantIndex,
      messageParams,
      titleParams,
      variants
    ),
    variantIndex,
  };
};
