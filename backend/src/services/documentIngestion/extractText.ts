const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function detectDocumentType(filePath, mimeType) {
  const ext = filePath ? path.extname(filePath).toLowerCase() : "";
  const normalizedMime = mimeType ? mimeType.toLowerCase() : "";

  if (normalizedMime === "application/pdf" || ext === ".pdf") return "pdf";
  if (
    normalizedMime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === ".docx"
  ) {
    return "docx";
  }
  if (
    normalizedMime ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    ext === ".xlsx"
  ) {
    return "xlsx";
  }
  if (
    normalizedMime ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    ext === ".pptx"
  ) {
    return "pptx";
  }
  if (
    normalizedMime.startsWith("text/") ||
    normalizedMime === "application/json" ||
    [".txt", ".md", ".csv", ".json", ".rtf"].includes(ext)
  ) {
    return "text";
  }
  if (
    normalizedMime.startsWith("image/") ||
    [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".tif",
      ".tiff",
      ".bmp",
      ".webp",
      ".heic",
      ".heif",
    ].includes(ext)
  ) {
    return "image";
  }

  return "unknown";
}

function normalizeText(value) {
  if (!value) return "";
  return String(value)
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function decodePdfString(value) {
  let output = "";
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch !== "\\") {
      output += ch;
      continue;
    }
    const next = value[i + 1];
    if (!next) break;
    i += 1;
    if (next >= "0" && next <= "7") {
      let octal = next;
      for (let j = 0; j < 2; j += 1) {
        const peek = value[i + 1];
        if (peek >= "0" && peek <= "7") {
          octal += peek;
          i += 1;
        } else {
          break;
        }
      }
      output += String.fromCharCode(parseInt(octal, 8));
      continue;
    }
    switch (next) {
      case "n":
        output += "\n";
        break;
      case "r":
        output += "\r";
        break;
      case "t":
        output += "\t";
        break;
      case "b":
        output += "\b";
        break;
      case "f":
        output += "\f";
        break;
      case "\\":
      case "(":
      case ")":
        output += next;
        break;
      default:
        output += next;
        break;
    }
  }
  return output;
}

function extractPdfTextFromContent(content) {
  const chunks = [];
  const tjRegex = /\((?:\\.|[^\\\)])*\)\s*Tj/g;
  const tjArrayRegex = /\[(.*?)\]\s*TJ/gms;

  let match = null;
  while ((match = tjRegex.exec(content)) !== null) {
    const raw = match[0];
    const start = raw.indexOf("(") + 1;
    const end = raw.lastIndexOf(")");
    if (end > start) {
      chunks.push(decodePdfString(raw.slice(start, end)));
    }
  }

  while ((match = tjArrayRegex.exec(content)) !== null) {
    const arrayContent = match[1];
    const stringRegex = /\((?:\\.|[^\\\)])*\)/g;
    let stringMatch = null;
    while ((stringMatch = stringRegex.exec(arrayContent)) !== null) {
      const raw = stringMatch[0];
      const inner = raw.slice(1, -1);
      chunks.push(decodePdfString(inner));
    }
  }

  return chunks.join(" ");
}

function extractPdfText(buffer) {
  const sources = [];
  const streamToken = Buffer.from("stream");
  const endStreamToken = Buffer.from("endstream");
  let offset = 0;

  while (offset < buffer.length) {
    const start = buffer.indexOf(streamToken, offset);
    if (start === -1) break;
    let streamStart = start + streamToken.length;
    if (buffer[streamStart] === 0x0d && buffer[streamStart + 1] === 0x0a) {
      streamStart += 2;
    } else if (buffer[streamStart] === 0x0a) {
      streamStart += 1;
    }
    const end = buffer.indexOf(endStreamToken, streamStart);
    if (end === -1) break;

    const dictStart = Math.max(0, start - 200);
    const dictChunk = buffer.slice(dictStart, start).toString("latin1");
    let streamData = buffer.slice(streamStart, end);
    let decoded = null;

    if (dictChunk.includes("/FlateDecode")) {
      try {
        decoded = zlib.inflateSync(streamData).toString("latin1");
      } catch (error) {
        try {
          decoded = zlib.inflateRawSync(streamData).toString("latin1");
        } catch {}
      }
    } else {
      decoded = streamData.toString("latin1");
    }

    if (decoded) {
      sources.push(decoded);
    }

    offset = end + endStreamToken.length;
  }

  if (!sources.length) {
    sources.push(buffer.toString("latin1"));
  }

  const textChunks = sources
    .map((source) => extractPdfTextFromContent(source))
    .filter((chunk) => chunk && chunk.trim().length);

  return textChunks.join("\n").trim();
}

function decodeXmlEntities(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    );
}

function readZipEntry(buffer, entryName) {
  const entries = listZipEntries(buffer);
  const entry = entries.find((item) => item.name === entryName);
  if (!entry) return null;
  return readZipEntryByMeta(buffer, entry);
}

function listZipEntries(buffer) {
  const eocdSignature = 0x06054b50;
  const cdSignature = 0x02014b50;
  let eocdOffset = -1;

  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === eocdSignature) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) return [];

  const cdSize = buffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  let offset = cdOffset;
  const entries = [];

  while (offset < cdOffset + cdSize) {
    if (buffer.readUInt32LE(offset) !== cdSignature) break;
    const compression = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer
      .slice(offset + 46, offset + 46 + nameLength)
      .toString("utf8");

    entries.push({
      name,
      compression,
      compressedSize,
      localHeaderOffset,
    });

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function readZipEntryByMeta(buffer, entry) {
  const lfSignature = 0x04034b50;
  if (!entry || buffer.readUInt32LE(entry.localHeaderOffset) !== lfSignature) {
    return null;
  }
  const localNameLength = buffer.readUInt16LE(entry.localHeaderOffset + 26);
  const localExtraLength = buffer.readUInt16LE(entry.localHeaderOffset + 28);
  const dataStart = entry.localHeaderOffset + 30 + localNameLength + localExtraLength;
  const dataEnd = dataStart + entry.compressedSize;
  const fileData = buffer.slice(dataStart, dataEnd);

  if (entry.compression === 0) {
    return fileData;
  }
  if (entry.compression === 8) {
    try {
      return zlib.inflateRawSync(fileData);
    } catch {}
  }
  return null;
}

function extractDocxText(buffer) {
  const xmlBuffer = readZipEntry(buffer, "word/document.xml");
  if (!xmlBuffer) return "";
  const xml = xmlBuffer.toString("utf8");
  const paragraphs = xml.split(/<\/w:p>/i);
  const extracted = paragraphs
    .map((paragraph) => {
      const matches = paragraph.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g);
      if (!matches) return "";
      const text = matches
        .map((match) => match.replace(/<[^>]+>/g, ""))
        .join("");
      return decodeXmlEntities(text);
    })
    .filter((value) => value && value.trim().length);

  return extracted.join("\n").trim();
}

function stripXmlTags(value) {
  return decodeXmlEntities(String(value || "").replace(/<[^>]+>/g, " "));
}

function extractXlsxText(buffer) {
  const entries = listZipEntries(buffer);
  if (!entries.length) return "";

  const sharedStringsEntry = entries.find((entry) => entry.name === "xl/sharedStrings.xml");
  const sharedStringsXml = sharedStringsEntry
    ? readZipEntryByMeta(buffer, sharedStringsEntry)?.toString("utf8") || ""
    : "";
  const sharedStrings = [];
  if (sharedStringsXml) {
    const items = sharedStringsXml.match(/<si[\s\S]*?<\/si>/gi) || [];
    for (const item of items) {
      const texts = item.match(/<t[^>]*>[\s\S]*?<\/t>/gi) || [];
      const merged = texts
        .map((part) => part.replace(/<\/?t[^>]*>/gi, ""))
        .join("");
      sharedStrings.push(stripXmlTags(merged).trim());
    }
  }

  const sheetEntries = entries
    .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!sheetEntries.length) return "";

  const sheets = [];
  for (const entry of sheetEntries) {
    const xml = readZipEntryByMeta(buffer, entry)?.toString("utf8") || "";
    if (!xml) continue;
    const rows = xml.match(/<row[\s\S]*?<\/row>/gi) || [];
    const rowTexts = [];
    for (const row of rows) {
      const cells = row.match(/<c[\s\S]*?<\/c>/gi) || [];
      const values = [];
      for (const cell of cells) {
        const isShared = /\bt="s"/i.test(cell);
        const vMatch = cell.match(/<v[^>]*>([\s\S]*?)<\/v>/i);
        if (!vMatch) continue;
        let value = stripXmlTags(vMatch[1]).trim();
        if (isShared) {
          const idx = Number.parseInt(value, 10);
          if (Number.isInteger(idx) && idx >= 0 && idx < sharedStrings.length) {
            value = sharedStrings[idx] || "";
          }
        }
        if (value) values.push(value);
      }
      if (values.length) rowTexts.push(values.join(" | "));
    }
    if (rowTexts.length) {
      sheets.push(`${entry.name.split("/").pop()}\n${rowTexts.join("\n")}`);
    }
  }

  return sheets.join("\n\n").trim();
}

function extractPptxText(buffer) {
  const entries = listZipEntries(buffer);
  if (!entries.length) return "";
  const slideEntries = entries
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!slideEntries.length) return "";

  const slides = [];
  for (const entry of slideEntries) {
    const xml = readZipEntryByMeta(buffer, entry)?.toString("utf8") || "";
    if (!xml) continue;
    const fragments = xml.match(/<a:t[^>]*>[\s\S]*?<\/a:t>/gi) || [];
    const text = fragments
      .map((chunk) => chunk.replace(/<\/?a:t[^>]*>/gi, ""))
      .map(stripXmlTags)
      .map((v) => v.trim())
      .filter(Boolean)
      .join("\n");
    if (text) {
      slides.push(`${entry.name.split("/").pop()}\n${text}`);
    }
  }
  return slides.join("\n\n").trim();
}

function extractNativeText(filePath, mimeType, docType) {
  if (!filePath) {
    return { text: "", error: "missing_file_path" };
  }

  if (!fs.existsSync(filePath)) {
    return { text: "", error: "file_not_found" };
  }

  let buffer = null;
  try {
    buffer = fs.readFileSync(filePath);
  } catch (error) {
    return { text: "", error: "file_read_failed" };
  }

  const type = docType || detectDocumentType(filePath, mimeType);

  if (type === "text") {
    const text = normalizeText(buffer.toString("utf8")).trim();
    return { text, error: text.length ? null : "empty_text" };
  }

  if (type === "pdf") {
    const text = normalizeText(extractPdfText(buffer)).trim();
    return { text, error: text.length ? null : "no_pdf_text" };
  }

  if (type === "docx") {
    const text = normalizeText(extractDocxText(buffer)).trim();
    return { text, error: text.length ? null : "no_docx_text" };
  }
  if (type === "xlsx") {
    const text = normalizeText(extractXlsxText(buffer)).trim();
    return { text, error: text.length ? null : "no_xlsx_text" };
  }
  if (type === "pptx") {
    const text = normalizeText(extractPptxText(buffer)).trim();
    return { text, error: text.length ? null : "no_pptx_text" };
  }

  return { text: "", error: "unsupported_type" };
}

module.exports = {
  detectDocumentType,
  normalizeText,
  extractNativeText,
};
