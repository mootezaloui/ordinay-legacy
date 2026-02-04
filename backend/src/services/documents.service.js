const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const db = require('../db/connection');
const { assert, filterPayload, buildUpdateClause } = require('./_utils');

const table = 'documents';
const DOCUMENT_ENTITY_COLUMNS = {
  client: 'client_id',
  dossier: 'dossier_id',
  lawsuit: 'lawsuit_id',
  mission: 'mission_id',
  task: 'task_id',
  session: 'session_id',
  personal_task: 'personal_task_id',
  financial_entry: 'financial_entry_id',
  officer: 'officer_id',
};
const allowedFields = [
  'title',
  'file_path',
  'mime_type',
  'size_bytes',
  'notes',
  'copy_type',
  'client_id',
  'dossier_id',
  'lawsuit_id',
  'mission_id',
  'task_id',
  'session_id',
  'personal_task_id',
  'financial_entry_id',
  'officer_id',
];

function validateTarget(data) {
  const targets = [
    data.client_id,
    data.dossier_id,
    data.lawsuit_id,
    data.mission_id,
    data.task_id,
    data.session_id,
    data.personal_task_id,
    data.financial_entry_id,
    data.officer_id,
  ];
  const count = targets.filter((v) => v !== null && v !== undefined).length;
  assert(count === 1, 'Exactly one parent reference is required for documents');
}

function detectDocumentType(filePath, mimeType) {
  const ext = filePath ? path.extname(filePath).toLowerCase() : '';
  const normalizedMime = mimeType ? mimeType.toLowerCase() : '';

  if (normalizedMime === 'application/pdf' || ext === '.pdf') return 'pdf';
  if (
    normalizedMime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === '.docx'
  ) {
    return 'docx';
  }
  if (
    normalizedMime.startsWith('text/') ||
    normalizedMime === 'application/json' ||
    ext === '.txt' ||
    ext === '.md' ||
    ext === '.csv' ||
    ext === '.json' ||
    ext === '.rtf'
  ) {
    return 'txt';
  }
  if (
    normalizedMime.startsWith('image/') ||
    ext === '.png' ||
    ext === '.jpg' ||
    ext === '.jpeg' ||
    ext === '.gif' ||
    ext === '.tif' ||
    ext === '.tiff' ||
    ext === '.bmp' ||
    ext === '.webp'
  ) {
    return 'image';
  }

  return 'unknown';
}

function decodePdfString(value) {
  let output = '';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch !== '\\') {
      output += ch;
      continue;
    }
    const next = value[i + 1];
    if (!next) break;
    i += 1;
    if (next >= '0' && next <= '7') {
      let octal = next;
      for (let j = 0; j < 2; j += 1) {
        const peek = value[i + 1];
        if (peek >= '0' && peek <= '7') {
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
      case 'n':
        output += '\n';
        break;
      case 'r':
        output += '\r';
        break;
      case 't':
        output += '\t';
        break;
      case 'b':
        output += '\b';
        break;
      case 'f':
        output += '\f';
        break;
      case '\\':
      case '(':
      case ')':
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
    const start = raw.indexOf('(') + 1;
    const end = raw.lastIndexOf(')');
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

  return chunks.join(' ');
}

function extractPdfText(buffer) {
  const sources = [];
  const streamToken = Buffer.from('stream');
  const endStreamToken = Buffer.from('endstream');
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
    const dictChunk = buffer.slice(dictStart, start).toString('latin1');
    let streamData = buffer.slice(streamStart, end);
    let decoded = null;

    if (dictChunk.includes('/FlateDecode')) {
      try {
        decoded = zlib.inflateSync(streamData).toString('latin1');
      } catch (error) {
        try {
          decoded = zlib.inflateRawSync(streamData).toString('latin1');
        } catch {}
      }
    } else {
      decoded = streamData.toString('latin1');
    }

    if (decoded) {
      sources.push(decoded);
    }

    offset = end + endStreamToken.length;
  }

  if (!sources.length) {
    sources.push(buffer.toString('latin1'));
  }

  const textChunks = sources
    .map((source) => extractPdfTextFromContent(source))
    .filter((chunk) => chunk && chunk.trim().length);

  return textChunks.join('\n').trim();
}

function decodeXmlEntities(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    );
}

function readZipEntry(buffer, entryName) {
  const eocdSignature = 0x06054b50;
  const cdSignature = 0x02014b50;
  const lfSignature = 0x04034b50;
  let eocdOffset = -1;

  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === eocdSignature) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) return null;

  const cdSize = buffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  let offset = cdOffset;

  while (offset < cdOffset + cdSize) {
    if (buffer.readUInt32LE(offset) !== cdSignature) break;
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer
      .slice(offset + 46, offset + 46 + nameLength)
      .toString('utf8');

    if (name === entryName) {
      if (buffer.readUInt32LE(localHeaderOffset) !== lfSignature) return null;
      const compression = buffer.readUInt16LE(localHeaderOffset + 8);
      const compressedSize = buffer.readUInt32LE(localHeaderOffset + 18);
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart =
        localHeaderOffset + 30 + localNameLength + localExtraLength;
      const dataEnd = dataStart + compressedSize;
      const fileData = buffer.slice(dataStart, dataEnd);

      if (compression === 0) {
        return fileData;
      }
      if (compression === 8) {
        try {
          return zlib.inflateRawSync(fileData);
        } catch {}
      }
      return null;
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return null;
}

function extractDocxText(buffer) {
  const xmlBuffer = readZipEntry(buffer, 'word/document.xml');
  if (!xmlBuffer) return '';
  const xml = xmlBuffer.toString('utf8');
  const paragraphs = xml.split(/<\/w:p>/i);
  const extracted = paragraphs
    .map((paragraph) => {
      const matches = paragraph.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g);
      if (!matches) return '';
      const text = matches
        .map((match) => match.replace(/<[^>]+>/g, ''))
        .join('');
      return decodeXmlEntities(text);
    })
    .filter((value) => value && value.trim().length);

  return extracted.join('\n').trim();
}

function extractDocumentText(filePath, mimeType) {
  if (!filePath) {
    return { document_text: null, unreadable_text: 1, text_length: null };
  }

  if (!fs.existsSync(filePath)) {
    return { document_text: null, unreadable_text: 1, text_length: null };
  }

  let buffer = null;
  try {
    buffer = fs.readFileSync(filePath);
  } catch (error) {
    return { document_text: null, unreadable_text: 1, text_length: null };
  }

  const docType = detectDocumentType(filePath, mimeType);

  if (docType === 'txt') {
    const text = buffer.toString('utf8');
    return {
      document_text: text,
      unreadable_text: 0,
      text_length: text.length,
    };
  }

  if (docType === 'pdf') {
    const text = extractPdfText(buffer);
    if (text && text.trim().length) {
      return {
        document_text: text,
        unreadable_text: 0,
        text_length: text.length,
      };
    }
    return { document_text: null, unreadable_text: 1, text_length: null };
  }

  if (docType === 'docx') {
    const text = extractDocxText(buffer);
    if (text && text.trim().length) {
      return {
        document_text: text,
        unreadable_text: 0,
        text_length: text.length,
      };
    }
    return { document_text: null, unreadable_text: 1, text_length: null };
  }

  if (docType === 'image') {
    return { document_text: null, unreadable_text: 1, text_length: null };
  }

  return { document_text: null, unreadable_text: 1, text_length: null };
}

function resolveLinkedEntity(document) {
  if (document.client_id !== null && document.client_id !== undefined) {
    return { type: 'client', id: document.client_id };
  }
  if (document.dossier_id !== null && document.dossier_id !== undefined) {
    return { type: 'dossier', id: document.dossier_id };
  }
  if (document.lawsuit_id !== null && document.lawsuit_id !== undefined) {
    return { type: 'lawsuit', id: document.lawsuit_id };
  }
  if (document.mission_id !== null && document.mission_id !== undefined) {
    return { type: 'mission', id: document.mission_id };
  }
  if (document.task_id !== null && document.task_id !== undefined) {
    return { type: 'task', id: document.task_id };
  }
  if (document.session_id !== null && document.session_id !== undefined) {
    return { type: 'session', id: document.session_id };
  }
  if (document.personal_task_id !== null && document.personal_task_id !== undefined) {
    return { type: 'personal_task', id: document.personal_task_id };
  }
  if (document.financial_entry_id !== null && document.financial_entry_id !== undefined) {
    return { type: 'financial_entry', id: document.financial_entry_id };
  }
  if (document.officer_id !== null && document.officer_id !== undefined) {
    return { type: 'officer', id: document.officer_id };
  }

  return { type: null, id: null };
}

function decorateDocument(document) {
  if (!document) return document;
  const linked = resolveLinkedEntity(document);
  const hasText =
    typeof document.document_text === 'string' && document.document_text.length > 0;
  return {
    ...document,
    document_id: document.id,
    linked_entity_type: linked.type,
    linked_entity_id: linked.id,
    has_text: hasText,
    unreadable_text: document.unreadable_text ? true : false,
    text_length: hasText ? document.document_text.length : null,
  };
}

function listMetadataByEntity(entityType, entityId, options = {}) {
  const column = DOCUMENT_ENTITY_COLUMNS[entityType];
  if (!column || !entityId) return [];

  const previewLength =
    Number.isInteger(options.previewLength) && options.previewLength > 0
      ? options.previewLength
      : 0;
  const previewSelect =
    previewLength > 0
      ? "substr(document_text, 1, @previewLength) as document_preview"
      : "NULL as document_preview";

  const rows = db
    .prepare(
      `
      SELECT
        id,
        title,
        file_path,
        original_filename,
        category,
        mime_type,
        size_bytes,
        notes,
        copy_type,
        uploaded_by,
        uploaded_at,
        updated_at,
        unreadable_text,
        ${previewSelect},
        CASE WHEN COALESCE(text_length, LENGTH(document_text)) > 0 THEN 1 ELSE 0 END as has_text,
        COALESCE(text_length, LENGTH(document_text)) as text_length,
        client_id,
        dossier_id,
        lawsuit_id,
        mission_id,
        task_id,
        session_id,
        personal_task_id,
        financial_entry_id,
        officer_id
      FROM ${table}
      WHERE deleted_at IS NULL AND ${column} = @entityId
    `,
    )
    .all({ entityId, previewLength });

  return rows.map((row) => {
    const linked = resolveLinkedEntity(row);
    const hasText = row.has_text ? true : false;
    const unreadable = row.unreadable_text ? true : false;
    return {
      document_id: row.id,
      title: row.title,
      file_path: row.file_path,
      original_filename: row.original_filename,
      category: row.category,
      mime_type: row.mime_type,
      size_bytes: row.size_bytes,
      notes: row.notes,
      copy_type: row.copy_type,
      uploaded_by: row.uploaded_by,
      uploaded_at: row.uploaded_at,
      updated_at: row.updated_at,
      linked_entity_type: linked.type,
      linked_entity_id: linked.id,
      has_text: hasText,
      unreadable_text: unreadable,
      text_length: hasText ? row.text_length : null,
      document_preview: hasText && !unreadable ? row.document_preview : null,
    };
  });
}

function listTextsByIds(documentIds = []) {
  const ids = Array.isArray(documentIds)
    ? documentIds.filter((id) => Number.isInteger(id) && id > 0)
    : [];
  if (ids.length === 0) return [];

  const params = {};
  const placeholders = ids
    .map((id, index) => {
      const key = `id${index}`;
      params[key] = id;
      return `@${key}`;
    })
    .join(', ');

  const rows = db
    .prepare(
      `
      SELECT
        id,
        document_text,
        unreadable_text,
        COALESCE(text_length, LENGTH(document_text)) as text_length,
        client_id,
        dossier_id,
        lawsuit_id,
        mission_id,
        task_id,
        session_id,
        personal_task_id,
        financial_entry_id,
        officer_id
      FROM ${table}
      WHERE deleted_at IS NULL AND id IN (${placeholders})
    `,
    )
    .all(params);

  return rows.map((row) => {
    const linked = resolveLinkedEntity(row);
    const hasText =
      !row.unreadable_text &&
      typeof row.document_text === 'string' &&
      row.document_text.length > 0;
    return {
      document_id: row.id,
      linked_entity_type: linked.type,
      linked_entity_id: linked.id,
      has_text: hasText,
      unreadable_text: row.unreadable_text ? true : false,
      text_length: hasText ? row.text_length : null,
      document_text: hasText ? row.document_text : null,
    };
  });
}

function list(filters = {}) {
  let sql = `SELECT * FROM ${table} WHERE deleted_at IS NULL`;
  const params = {};

  // Entity filtering for scoped queries
  if (filters.client_id !== undefined) {
    sql += ` AND client_id = @client_id`;
    params.client_id = filters.client_id;
  }
  if (filters.dossier_id !== undefined) {
    sql += ` AND dossier_id = @dossier_id`;
    params.dossier_id = filters.dossier_id;
  }
  if (filters.lawsuit_id !== undefined) {
    sql += ` AND lawsuit_id = @lawsuit_id`;
    params.lawsuit_id = filters.lawsuit_id;
  }
  if (filters.mission_id !== undefined) {
    sql += ` AND mission_id = @mission_id`;
    params.mission_id = filters.mission_id;
  }
  if (filters.task_id !== undefined) {
    sql += ` AND task_id = @task_id`;
    params.task_id = filters.task_id;
  }
  if (filters.session_id !== undefined) {
    sql += ` AND session_id = @session_id`;
    params.session_id = filters.session_id;
  }
  if (filters.personal_task_id !== undefined) {
    sql += ` AND personal_task_id = @personal_task_id`;
    params.personal_task_id = filters.personal_task_id;
  }
  if (filters.financial_entry_id !== undefined) {
    sql += ` AND financial_entry_id = @financial_entry_id`;
    params.financial_entry_id = filters.financial_entry_id;
  }
  if (filters.officer_id !== undefined) {
    sql += ` AND officer_id = @officer_id`;
    params.officer_id = filters.officer_id;
  }

  return db.prepare(sql).all(params).map(decorateDocument);
}

function get(id) {
  return decorateDocument(
    db.prepare(`SELECT * FROM ${table} WHERE id = @id AND deleted_at IS NULL`).get({ id })
  );
}

function create(payload) {
  const data = filterPayload(payload, allowedFields);
  const insertData = {
    mime_type: null,
    size_bytes: null,
    notes: null,
    document_text: null,
    unreadable_text: 0,
    text_length: null,
    copy_type: null,
    client_id: null,
    dossier_id: null,
    lawsuit_id: null,
    mission_id: null,
    task_id: null,
    session_id: null,
    personal_task_id: null,
    financial_entry_id: null,
    officer_id: null,
    ...data,
  };
  assert(insertData.title, 'title is required');
  assert(insertData.file_path, 'file_path is required');
  validateTarget(insertData);

  const extraction = extractDocumentText(insertData.file_path, insertData.mime_type);
  insertData.document_text = extraction.document_text;
  insertData.unreadable_text = extraction.unreadable_text;
  insertData.text_length = extraction.text_length;

  const stmt = db.prepare(
    `INSERT INTO ${table} (title, file_path, mime_type, size_bytes, notes, document_text, unreadable_text, text_length, copy_type, client_id, dossier_id, lawsuit_id, mission_id, task_id, session_id, personal_task_id, financial_entry_id, officer_id)
     VALUES (@title, @file_path, @mime_type, @size_bytes, @notes, @document_text, @unreadable_text, @text_length, @copy_type, @client_id, @dossier_id, @lawsuit_id, @mission_id, @task_id, @session_id, @personal_task_id, @financial_entry_id, @officer_id)`
  );
  const result = stmt.run(insertData);
  return get(result.lastInsertRowid);
}

function update(id, payload) {
  const data = filterPayload(payload, allowedFields);
  const updatable = {
    mime_type: null,
    size_bytes: null,
    notes: null,
    client_id: null,
    dossier_id: null,
    lawsuit_id: null,
    mission_id: null,
    task_id: null,
    session_id: null,
    personal_task_id: null,
    financial_entry_id: null,
    officer_id: null,
    ...data,
  };
  if (
    data.client_id !== undefined ||
    data.dossier_id !== undefined ||
    data.lawsuit_id !== undefined ||
    data.mission_id !== undefined ||
    data.task_id !== undefined ||
    data.session_id !== undefined ||
    data.personal_task_id !== undefined ||
    data.financial_entry_id !== undefined ||
    data.officer_id !== undefined
  ) {
    validateTarget(updatable);
  }
  assert(Object.keys(data).length > 0, 'No fields provided for update');

  let extraction = null;
  if (data.file_path !== undefined || data.mime_type !== undefined) {
    const current = db
      .prepare(`SELECT * FROM ${table} WHERE id = @id AND deleted_at IS NULL`)
      .get({ id });
    if (!current) return null;
    const sourcePath = data.file_path !== undefined ? data.file_path : current.file_path;
    const sourceMime = data.mime_type !== undefined ? data.mime_type : current.mime_type;
    extraction = extractDocumentText(sourcePath, sourceMime);
  }

  const setClause = buildUpdateClause({
    ...data,
    ...(extraction
      ? {
          document_text: extraction.document_text,
          unreadable_text: extraction.unreadable_text,
          text_length: extraction.text_length,
        }
      : {}),
  });
  const stmt = db.prepare(
    `UPDATE ${table} SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = @id AND deleted_at IS NULL`
  );
  const result = stmt.run({
    ...data,
    ...(extraction
      ? {
          document_text: extraction.document_text,
          unreadable_text: extraction.unreadable_text,
          text_length: extraction.text_length,
        }
      : {}),
    id,
  });
  if (result.changes === 0) return null;
  return get(id);
}

function remove(id) {
  const stmt = db.prepare(
    `UPDATE ${table} SET deleted_at = CURRENT_TIMESTAMP WHERE id = @id AND deleted_at IS NULL`
  );
  const result = stmt.run({ id });
  return result.changes > 0;
}

module.exports = {
  listMetadataByEntity,
  listTextsByIds,
  list,
  get,
  create,
  update,
  remove,
};

