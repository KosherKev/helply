"use strict";
/**
 * Seeds central-logging-service with the FICTIONAL demo story (see src/demo/seedLogs.js).
 * Run:  CLS_BASE_URL=... CLS_WRITE_KEY=sk_live_... npm run seed
 */
require("../src/loadEnv").loadEnv();
const { load } = require("../src/config");
const { seedLogs, AMA, KOFI } = require("../src/demo/seedLogs");

const cfg = load();
const WRITE_KEY = process.env.CLS_WRITE_KEY || "";
if (!cfg.cls.baseUrl || !WRITE_KEY) {
  console.error("Set CLS_BASE_URL and CLS_WRITE_KEY (a key with the logs:write scope).");
  process.exit(1);
}
seedLogs({ baseUrl: cfg.cls.baseUrl, writeKey: WRITE_KEY, service: cfg.cls.service })
  .then((n) => console.log(`Seeded ${n} fictional logs for service "${cfg.cls.service}" (users: ${AMA}, ${KOFI}).`))
  .catch((err) => { console.error("Seeding failed:", err.message); process.exit(1); });
