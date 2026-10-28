"use strict";
/** Mounts fixtures for PLANNED routes on an Express app (dev:mock only). Never import this from src/. */
const express = require("express");
const { build } = require("./build-openapi");
const fixtures = require("./planned-fixtures");

const plannedOps = () => {
  const out = [];
  for (const [p, item] of Object.entries(build().paths)) {
    for (const [m, op] of Object.entries(item)) if (op["x-planned"] && fixtures[`${m.toUpperCase()} ${p}`] !== undefined) out.push({ method: m, path: p, op });
  }
  return out;
};

const createPlannedMock = () => {
  const r = express.Router();
  for (const { method, path, op } of plannedOps()) {
    const status = Number(Object.keys(op.responses).find((k) => /^2\d\d$/.test(k)));
    r[method](path.replace(/\{(\w+)\}/g, ":$1"), (req, res) => {
      if (op.security?.length && !req.get("authorization")) return res.status(401).json({ error: { code: "unauthorized", message: "Sign in required" } });
      res.set("X-Helply-Mock", "planned-route");
      return status === 204 ? res.sendStatus(204) : res.status(status).json(fixtures[`${method.toUpperCase()} ${path}`]);
    });
  }
  return r;
};

module.exports = { createPlannedMock, plannedOps };
