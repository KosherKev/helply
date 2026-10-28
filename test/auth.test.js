"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { boot } = require("./_helpers");
const { sha256 } = require("../src/security/crypto");

test("signup can be closed; weak passwords and duplicates are rejected", async () => {
  const closed = await boot({ env: { ALLOW_SIGNUP: "false" } });
  try {
    const r = await closed.call("/v1/auth/register", { method: "POST", body: { email: "a@b.test", password: "correct-horse-battery", workspaceName: "X" } });
    assert.equal(r.status, 403);
    assert.equal(r.data.error.code, "signup_disabled");
  } finally { await closed.close(); }

  const s = await boot();
  try {
    const bad = await s.call("/v1/auth/register", { method: "POST", body: { email: "a@b.test", password: "short", workspaceName: "Acme" } });
    assert.equal(bad.status, 400);
    assert.equal(bad.data.error.code, "weak_password");
    assert.equal((await s.call("/v1/auth/register", { method: "POST", body: { email: "not-an-email", password: "correct-horse-battery", workspaceName: "Acme" } })).status, 400);
    const a = await s.register("Acme", "dup@acme.test");
    assert.ok(a.token.startsWith("hs_"));
    const dup = await s.call("/v1/auth/register", { method: "POST", body: { email: "DUP@acme.test", password: "correct-horse-battery", workspaceName: "Other" } });
    assert.equal(dup.status, 409);
  } finally { await s.close(); }
});

test("passwords are scrypt-hashed and session tokens are stored only as SHA-256 hashes", async () => {
  const s = await boot();
  try {
    const a = await s.register("Acme", "hash@acme.test");
    const u = s.repo.getUserByEmail("hash@acme.test");
    assert.ok(u.password_hash.startsWith("scrypt$"));
    assert.ok(!u.password_hash.includes("correct-horse-battery"));
    const rows = s.repo.db.prepare("SELECT token_hash FROM sessions").all();
    assert.ok(rows.some((r) => r.token_hash === sha256(a.token)));
    assert.ok(!rows.some((r) => r.token_hash === a.token));
  } finally { await s.close(); }
});

test("login: wrong password is 401, repeated failures lock out with Retry-After, logout kills the session", async () => {
  const s = await boot({ env: { RATE_LOGIN_IP: "1000" } });
  try {
    await s.register("Acme", "login@acme.test");
    const ok = await s.call("/v1/auth/login", { method: "POST", body: { email: "login@acme.test", password: "correct-horse-battery" } });
    assert.equal(ok.status, 200);
    const me = await s.call("/v1/auth/me", { token: ok.data.session });
    assert.equal(me.data.role, "owner");
    assert.equal((await s.call("/v1/auth/logout", { method: "POST", token: ok.data.session })).status, 204);
    assert.equal((await s.call("/v1/auth/me", { token: ok.data.session })).status, 401);

    for (let i = 0; i < 5; i += 1) {
      const bad = await s.call("/v1/auth/login", { method: "POST", body: { email: "login@acme.test", password: "wrong-password-1" } });
      assert.equal(bad.status, 401);
    }
    const locked = await s.call("/v1/auth/login", { method: "POST", body: { email: "login@acme.test", password: "correct-horse-battery" } });
    assert.equal(locked.status, 429);
    assert.equal(locked.data.error.code, "login_locked");
    assert.ok(Number(locked.headers.get("retry-after")) >= 1);
  } finally { await s.close(); }
});

test("login limiter is per IP and sends RateLimit headers", async () => {
  const s = await boot({ env: { RATE_LOGIN_IP: "3" } });
  try {
    const codes = [];
    for (let i = 0; i < 5; i += 1) codes.push((await s.call("/v1/auth/login", { method: "POST", body: { email: `x${i}@acme.test`, password: "whatever-long-1" } })).status);
    assert.deepEqual(codes, [401, 401, 401, 429, 429]);
    const r = await s.call("/v1/auth/login", { method: "POST", body: { email: "y@acme.test", password: "whatever-long-1" } });
    assert.equal(r.headers.get("ratelimit-limit"), "3");
  } finally { await s.close(); }
});

test("a removed member's session stops working immediately, and role changes apply live", async () => {
  const s = await boot();
  try {
    const owner = await s.register();
    const agent = await s.addMember(owner, "agent");
    assert.equal((await s.call("/v1/auth/me", { token: agent.token })).data.role, "agent");
    assert.equal((await s.call("/v1/team", { token: agent.token })).status, 403);
    await s.call(`/v1/team/${agent.user.id}`, { method: "PATCH", token: owner.token, body: { role: "admin" } });
    assert.equal((await s.call("/v1/team", { token: agent.token })).status, 200);
    assert.equal((await s.call(`/v1/team/${agent.user.id}`, { method: "DELETE", token: owner.token })).status, 204);
    assert.equal((await s.call("/v1/auth/me", { token: agent.token })).status, 401);
  } finally { await s.close(); }
});

test("the last owner cannot be demoted or removed; only owners manage owners", async () => {
  const s = await boot();
  try {
    const owner = await s.register();
    assert.equal((await s.call(`/v1/team/${owner.user.id}`, { method: "PATCH", token: owner.token, body: { role: "agent" } })).data.error.code, "last_owner");
    assert.equal((await s.call(`/v1/team/${owner.user.id}`, { method: "DELETE", token: owner.token })).data.error.code, "last_owner");
    const admin = await s.addMember(owner, "admin");
    const r = await s.call(`/v1/team/${owner.user.id}`, { method: "DELETE", token: admin.token });
    assert.equal(r.status, 403);
    const inv = await s.call("/v1/team/invitations", { method: "POST", token: admin.token, body: { email: "z@acme.test", role: "admin" } });
    assert.equal(inv.status, 403); // only an owner can mint admins
  } finally { await s.close(); }
});

test("invitations are single use and expire with the token", async () => {
  const s = await boot();
  try {
    const owner = await s.register();
    const inv = await s.call("/v1/team/invitations", { method: "POST", token: owner.token, body: { email: "new@acme.test", role: "agent" } });
    assert.ok(inv.data.link.includes(inv.data.token));
    const a1 = await s.call("/v1/auth/accept-invite", { method: "POST", body: { token: inv.data.token, password: "long-enough-pass" } });
    assert.equal(a1.status, 201);
    const a2 = await s.call("/v1/auth/accept-invite", { method: "POST", body: { token: inv.data.token, password: "long-enough-pass" } });
    assert.equal(a2.status, 400);
    assert.equal((await s.call("/v1/auth/accept-invite", { method: "POST", body: { token: "hi_nonsense", password: "long-enough-pass" } })).status, 400);
  } finally { await s.close(); }
});
