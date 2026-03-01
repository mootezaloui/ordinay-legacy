"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { renderTemplateToHtml } = require("./templateRegistry.service");
const { renderMarkdownToHtml } = require("./markdownRender.service");
const {
  DocumentFormat,
  formatToMime,
  normalizeFormat,
} = require("../../domain/documentFormatGovernance");

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

function htmlToLineArray(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h\d|li|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function escapePdfText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildSimplePdfBuffer(text) {
  const rawLines = String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const lines = rawLines.length ? rawLines : ["Generated document"];
  const wrapped = [];
  for (const line of lines) {
    const chunks = String(line).match(/.{1,90}/g);
    if (chunks && chunks.length) {
      wrapped.push(...chunks);
    } else {
      wrapped.push(line);
    }
  }

  const lineHeight = 14;
  const textCommands = [
    "BT",
    "/F1 11 Tf",
    "50 780 Td",
  ];
  wrapped.slice(0, 45).forEach((line, index) => {
    if (index > 0) textCommands.push(`0 -${lineHeight} Td`);
    textCommands.push(`(${escapePdfText(line)}) Tj`);
  });
  textCommands.push("ET");
  const contentStream = textCommands.join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(contentStream, "utf8")} >>\nstream\n${contentStream}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function renderSimplePdf(html, outputPath) {
  const lines = htmlToLineArray(html);
  const text = (lines.length ? lines : [htmlToPlainText(html) || "Generated document"]).join("\n");
  fs.writeFileSync(outputPath, buildSimplePdfBuffer(text));
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function crc32(buffer) {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || "");
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc ^= data[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZipBuffer(entries = []) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = String(entry?.name || "").replace(/\\/g, "/");
    const nameBuffer = Buffer.from(name, "utf8");
    const data = Buffer.isBuffer(entry?.data)
      ? entry.data
      : Buffer.from(String(entry?.data || ""), "utf8");
    const checksum = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
    localHeader.writeUInt16LE(20, 4); // version needed to extract
    localHeader.writeUInt16LE(0, 6); // general purpose bit flag
    localHeader.writeUInt16LE(0, 8); // compression method (store)
    localHeader.writeUInt16LE(0, 10); // file mod time
    localHeader.writeUInt16LE(0, 12); // file mod date
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18); // compressed size
    localHeader.writeUInt32LE(data.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    localParts.push(localHeader, nameBuffer, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // central dir signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed to extract
    centralHeader.writeUInt16LE(0, 8); // general purpose bit flag
    centralHeader.writeUInt16LE(0, 10); // compression method (store)
    centralHeader.writeUInt16LE(0, 12); // file mod time
    centralHeader.writeUInt16LE(0, 14); // file mod date
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20); // compressed size
    centralHeader.writeUInt32LE(data.length, 24); // uncompressed size
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42); // local header offset

    centralParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + data.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const entryCount = entries.length;

  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0); // end signature
  endOfCentralDirectory.writeUInt16LE(0, 4); // disk number
  endOfCentralDirectory.writeUInt16LE(0, 6); // disk where central directory starts
  endOfCentralDirectory.writeUInt16LE(entryCount, 8); // # records on this disk
  endOfCentralDirectory.writeUInt16LE(entryCount, 10); // # total records
  endOfCentralDirectory.writeUInt32LE(centralDirectorySize, 12);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, ...centralParts, endOfCentralDirectory]);
}

async function renderPdf(html, outputPath) {
  const forceSimplePdf = ["1", "true", "yes", "on"].includes(
    String(process.env.DOCUMENT_GENERATION_SIMPLE_PDF || "").toLowerCase(),
  );
  if (forceSimplePdf) {
    renderSimplePdf(html, outputPath);
    return;
  }

  let puppeteer;
  try {
    puppeteer = require("puppeteer");
  } catch (_) {
    renderSimplePdf(html, outputPath);
    return;
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
    renderSimplePdf(html, outputPath);
    return;
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

async function renderXlsx(html, outputPath) {
  const lines = htmlToLineArray(html);
  const rows = lines.length > 0 ? lines : [htmlToPlainText(html) || "Generated document"];
  const sharedStrings = rows.map((line) => `<si><t xml:space="preserve">${escapeXml(line)}</t></si>`).join("");
  const sheetRows = rows
    .map((_, index) => {
      const rowNumber = index + 1;
      return `<row r="${rowNumber}"><c r="A${rowNumber}" t="s"><v>${index}</v></c></row>`;
    })
    .join("");

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Document" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;

  const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${rows.length}" uniqueCount="${rows.length}">
  ${sharedStrings}
</sst>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

  const generatedAt = new Date().toISOString();
  const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Generated Document</dc:title>
  <dc:creator>Ordinay</dc:creator>
  <cp:lastModifiedBy>Ordinay</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${generatedAt}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${generatedAt}</dcterms:modified>
</cp:coreProperties>`;

  const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Ordinay</Application>
</Properties>`;

  const zip = createZipBuffer([
    { name: "[Content_Types].xml", data: contentTypesXml },
    { name: "_rels/.rels", data: rootRelsXml },
    { name: "docProps/core.xml", data: coreXml },
    { name: "docProps/app.xml", data: appXml },
    { name: "xl/workbook.xml", data: workbookXml },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRelsXml },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml },
    { name: "xl/sharedStrings.xml", data: sharedStringsXml },
  ]);

  fs.writeFileSync(outputPath, zip);
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

  const normalizedFormat = normalizeFormat(format) || String(format || "").trim().toLowerCase();

  if (normalizedFormat === DocumentFormat.HTML) {
    fs.writeFileSync(outputPath, html, "utf8");
  } else if (normalizedFormat === DocumentFormat.PDF) {
    await renderPdf(html, outputPath);
  } else if (normalizedFormat === DocumentFormat.DOCX) {
    await renderDocx(html, outputPath);
  } else if (normalizedFormat === DocumentFormat.XLSX) {
    await renderXlsx(html, outputPath);
  } else {
    throw new Error(`Unsupported render format: ${normalizedFormat || format}`);
  }

  const stats = fs.statSync(outputPath);
  return {
    file_path: outputPath,
    size_bytes: Number(stats.size || 0),
    mime_type: formatToMime(normalizedFormat),
    preview_html: html,
    content_hash: crypto.createHash("sha256").update(String(html || "")).digest("hex"),
  };
}

module.exports = {
  renderDocument,
};
