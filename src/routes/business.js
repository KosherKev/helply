"use strict";
/** Business profile and FAQ: company-approved text the assistant may quote. */
const { HttpError } = require("../errors");
const { scrubString } = require("../logs/redact");
const { parseCsv } = require("../util-csv");

const LANGS = ["en", "tw", "gaa", "ee", "fat", "dag", "pcm"];
const TONES = ["friendly", "formal", "concise"];
const MAX_FAQS = 500;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

module.exports = (ctx) => {
  const { repo, route, auth } = ctx;
  const { guard } = auth;
  const userOnly = (req) => {
    if (req.principal.type === "apikey") throw new HttpError(403, "forbidden", "Use a signed-in session for this");
  };
  const text = (v, name, { min = 0, max, required = false, nullable = false } = {}) => {
    if (v === null || v === undefined || v === "") {
      if (required) throw new HttpError(400, "invalid_request", `${name} is required`);
      return nullable ? null : "";
    }
    if (typeof v !== "string") throw new HttpError(400, "invalid_request", `${name} must be text`);
    const t = v.trim();
    if (t.length < min || t.length > max) throw new HttpError(400, "invalid_request", `${name} must be ${min ? `${min} to ` : "up to "}${max} characters`);
    return t;
  };

  // ── business profile ──────────────────────────────────────────────────
  route("get", "/v1/business-profile", guard({ role: "agent" }), (req, res) => {
    userOnly(req);
    res.json(repo.getBusinessProfile(ctx.wsOf(req)));
  });

  route("put", "/v1/business-profile", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const b = req.body || {};
    const email = text(b.contactEmail, "contactEmail", { max: 254, nullable: true });
    if (email && !EMAIL.test(email)) throw new HttpError(400, "invalid_request", "contactEmail is not a valid email");
    const eb = b.escalation && typeof b.escalation === "object" ? b.escalation : {};
    const escEmail = text(eb.email, "escalation.email", { max: 254, nullable: true });
    if (escEmail && !EMAIL.test(escEmail)) throw new HttpError(400, "invalid_request", "escalation.email is not a valid email");
    const website = text(b.website, "website", { max: 200, nullable: true });
    if (website && !/^https?:\/\/[^\s]+$/i.test(website)) throw new HttpError(400, "invalid_request", "website must start with http:// or https://");
    const languages = Array.isArray(b.languages) && b.languages.length ? [...new Set(b.languages)] : ["en"];
    if (!languages.every((l) => LANGS.includes(l))) throw new HttpError(400, "invalid_request", "languages must be known language codes");
    if (!TONES.includes(b.tone || "friendly")) throw new HttpError(400, "invalid_request", `tone must be one of: ${TONES.join(", ")}`);
    let timezone = b.timezone || "Africa/Accra";
    try { new Intl.DateTimeFormat("en", { timeZone: timezone }); } catch { throw new HttpError(400, "invalid_request", "timezone is not a valid IANA timezone"); }
    timezone = String(timezone);
    // Company text is trusted input to the model, but personal data and secrets still never get stored in it.
    const profile = repo.putBusinessProfile(ctx.wsOf(req), {
      name: scrubString(text(b.name, "name", { min: 1, max: 80, required: true })),
      about: scrubString(text(b.about, "about", { max: 1000 })),
      website, hours: text(b.hours, "hours", { max: 200, nullable: true }), timezone,
      contactEmail: email, contactPhone: text(b.contactPhone, "contactPhone", { max: 40, nullable: true }), languages, tone: b.tone || "friendly",
      escalation: { email: escEmail, phone: text(eb.phone, "escalation.phone", { max: 40, nullable: true }), whatsapp: text(eb.whatsapp, "escalation.whatsapp", { max: 40, nullable: true }) },
    });
    ctx.audit(req, "business_profile_changed", {});
    res.json(profile);
  });

  // ── FAQ ───────────────────────────────────────────────────────────────
  const faqFields = (b, { partial = false } = {}) => {
    const out = {};
    if (!partial || b.question !== undefined) out.question = scrubString(text(b.question, "question", { min: 3, max: 300, required: true }));
    if (!partial || b.answer !== undefined) out.answer = scrubString(text(b.answer, "answer", { min: 1, max: 1000, required: true }));
    if (b.language !== undefined) {
      if (!LANGS.includes(b.language)) throw new HttpError(400, "invalid_request", "language must be a known language code");
      out.language = b.language;
    }
    if (b.tags !== undefined) {
      if (!Array.isArray(b.tags) || b.tags.length > 10 || !b.tags.every((t) => typeof t === "string" && t.trim() && t.length <= 30)) throw new HttpError(400, "invalid_request", "tags must be up to 10 short strings");
      out.tags = [...new Set(b.tags.map((t) => t.trim().toLowerCase()))];
    }
    if (b.enabled !== undefined) {
      if (typeof b.enabled !== "boolean") throw new HttpError(400, "invalid_request", "enabled must be a boolean");
      out.enabled = b.enabled;
    }
    return out;
  };
  const loadFaq = (req) => {
    const f = repo.getFaq(ctx.wsOf(req), req.params.id);
    if (!f) throw new HttpError(404, "not_found", "FAQ entry not found");
    return f;
  };

  route("get", "/v1/faqs", guard({ role: "agent" }), (req, res) => {
    userOnly(req);
    const { q, language, enabled, limit, cursor } = req.query;
    res.json(repo.listFaqs(ctx.wsOf(req), { q: q && String(q).slice(0, 100), language, enabled, limit, cursor }));
  });

  route("post", "/v1/faqs", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const ws = ctx.wsOf(req);
    const f = faqFields(req.body || {});
    if (repo.countFaqs(ws) >= MAX_FAQS) throw new HttpError(409, "faq_limit", `A workspace can have up to ${MAX_FAQS} FAQ entries`);
    if (repo.faqExists(ws, f.question)) throw new HttpError(409, "faq_exists", "An FAQ entry with that question already exists");
    const created = repo.createFaq(ws, f);
    ctx.audit(req, "faq_created", { faqId: created.id });
    res.status(201).json(created);
  });

  route("post", "/v1/faqs/import", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const ws = ctx.wsOf(req);
    const { filename, contentBase64 } = req.body || {};
    if (typeof filename !== "string" || !/\.csv$/i.test(filename)) throw new HttpError(400, "unsupported_file", "Upload a .csv file with columns question, answer (and optionally language, tags)");
    const raw = typeof contentBase64 === "string" ? Buffer.from(contentBase64, "base64") : Buffer.alloc(0);
    if (!raw.length) throw new HttpError(400, "file_required", "The file is empty");
    if (raw.length > 1_000_000) throw new HttpError(413, "file_too_large", "Files must be under 1 MB");
    const [header, ...rows] = parseCsv(raw.toString("utf8"));
    const col = (name) => (header || []).findIndex((h) => h.trim().toLowerCase() === name);
    const [qi, ai, li, ti] = ["question", "answer", "language", "tags"].map(col);
    if (qi < 0 || ai < 0) throw new HttpError(400, "invalid_csv", "The first row must contain the columns question and answer");
    let created = 0;
    let skipped = 0;
    const errors = [];
    rows.forEach((r, i) => {
      const rowNo = i + 2;
      try {
        const f = faqFields({ question: r[qi], answer: r[ai], ...(li >= 0 && r[li]?.trim() ? { language: r[li].trim() } : {}), ...(ti >= 0 && r[ti]?.trim() ? { tags: r[ti].split(/[;,]/).map((t) => t.trim()).filter(Boolean) } : {}) });
        if (repo.faqExists(ws, f.question)) { skipped += 1; return; }
        if (repo.countFaqs(ws) >= MAX_FAQS) { errors.push({ row: rowNo, message: `FAQ limit of ${MAX_FAQS} reached` }); return; }
        repo.createFaq(ws, { ...f, source: "import" });
        created += 1;
      } catch (e) {
        errors.push({ row: rowNo, message: e instanceof HttpError ? e.message : "could not read this row" });
      }
    });
    ctx.audit(req, "faq_imported", { created, skipped, errors: errors.length });
    res.json({ created, skipped, errors: errors.slice(0, 50) });
  });

  route("put", "/v1/faqs/:id", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const cur = loadFaq(req);
    const patch = faqFields(req.body || {}, { partial: true });
    if (patch.question && patch.question.toLowerCase() !== cur.question.toLowerCase() && repo.faqExists(ctx.wsOf(req), patch.question)) throw new HttpError(409, "faq_exists", "An FAQ entry with that question already exists");
    const out = repo.updateFaq(ctx.wsOf(req), cur.id, patch);
    ctx.audit(req, "faq_updated", { faqId: cur.id });
    res.json(out);
  });

  route("delete", "/v1/faqs/:id", guard({ role: "admin" }), (req, res) => {
    userOnly(req);
    const cur = loadFaq(req);
    repo.deleteFaq(ctx.wsOf(req), cur.id);
    ctx.audit(req, "faq_deleted", { faqId: cur.id });
    res.sendStatus(204);
  });
};
