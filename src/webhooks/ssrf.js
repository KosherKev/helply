"use strict";
/**
 * SSRF protection for outbound webhooks.
 *  - https only, no credentials in the URL, no IP literals in private ranges, no local-ish hostnames
 *  - DNS is resolved at CONNECT time through `safeLookup`, so a rebinding host cannot slip a private IP in
 *  - redirects are never followed (a 3xx is a failed delivery); response size and time are capped
 */
const dns = require("node:dns");
const net = require("node:net");
const https = require("node:https");

const v4ToInt = (ip) => ip.split(".").reduce((a, o) => a * 256 + Number(o), 0);
const V4_BLOCKS = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24],
  ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
].map(([base, bits]) => ({ base: v4ToInt(base), mask: bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0 }));

const expandV6 = (ip) => {
  let s = ip.split("%")[0].toLowerCase();
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = v4ToInt(v4[1]);
    s = s.replace(v4[1], `${((n >>> 16) & 0xffff).toString(16)}:${(n & 0xffff).toString(16)}`);
  }
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined && tail ? tail.split(":") : [];
  const fill = s.includes("::") ? Array(8 - h.length - t.length).fill("0") : [];
  return [...h, ...fill, ...t].map((x) => parseInt(x || "0", 16));
};

/** True when the address must never be contacted. Unknown formats are blocked. */
const isBlockedIp = (ip) => {
  const kind = net.isIP(ip);
  if (kind === 4) {
    const n = v4ToInt(ip);
    return V4_BLOCKS.some((b) => ((n & b.mask) >>> 0) === (b.base & b.mask) >>> 0);
  }
  if (kind === 6) {
    const g = expandV6(ip);
    if (g.length !== 8 || g.some((x) => Number.isNaN(x))) return true;
    if (g.slice(0, 7).every((x) => x === 0) && g[7] <= 1) return true; // :: and ::1
    if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return isBlockedIp(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`); // mapped / compatible v4
    if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local (incl. AWS fd00:ec2::254)
    if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
    if ((g[0] & 0xff00) === 0xff00) return true; // multicast
    if (g[0] === 0x64 && g[1] === 0xff9b) return true; // NAT64
    if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
    return false;
  }
  return true;
};

const LOCAL_NAMES = /(^|\.)(localhost|local|internal|localdomain|home|lan|corp)$/i;

/** @returns {{ok:true,url:URL}|{ok:false,reason:string}} */
const validateWebhookUrl = (raw, { allowHttp = false } = {}) => {
  let u;
  try {
    u = new URL(String(raw));
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }
  if (u.protocol !== "https:" && !(allowHttp && u.protocol === "http:")) return { ok: false, reason: "only https URLs are allowed" };
  if (u.username || u.password) return { ok: false, reason: "credentials in the URL are not allowed" };
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host || LOCAL_NAMES.test(host)) return { ok: false, reason: "local hostnames are not allowed" };
  if (net.isIP(host) && isBlockedIp(host)) return { ok: false, reason: "private or reserved addresses are not allowed" };
  if (/^\d+$/.test(host) || /^0x/i.test(host)) return { ok: false, reason: "numeric hosts are not allowed" };
  return { ok: true, url: u };
};

const safeLookup = (hostname, options, cb) => {
  const opts = typeof options === "function" ? {} : options || {};
  const done = typeof options === "function" ? options : cb;
  dns.lookup(hostname, { ...opts, all: true }, (err, addrs) => {
    if (err) return done(err);
    const list = Array.isArray(addrs) ? addrs : [addrs];
    if (!list.length || list.some((a) => isBlockedIp(a.address))) return done(Object.assign(new Error("destination address is not allowed"), { code: "EBLOCKED" }));
    return opts.all ? done(null, list) : done(null, list[0].address, list[0].family);
  });
};

/** POST JSON without following redirects. Resolves {status, body}; rejects on network errors, timeouts or blocked hosts. */
const postJson = (rawUrl, body, headers = {}, { timeoutMs = 5000, maxBytes = 4096, lookup = safeLookup, requestImpl = https.request, allowHttp = false } = {}) =>
  new Promise((resolve, reject) => {
    const v = validateWebhookUrl(rawUrl, { allowHttp });
    if (!v.ok) return reject(Object.assign(new Error(v.reason), { code: "EBLOCKED" }));
    const req = requestImpl(
      v.url,
      { method: "POST", lookup, timeout: timeoutMs, headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), "User-Agent": "Helply-Webhooks/1", ...headers } },
      (res) => {
        let size = 0;
        const chunks = [];
        res.on("data", (c) => {
          size += c.length;
          if (size <= maxBytes) chunks.push(c);
          else res.destroy();
        });
        const finish = () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8").slice(0, maxBytes) });
        res.on("end", finish);
        res.on("close", finish);
      }
    );
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    req.on("error", reject);
    req.end(body);
  });

module.exports = { isBlockedIp, validateWebhookUrl, safeLookup, postJson };
