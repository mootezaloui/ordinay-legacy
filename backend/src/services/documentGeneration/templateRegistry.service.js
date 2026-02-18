"use strict";

const fs = require("fs");
const path = require("path");

const TEMPLATE_DIR = path.resolve(__dirname, "templates");
const cache = new Map();

function getTemplateKey({ documentType, language, schemaVersion }) {
  return `${documentType}.${language}.${schemaVersion}`;
}

function getTemplatePath({ documentType, language, schemaVersion }) {
  return path.join(TEMPLATE_DIR, `${documentType}.${language}.${schemaVersion}.hbs`);
}

function getTemplate({ documentType, language, schemaVersion }) {
  const key = getTemplateKey({ documentType, language, schemaVersion });
  if (cache.has(key)) return { key, source: cache.get(key) };

  const file = getTemplatePath({ documentType, language, schemaVersion });
  if (!fs.existsSync(file)) {
    return { key, source: null };
  }

  const source = fs.readFileSync(file, "utf8");
  cache.set(key, source);
  return { key, source };
}

function deepGet(obj, dottedPath) {
  return String(dottedPath || "")
    .split(".")
    .filter(Boolean)
    .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function renderEach(template, data) {
  return template.replace(/\{\{#each\s+([^\}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, pathExpr, block) => {
    const list = deepGet(data, String(pathExpr).trim());
    if (!Array.isArray(list)) return "";
    return list
      .map((item) =>
        block
          .replace(/\{\{this\}\}/g, item == null ? "" : String(item))
          .replace(/\{\{\s*([^\}]+)\s*\}\}/g, (m, token) => {
            const tokenPath = String(token).trim();
            if (tokenPath === "this") return item == null ? "" : String(item);
            const value = deepGet(data, tokenPath);
            return value == null ? "" : String(value);
          }),
      )
      .join("");
  });
}

function renderVariables(template, data) {
  return template.replace(/\{\{\s*([^\}]+)\s*\}\}/g, (_, token) => {
    const value = deepGet(data, String(token).trim());
    return value == null ? "" : String(value);
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function flattenTextLines(value, out = []) {
  if (value == null) return out;
  if (Array.isArray(value)) {
    value.forEach((item) => flattenTextLines(item, out));
    return out;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((item) => flattenTextLines(item, out));
    return out;
  }
  const text = String(value).trim();
  if (text) out.push(text);
  return out;
}

function buildFallbackHtml({ language, viewModel }) {
  const dir = language === "ar" ? "rtl" : "ltr";
  const lang = language === "ar" ? "ar" : "en";
  const content = (viewModel && viewModel.content) || {};
  const title = content.title || viewModel?.documentType || "Generated Document";

  const bodyCandidate =
    content?.request?.body ||
    content?.body ||
    content?.summary ||
    content?.analysis ||
    content?.conclusion ||
    null;

  const bodyLines = bodyCandidate
    ? String(bodyCandidate)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    : flattenTextLines(content).filter((line) => line !== String(title).trim());

  const paragraphs = bodyLines
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

  return [
    `<!doctype html>`,
    `<html lang="${lang}" dir="${dir}">`,
    `<head><meta charset="utf-8"><style>body{font-family:"Tahoma","Arial",sans-serif;line-height:1.7;padding:24px}h1{font-size:22px;margin:0 0 14px}p{margin:0 0 10px}</style></head>`,
    `<body><h1>${escapeHtml(title)}</h1>${paragraphs || "<p></p>"}</body></html>`,
    `</html>`,
  ].join("");
}

function renderTemplateToHtml({ documentType, language, schemaVersion, viewModel }) {
  const { key, source } = getTemplate({ documentType, language, schemaVersion });
  if (!source) {
    return {
      templateKey: `${key}:fallback`,
      html: buildFallbackHtml({ language, viewModel }),
    };
  }
  const withEach = renderEach(source, viewModel);
  const html = renderVariables(withEach, viewModel);
  return { templateKey: key, html };
}

module.exports = {
  getTemplate,
  getTemplateKey,
  renderTemplateToHtml,
};
