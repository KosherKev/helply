"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadEnv, parse } = require("../src/loadEnv");

test("parses comments, quotes, export and inline comments", () => {
  const p = parse(['# c', 'A=1', 'export B="two words"', "C='x # not a comment'", 'D=plain # trailing', 'E=', '  F = spaced  ', 'bad line'].join("\n"));
  assert.deepEqual(p, { A: "1", B: "two words", C: "x # not a comment", D: "plain", E: "", F: "spaced" });
});

test("the real environment wins and only names are returned", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helply-env-"));
  const file = path.join(dir, ".env");
  fs.writeFileSync(file, "SECRET_KEY=from-file\nOTHER=2\n");
  const env = { SECRET_KEY: "from-shell" };
  const r = loadEnv({ file, env });
  assert.equal(env.SECRET_KEY, "from-shell");
  assert.equal(env.OTHER, "2");
  assert.deepEqual(r.loaded, ["OTHER"]);
  assert.ok(!JSON.stringify(r).includes("from-file"));
});

test("a missing file is not an error", () => {
  assert.deepEqual(loadEnv({ file: "/nonexistent/.env", env: {} }), { found: false, file: "/nonexistent/.env", loaded: [] });
});
