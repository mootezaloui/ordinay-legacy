"use strict";

const fs = require("fs");
const path = require("path");

const { renderTemplateToHtml } = require("./templateRegistry.service");
const { renderMarkdownToHtml } = require("./markdownRender.service");
const { MIME_BY_FORMAT } = require("./constants");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function htmlToPlainText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function renderPdf(html, outputPath) {
  let puppeteer;
  try {
    puppeteer = require("puppeteer");
  } catch (_) {
    const err = new Error("PDF renderer unavailable: install puppeteer in backend dependencies");
    err.code = "PDF_RENDERER_UNAVAILABLE";
    throw err;
  }

  const launchOptions = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  let browser;
  try {
    browser = await puppeteer.launch(launchOptions);
  } catch (error) {
    const err = new Error(
      `PDF renderer launch failed: ${error.message || "unknown error"}. ` +
        "Install Chromium for puppeteer or set PUPPETEER_EXECUTABLE_PATH.",
    );
    err.code = "PDF_RENDERER_LAUNCH_FAILED";
    throw err;
  }
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({ path: outputPath, format: "A4", printBackground: true });
  } finally {
    await browser.close();
  }
}

async function renderDocx(html, outputPath) {
  let docx;
  try {
    docx = require("docx");
  } catch (_) {
    const err = new Error("DOCX renderer unavailable: install docx in backend dependencies");
    err.code = "DOCX_RENDERER_UNAVAILABLE";
    throw err;
  }

  const text = htmlToPlainText(html);
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
  } = docx;

  const paragraphs = text
    .split(/\s{2,}|\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => new Paragraph({ children: [new TextRun(line)] }));

  const file = new Document({
    sections: [{ children: paragraphs.length > 0 ? paragraphs : [new Paragraph("")] }],
  });
  const buffer = await Packer.toBuffer(file);
  fs.writeFileSync(outputPath, buffer);
}

async function renderDocument({
  documentType,
  language,
  schemaVersion,
  contentJson,
  format,
  outputPath,
}) {
  let html = "";
  const markdown = String(contentJson?.content?.markdown || "").trim();
  if (markdown) {
    html = renderMarkdownToHtml(markdown, { language });
  } else {
    const rendered = renderTemplateToHtml({
      documentType,
      language,
      schemaVersion,
      viewModel: contentJson,
    });
    html = rendered.html;
  }

  ensureDir(path.dirname(outputPath));

  if (format === "html") {
    fs.writeFileSync(outputPath, html, "utf8");
  } else if (format === "pdf") {
    await renderPdf(html, outputPath);
  } else if (format === "docx") {
    await renderDocx(html, outputPath);
  } else {
    throw new Error(`Unsupported render format: ${format}`);
  }

  const stats = fs.statSync(outputPath);
  return {
    file_path: outputPath,
    size_bytes: Number(stats.size || 0),
    mime_type: MIME_BY_FORMAT[format] || "application/octet-stream",
    preview_html: html,
  };
}

module.exports = {
  renderDocument,
};
