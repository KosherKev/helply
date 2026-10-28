"use strict";
/**
 * GhanaNLP Khaya client: translation, speech-to-text, text-to-speech.
 * ASR and TTS follow the shapes already working in Maame. The translate endpoint/body is
 * configurable because it was NOT verified when this was written: run `npm run check:khaya`.
 */

class KhayaError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = "KhayaError";
    this.status = status;
  }
}

const sniffAudio = (buf) => {
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WAVE") return "audio/wav";
  if (buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "fLaC") return "audio/flac";
  if (buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "OggS") return "audio/ogg";
  if (buf.length >= 3 && buf.subarray(0, 3).toString("ascii") === "ID3") return "audio/mpeg";
  return "audio/mpeg";
};

const createKhaya = ({ apiKey, baseUrl, translatePath = "/v1/translate", fetchImpl = fetch, timeoutMs = 20000 } = {}) => {
  const headers = (extra = {}) => ({ "Ocp-Apim-Subscription-Key": apiKey, "Cache-Control": "no-cache", ...extra });
  const send = async (url, init) => {
    let res;
    try {
      res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new KhayaError(`Khaya unreachable: ${err.name}`);
    }
    if (!res.ok) throw new KhayaError(`Khaya ${res.status}: ${(await res.text()).slice(0, 160)}`, res.status);
    return res;
  };

  /** @param pair like "en-tw" or "tw-en" */
  const translate = async (text, pair) => {
    const res = await send(`${baseUrl}${translatePath}`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ in: text, lang: pair }),
    });
    const raw = await res.text();
    let parsed = raw;
    try {
      parsed = JSON.parse(raw);
    } catch {
      /* plain text body */
    }
    const out = typeof parsed === "string" ? parsed : parsed?.text ?? parsed?.translation ?? parsed?.out ?? parsed?.output;
    if (typeof out !== "string" || !out.trim()) throw new KhayaError("Khaya returned no translation");
    return out.trim();
  };

  const transcribe = async (audio, language) => {
    const res = await send(`${baseUrl}/asr/v3/transcribe?language=${encodeURIComponent(language)}`, {
      method: "POST",
      headers: headers({ "Content-Type": sniffAudio(audio) }),
      body: audio,
    });
    const json = await res.json();
    const text = typeof json === "string" ? json : json?.text;
    if (typeof text !== "string") throw new KhayaError("Khaya returned no transcript");
    return text.trim();
  };

  const synthesize = async (text, language) => {
    const res = await send(`${baseUrl}/tts/v2/synthesize`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ text, language, format: "wav", stream: false }),
    });
    return Buffer.from(await res.arrayBuffer());
  };

  return { isConfigured: () => Boolean(apiKey), translate, transcribe, synthesize };
};

module.exports = { createKhaya, KhayaError };
