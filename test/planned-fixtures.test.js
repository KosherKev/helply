"use strict";
/** The mock backend for PLANNED routes must stay valid against the contract, or the dashboard developer builds against fiction. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");
const express = require("express");
const { createChecker } = require("./_schema");
const fixtures = require("../scripts/planned-fixtures");
const { createPlannedMock, plannedOps } = require("../scripts/planned-mock-router");

const spec = YAML.parse(fs.readFileSync(path.join(__dirname, "..", "docs", "openapi.yaml"), "utf8"));
const { check } = createChecker(spec);
const prioritised = [];
for (const [p, item] of Object.entries(spec.paths)) for (const [m, op] of Object.entries(item)) if (op["x-planned"] && op["x-priority"]) prioritised.push({ key: `${m.toUpperCase()} ${p}`, method: m, path: p, op });

test("every planned operation with a priority has a fixture, and every fixture is a planned operation", () => {
  assert.ok(prioritised.length >= 45);
  assert.deepEqual(prioritised.filter((o) => fixtures[o.key] === undefined).map((o) => o.key), [], "add fixtures to scripts/planned-fixtures.js");
  const keys = new Set(prioritised.map((o) => o.key));
  assert.deepEqual(Object.keys(fixtures).filter((k) => k !== "__relayVariants" && !keys.has(k)), [], "fixtures for operations that are not planned");
});

test("every fixture matches its response schema in docs/openapi.yaml", () => {
  const problems = [];
  for (const o of prioritised) {
    const status = Object.keys(o.op.responses).find((k) => /^2\d\d$/.test(k));
    const schema = o.op.responses[status]?.content?.["application/json"]?.schema;
    if (!schema) { assert.equal(fixtures[o.key], null, `${o.key} has no body so its fixture must be null`); continue; }
    problems.push(...check(schema, fixtures[o.key], o.key));
  }
  for (const [name, v] of Object.entries(fixtures.__relayVariants)) problems.push(...check({ $ref: "#/components/schemas/RelayReply" }, v, `relay variant ${name}`));
  assert.deepEqual(problems, []);
});

test("request bodies in the spec are well formed: required fields exist in properties", () => {
  for (const o of prioritised) {
    const schema = o.op.requestBody?.content?.["application/json"]?.schema;
    if (!schema || schema.$ref) continue;
    for (const k of schema.required || []) assert.ok(k in (schema.properties || {}), `${o.key} requires ${k} but does not define it`);
  }
});

test("the mock router serves them: status codes, auth, and 204s", async () => {
  const app = express();
  app.use(createPlannedMock());
  const srv = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  try {
    const base = `http://127.0.0.1:${srv.address().port}`;
    for (const { method, path: p, op } of plannedOps().filter((x) => x.op["x-priority"])) {
      const url = base + p.replace(/\{(\w+)\}/g, "x");
      const status = Number(Object.keys(op.responses).find((k) => /^2\d\d$/.test(k)));
      const anon = await fetch(url, { method: method.toUpperCase() });
      const authed = await fetch(url, { method: method.toUpperCase(), headers: { Authorization: "Bearer test", "Content-Type": "application/json" }, body: method === "get" || method === "delete" ? undefined : "{}" });
      assert.equal(authed.status, status, `${method} ${p}`);
      if (op.security?.length) assert.equal(anon.status, 401, `${method} ${p} must require a credential`);
    }
  } finally { await new Promise((r) => srv.close(r)); }
});
