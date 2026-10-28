"use strict";
/**
 * Gemma 4 adapter over the Gemini API (generateContent). Swap `baseUrl` to point at a
 * self-hosted, OpenAI-style gateway later by replacing this one file.
 */

class LlmError extends Error {
  constructor(message, { status = null, retryable = false } = {}) {
    super(message);
    this.name = "LlmError";
    this.status = status;
    this.retryable = retryable;
  }
}

const scrubKey = (text, key) => {
  let out = String(text ?? "");
  if (key) out = out.split(key).join("<redacted>");
  return out.replace(/AIza[0-9A-Za-z_-]{20,}/g, "<redacted>").slice(0, 300);
};

const extractJson = (text) => {
  if (typeof text !== "string") return null;
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  return null;
};

const createGemma = ({
  apiKey,
  model,
  baseUrl = "https://generativelanguage.googleapis.com",
  fetchImpl = fetch,
  timeoutMs = 30000,
  temperature = 0.2,
  // Gemma 4 on the Gemini API is a thinking model: reasoning tokens count against maxOutputTokens, so a small budget can
  // end with no visible answer. Verified live 2026-10-28: only thinkingLevel "minimal" is accepted (budget 0 and "low" are 400s).
  thinkingLevel = "minimal",
} = {}) => {
  const endpoint = `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const call = async (body) => {
    let res;
    try {
      res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, // key never in the URL
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new LlmError(`Model unreachable: ${err.name}`, { retryable: true });
    }
    const raw = await res.text();
    if (!res.ok) {
      throw new LlmError(`Model API ${res.status}: ${scrubKey(raw, apiKey)}`, {
        status: res.status,
        retryable: res.status === 429 || res.status >= 500,
      });
    }
    return JSON.parse(raw);
  };

  const textOf = (data) =>
    (data?.candidates?.[0]?.content?.parts || [])
      .filter((p) => !p.thought)
      .map((p) => p.text || "")
      .join("")
      .trim();

  /** @returns {Promise<{text:string, json:object|null}>} */
  const generate = async ({ system, user, json = false, maxOutputTokens = 700 }) => {
    const base = { temperature, maxOutputTokens };
    const full = {
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { ...base, ...(json ? { responseMimeType: "application/json" } : {}), ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}) },
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    };
    // Some deployments reject thinkingConfig, systemInstruction or JSON mode with a 400. Step down once per rejection.
    const variants = [
      full,
      { ...full, generationConfig: { ...full.generationConfig, thinkingConfig: undefined } },
      { contents: [{ role: "user", parts: [{ text: `${system ? `${system}\n\n` : ""}${user}` }] }], generationConfig: base },
    ].filter((v, i, a) => i === 0 || JSON.stringify(v) !== JSON.stringify(a[i - 1]));
    let data;
    for (let i = 0; i < variants.length; i += 1) {
      try {
        data = await call(variants[i]);
        break;
      } catch (err) {
        if (err.status !== 400 || i === variants.length - 1) throw err;
      }
    }
    const text = textOf(data);
    if (!text) {
      const c = data?.candidates?.[0];
      throw new LlmError(c?.finishReason === "MAX_TOKENS" ? "Model spent its whole output budget on reasoning (raise maxOutputTokens or set GEMMA_THINKING_LEVEL=minimal)" : "Empty model response");
    }
    return { text, json: json ? extractJson(text) : null };
  };

  return { model, isConfigured: () => Boolean(apiKey), generate };
};

module.exports = { createGemma, LlmError, extractJson };
