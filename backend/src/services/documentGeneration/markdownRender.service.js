"use strict";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineFormat(text) {
  return String(text || "")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function renderMarkdownToHtml(markdown, { language = "en", dir } = {}) {
  const safeDir = dir || (language === "ar" ? "rtl" : "ltr");
  const lines = String(markdown || "").split(/\r?\n/);
  const out = [];
  let inList = false;

  const flushList = () => {
    if (!inList) return;
    out.push("</ul>");
    inList = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }

    const escaped = inlineFormat(escapeHtml(line));
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      out.push(`<h${level}>${inlineFormat(escapeHtml(heading[2]))}</h${level}>`);
      continue;
    }

    const list = line.match(/^[-*]\s+(.+)$/);
    if (list) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inlineFormat(escapeHtml(list[1]))}</li>`);
      continue;
    }

    flushList();
    out.push(`<p>${escaped}</p>`);
  }

  flushList();

  return [
    "<!doctype html>",
    `<html lang="${escapeHtml(language)}" dir="${escapeHtml(safeDir)}">`,
    "<head>",
    '<meta charset="utf-8" />',
    "<style>",
    "body { font-family: Arial, 'Segoe UI', sans-serif; line-height: 1.6; margin: 32px; }",
    "h1,h2,h3,h4,h5,h6 { margin: 0 0 12px; }",
    "p { margin: 0 0 10px; white-space: pre-wrap; }",
    "ul { margin: 0 0 10px 20px; }",
    "</style>",
    "</head>",
    `<body>${out.join("")}</body>`,
    "</html>",
  ].join("");
}

module.exports = {
  renderMarkdownToHtml,
};

