"use strict";
/** Secrets at rest: AES-256-GCM for reversible secrets, scrypt for passwords, SHA-256 for bearer tokens. */
const crypto = require("node:crypto");

const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const randomToken = (prefix, bytes = 32) => `${prefix}${crypto.randomBytes(bytes).toString("base64url")}`;
const newId = (prefix) => `${prefix}_${crypto.randomBytes(8).toString("hex")}`;

const safeEqual = (a, b) => {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

const deriveKey = (material) => (/^[0-9a-f]{64}$/i.test(material) ? Buffer.from(material, "hex") : crypto.createHash("sha256").update(String(material)).digest());

/** @returns {{encrypt:(s:string)=>string, decrypt:(s:string)=>string}} */
const createVault = (keyMaterial) => {
  if (!keyMaterial) throw new Error("HELPLY_ENCRYPTION_KEY is required");
  const key = deriveKey(keyMaterial);
  return {
    encrypt: (plain) => {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv("aes-256-gcm", key, iv);
      const enc = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
      return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${enc.toString("base64url")}`;
    },
    decrypt: (blob) => {
      const [v, iv, tag, enc] = String(blob).split(".");
      if (v !== "v1" || !iv || !tag || !enc) throw new Error("bad ciphertext");
      const d = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      d.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
    },
  };
};

const N = 16384;
const hashPassword = (password) =>
  new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(String(password), salt, 32, { N }, (err, dk) => (err ? reject(err) : resolve(`scrypt$${N}$${salt.toString("base64url")}$${dk.toString("base64url")}`)));
  });

const verifyPassword = (password, stored) =>
  new Promise((resolve) => {
    const [alg, n, salt, hash] = String(stored).split("$");
    if (alg !== "scrypt" || !salt || !hash) return resolve(false);
    crypto.scrypt(String(password), Buffer.from(salt, "base64url"), 32, { N: Number(n) || N }, (err, dk) =>
      resolve(!err && safeEqual(dk.toString("base64url"), hash))
    );
  });

module.exports = { sha256, randomToken, newId, safeEqual, createVault, hashPassword, verifyPassword };
