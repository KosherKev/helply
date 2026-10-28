"use strict";
/**
 * Verifies the Khaya endpoints with YOUR key, so nobody has to guess.
 *   KHAYA_API_KEY=... npm run check:khaya [path/to/clip.wav]
 * If translate fails, adjust KHAYA_TRANSLATE_PATH / the body in src/language/khaya.js.
 */
const fs = require("node:fs");
const { load } = require("../src/config");
const { createKhaya } = require("../src/language/khaya");

const c = load();
if (!c.khaya.apiKey) {
  console.error("Set KHAYA_API_KEY first (subscribe at https://translation.ghananlp.org).");
  process.exit(1);
}
const k = createKhaya({ ...c.khaya });

const step = async (name, fn) => {
  try {
    console.log(`PASS  ${name}:`, await fn());
  } catch (err) {
    console.log(`FAIL  ${name}:`, err.message);
  }
};

(async () => {
  let twi = "";
  await step("translate en-tw", async () => (twi = await k.translate("Your payment has been received.", "en-tw")));
  await step("translate tw-en", async () => k.translate(twi || "Me ho yɛ", "tw-en"));
  await step("translate en-gaa", async () => k.translate("Good morning", "en-gaa"));
  await step("tts twi (bytes)", async () => (await k.synthesize("Me ho yɛ", "twi")).length);
  if (process.argv[2]) await step("asr tw", async () => k.transcribe(fs.readFileSync(process.argv[2]), "tw"));
  else console.log("SKIP  asr (pass a .wav path to test speech-to-text)");
})();
