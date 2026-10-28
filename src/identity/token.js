"use strict";
/**
 * Short-lived customer identity token (HS256 JWT, built on node:crypto only).
 *
 * The company's own backend signs it when a logged-in user opens support; Helply verifies it.
 * The verified `sub` is the ONLY user id Helply will ever use to look up logs. It is never taken
 * from the customer's message or from anything the model produces.
 */
const crypto = require("node:crypto");

const b64u = (input) => Buffer.from(input).toString("base64url");

const sign = (claims, secret, { ttlSeconds = 900, now = Date.now() } = {}) => {
  if (!secret) throw new Error("A signing secret is required");
  const iat = Math.floor(now / 1000);
  const header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64u(JSON.stringify({ ...claims, iat, exp: iat + ttlSeconds }));
  const sig = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
};

const safeEqual = (a, b) => {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

/** @returns {{ok:true, claims:{userId,name,tenant,exp}} | {ok:false, reason:string}} */
const verify = (token, secret, { now = Date.now(), maxAgeSeconds = 900, visitorId, publicKey, alg } = {}) => {
  const fail = (reason) => ({ ok: false, reason });
  if (!secret && !publicKey) return fail("not_configured");
  if (typeof token !== "string" || token.length > 4096) return fail("malformed");
  const parts = token.split(".");
  if (parts.length !== 3) return fail("malformed");

  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return fail("malformed");
  }
  if (!header || typeof header.alg !== "string") return fail("bad_algorithm");
  if (publicKey) {
    // Public-key mode accepts ONLY the one configured asymmetric algorithm: never HS256 (key-confusion), never "none".
    if (!["RS256", "ES256"].includes(alg) || header.alg !== alg) return fail("bad_algorithm");
    let good = false;
    try {
      good = crypto.verify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), alg === "ES256" ? { key: publicKey, dsaEncoding: "ieee-p1363" } : publicKey, Buffer.from(parts[2], "base64url"));
    } catch {
      good = false;
    }
    if (!good) return fail("bad_signature");
  } else {
    if (header.alg !== "HS256") return fail("bad_algorithm"); // rejects "none" and RS/ES swaps
    const expected = crypto.createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest("base64url");
    if (!safeEqual(parts[2], expected)) return fail("bad_signature");
  }

  if (!claims || typeof claims !== "object") return fail("malformed");
  const nowS = Math.floor(now / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= nowS) return fail("expired");
  if (typeof claims.iat !== "number" || claims.iat > nowS + 60) return fail("bad_iat");
  if (claims.exp - claims.iat > maxAgeSeconds) return fail("lifetime_too_long");
  if (typeof claims.sub !== "string" || !claims.sub.trim() || claims.sub.length > 128) return fail("missing_subject");
  // v2 claims (optional, so v1 tokens keep working). `aud`, when present, must name Helply. `vid` binds the token to one chat
  // visitor: it is accepted only when the caller supplies that same visitor id, so a stolen token cannot be replayed elsewhere.
  if (claims.aud !== undefined && !(Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes("helply")) return fail("bad_audience");
  if (claims.vid !== undefined && (typeof claims.vid !== "string" || visitorId === undefined || claims.vid !== visitorId)) return fail("visitor_mismatch");

  return {
    ok: true,
    claims: {
      userId: claims.sub.trim(),
      name: typeof claims.name === "string" ? claims.name.slice(0, 80) : null,
      tenant: typeof claims.tenant === "string" ? claims.tenant.slice(0, 80) : null,
      exp: claims.exp,
      visitorId: typeof claims.vid === "string" ? claims.vid : null,
      jti: typeof claims.jti === "string" ? claims.jti.slice(0, 80) : null,
    },
  };
};

module.exports = { sign, verify };
