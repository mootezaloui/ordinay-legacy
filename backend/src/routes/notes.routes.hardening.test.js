"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("notes routes do not access DB directly", () => {
  const filePath = path.resolve(__dirname, "notes.routes.js");
  const source = fs.readFileSync(filePath, "utf8");

  assert.equal(source.includes('require("../db/connection")'), false);
  assert.equal(source.includes("db.prepare("), false);
  assert.equal(source.includes("db.transaction("), false);
  assert.match(source, /require\("\.\.\/controllers\/notes\.controller"\)/);
});
