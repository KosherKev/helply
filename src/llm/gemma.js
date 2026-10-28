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
    const generationConfig = { temperature, maxOutputTokens, ...(json ? { responseMimeType: "application/json" } : {}) };
    let data;
    try {
      data = await call({
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      });
    } catch (err) {
      // Some deployments reject systemInstruction or JSON mode with a 400. Retry once, inline.
      if (err.status !== 400) throw err;
      data = await call({
        contents: [{ role: "user", parts: [{ text: `${system ? `${system}\n\n` : ""}${user}` }] }],
        generationConfig: { temperature, maxOutputTokens },
      });
    }
    const text = textOf(data);
    if (!text) throw new LlmError("Empty model response");
    return { text, json: json ? extractJson(text) : null };
  };

  return { model, isConfigured: () => Boolean(apiKey), generate };
};

module.exports = { createGemma, LlmError, extractJson };
