const service = require("../services/imports.service");
const { parseId } = require("./_utils");

const ALLOWED_ENTITY_TYPE = "client";

function parseBoolean(value) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return undefined;
}

async function list(req, res, next) {
  try {
    if (
      req.query.entity_type &&
      String(req.query.entity_type).toLowerCase() !== ALLOWED_ENTITY_TYPE
    ) {
      return res.status(400).json({ message: "Only client imports are supported" });
    }
    const filters = {
      entity_type: ALLOWED_ENTITY_TYPE,
      validated: parseBoolean(req.query.validated),
    };
    const imports = service.list(filters);
    res.json(imports);
  } catch (error) {
    next(error);
  }
}

async function aliases(req, res, next) {
  try {
    const schema = service.getClientImportSchema();
    res.json(schema);
  } catch (error) {
    next(error);
  }
}

async function get(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const record = service.get(id);
    if (!record) return res.status(404).json({ message: "Import not found" });
    if (record.entity_type !== ALLOWED_ENTITY_TYPE) {
      return res.status(400).json({ message: "Only client imports are supported" });
    }
    res.json(record);
  } catch (error) {
    next(error);
  }
}

async function createRaw(req, res, next) {
  try {
    if (
      req.body.entity_type &&
      String(req.body.entity_type).toLowerCase() !== ALLOWED_ENTITY_TYPE
    ) {
      return res.status(400).json({ message: "Only client imports are supported" });
    }
    if (Array.isArray(req.body.records)) {
      const result = service.createBatch(
        ALLOWED_ENTITY_TYPE,
        req.body.records,
        req.body.import_source
      );
      return res.status(201).json(result);
    }

    const created = service.createRaw({
      ...req.body,
      entity_type: ALLOWED_ENTITY_TYPE,
    });
    return res.status(201).json(created);
  } catch (error) {
    next(error);
  }
}

async function autoImport(req, res, next) {
  try {
    if (!Array.isArray(req.body.records)) {
      return res.status(400).json({ message: "records must be an array" });
    }
    if (
      req.body.entity_type &&
      String(req.body.entity_type).toLowerCase() !== ALLOWED_ENTITY_TYPE
    ) {
      return res.status(400).json({ message: "Only client imports are supported" });
    }
    const result = service.autoImportBatch(
      ALLOWED_ENTITY_TYPE,
      req.body.records,
      req.body.import_source
    );
    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

async function normalize(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const record = service.get(id);
    if (!record) return res.status(404).json({ message: "Import not found" });
    if (record.entity_type !== ALLOWED_ENTITY_TYPE) {
      return res.status(400).json({ message: "Only client imports are supported" });
    }
    const result = service.normalize(id, req.body.normalized_payload);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function validate(req, res, next) {
  try {
    const id = parseId(req.params.id);
    const record = service.get(id);
    if (!record) return res.status(404).json({ message: "Import not found" });
    if (record.entity_type !== ALLOWED_ENTITY_TYPE) {
      return res.status(400).json({ message: "Only client imports are supported" });
    }
    const result = service.validateAndApply(
      id,
      req.body.normalized_payload || null
    );
    if (!result.validation.valid) {
      return res.status(422).json(result);
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  aliases,
  list,
  get,
  createRaw,
  autoImport,
  normalize,
  validate,
};
