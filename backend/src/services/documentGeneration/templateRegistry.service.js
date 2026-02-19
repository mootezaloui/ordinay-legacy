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
    const err = new Error(`Template not found: ${key}`);
    err.code = "TEMPLATE_NOT_FOUND";
    throw err;
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

function renderTemplateToHtml({ documentType, language, schemaVersion, viewModel }) {
  const { key, source } = getTemplate({ documentType, language, schemaVersion });
  const withEach = renderEach(source, viewModel);
  const html = renderVariables(withEach, viewModel);
  return { templateKey: key, html };
}

module.exports = {
  getTemplate,
  getTemplateKey,
  renderTemplateToHtml,
};
