"use strict";
/**
 * Minimal .env loader (no dependency). Variables already present in the real environment win.
 * Returns variable NAMES only, so callers can log what was loaded without printing values.
 */
const fs = require("node:fs");
const path = require("node:path");

const parse = (text) => {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2];
    const q = v[0];
    if ((q === '"' || q === "'") && v.lastIndexOf(q) > 0) v = v.slice(1, v.lastIndexOf(q));
    else v = v.replace(/\s+#.*$/, "").trim();
    out[m[1]] = v;
  }
  return out;
};

const loadEnv = ({ file = path.resolve(process.cwd(), ".env"), env = process.env } = {}) => {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return { found: false, file, loaded: [] };
  }
  const loaded = [];
  for (const [k, v] of Object.entries(parse(text))) {
    if (env[k] === undefined) {
      env[k] = v;
      loaded.push(k);
    }
  }
  return { found: true, file, loaded };
};

module.exports = { loadEnv, parse };
