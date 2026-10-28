"use strict";
/**
 * Website indexer. Same-host only, depth 2, at most 30 pages of 512 KB, 30 s in total, obeys robots.txt (User-agent *).
 * Pages are untrusted: only visible text is kept (script/style/markup removed), nothing is executed or rendered, and the
 * text is scrubbed and chunked like any uploaded document. The fetcher is injected so tests never touch the network.
 */
const { scrubString } = require("./logs/redact");

const SKIP_EXT = /\.(png|jpe?g|gif|svg|webp|ico|pdf|zip|gz|mp4|mp3|css|js|json|xml|woff2?|ttf)(\?|$)/i;
const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

const htmlToText = (html) => {
  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "").replace(/\s+/g, " ").trim();
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m]);
  const text = body.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length > 2).join("\n\n");
  return { title: title.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m]).slice(0, 120), text };
};

const linksOf = (html, base) => {
  const out = new Set();
  for (const m of html.matchAll(/<a\s[^>]*href\s*=\s*["']([^"'#]+)[^"']*["']/gi)) {
    try {
      const u = new URL(m[1], base);
      if (!/^https?:$/.test(u.protocol) || u.host !== base.host || SKIP_EXT.test(u.pathname)) continue;
      u.hash = "";
      out.add(u.toString());
    } catch { /* ignore malformed links */ }
  }
  return [...out];
};

const parseRobots = (txt) => {
  const disallow = [];
  let applies = false;
  for (const raw of String(txt).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const k = m[1].toLowerCase();
    if (k === "user-agent") applies = m[2].trim() === "*";
    else if (k === "disallow" && applies && m[2].trim()) disallow.push(m[2].trim());
  }
  return (path) => !disallow.some((d) => path.startsWith(d));
};

/** @param {(url:string)=>Promise<{status:number,headers:object,body:string}>} fetchPage */
const crawl = async (startUrl, { fetchPage, maxPages = 30, maxDepth = 2, totalMs = 30_000, now = Date.now } = {}) => {
  const start = new URL(startUrl);
  const t0 = now();
  let allowed = () => true;
  try {
    const r = await fetchPage(new URL("/robots.txt", start).toString());
    if (r.status === 200) allowed = parseRobots(r.body);
  } catch { /* no robots.txt: everything allowed */ }
  const seen = new Set([start.toString()]);
  const queue = [{ url: start.toString(), depth: 0 }];
  const pages = [];
  while (queue.length && pages.length < maxPages && now() - t0 < totalMs) {
    const { url, depth } = queue.shift();
    const u = new URL(url);
    if (!allowed(u.pathname)) continue;
    let r;
    try { r = await fetchPage(url); } catch (err) { if (!pages.length && url === start.toString()) throw err; continue; }
    if (r.status !== 200 || !/text\/(html|plain)/i.test(String(r.headers?.["content-type"] || "text/html"))) continue;
    const { title, text } = htmlToText(r.body);
    if (text.length >= 40) pages.push({ url, title: title || u.pathname, text: scrubString(text).slice(0, 20_000) });
    if (depth < maxDepth) for (const l of linksOf(r.body, start)) if (!seen.has(l)) { seen.add(l); queue.push({ url: l, depth: depth + 1 }); }
  }
  return pages;
};

module.exports = { crawl, htmlToText, parseRobots, linksOf };
