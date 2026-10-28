"use strict";
/** Website indexing: crawl a company's public site into knowledge documents. */
const { HttpError } = require("../errors");
const { validateWebhookUrl } = require("../webhooks/ssrf");
const { crawl } = require("../knowledge-crawler");

const MAX_SITES = 5;

module.exports = (ctx) => {
  const { repo, route, auth, config } = ctx;
  const { guard } = auth;
  const userOnly = (req) => {
    if (req.principal.type === "apikey") throw new HttpError(403, "forbidden", "Use a signed-in session for this");
  };

  const run = (ws, siteId, url) => {
    const job = (async () => {
      repo.setSite(ws, siteId, { status: "crawling" });
      try {
        const pages = await crawl(url, { fetchPage: ctx.crawlPage });
        repo.clearSiteDocs(ws, siteId);
        for (const p of pages) repo.addSiteDoc(ws, siteId, { title: `${p.title} (${new URL(p.url).pathname})`, text: p.text });
        repo.setSite(ws, siteId, { status: "ready", pages: pages.length, indexed: true, error: pages.length ? null : "No readable pages were found" });
      } catch (err) {
        repo.setSite(ws, siteId, { status: "failed", error: err.code === "EBLOCKED" ? "That address is not allowed" : `Could not read the site (${String(err.code || err.message).slice(0, 60)})` });
      }
    })();
    ctx.jobs.add(job);
    job.finally(() => ctx.jobs.delete(job));
  };
  const load = (req) => {
    const s = repo.getSite(ctx.wsOf(req), req.params.id);
    if (!s) throw new HttpError(404, "not_found", "Site not found");
    return s;
  };

  route("get", "/v1/knowledge/sites", guard({ role: "agent" }), (req, res) => {
    userOnly(req);
    res.json({ data: repo.listSites(ctx.wsOf(req)) });
  });
  route("post", "/v1/knowledge/sites", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const v = validateWebhookUrl(req.body?.url, { allowHttp: config.allowInsecureWebhooks });
    if (!v.ok) throw new HttpError(400, "unsafe_url", `Site URL rejected: ${v.reason}`);
    const ws = ctx.wsOf(req);
    if (repo.listSites(ws).length >= MAX_SITES) throw new HttpError(409, "too_many_sites", `Limit of ${MAX_SITES} sites per workspace`);
    const site = repo.createSite(ws, v.url.toString());
    ctx.audit(req, "site_added", { siteId: site.id, host: v.url.host });
    run(ws, site.id, site.url);
    res.status(201).json(site);
  });
  route("post", "/v1/knowledge/sites/:id/reindex", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const s = load(req);
    if (s.status === "crawling") throw new HttpError(409, "already_running", "This site is being indexed");
    repo.setSite(ctx.wsOf(req), s.id, { status: "queued" });
    run(ctx.wsOf(req), s.id, s.url);
    res.json(repo.getSite(ctx.wsOf(req), s.id));
  });
  route("delete", "/v1/knowledge/sites/:id", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const s = load(req);
    repo.deleteSite(ctx.wsOf(req), s.id);
    ctx.audit(req, "site_removed", { siteId: s.id });
    res.sendStatus(204);
  });
};
