"use strict";

const fs = require("fs");
const path = require("path");

const SCHEMA_DIR = path.resolve(__dirname, "schemas");
const cache = new Map();

function schemaPath(documentType, schemaVersion) {
  return path.join(SCHEMA_DIR, `${documentType}.${schemaVersion}.schema.json`);
}

function getSchema(documentType, schemaVersion) {
  const key = `${documentType}:${schemaVersion}`;
  if (cache.has(key)) return cache.get(key);

  const file = schemaPath(documentType, schemaVersion);
  if (!fs.existsSync(file)) {
    throw new Error(`Document schema not found: ${documentType}@${schemaVersion}`);
  }

  const schema = JSON.parse(fs.readFileSync(file, "utf8"));
  cache.set(key, schema);
  return schema;
}

module.exports = {
  getSchema,
};
