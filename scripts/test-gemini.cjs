/**
 * Gemini key smoke test — one real call to confirm the key + model work.
 *   node scripts/test-gemini.cjs
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { GoogleGenAI } = require("@google/genai");
(async () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) { console.error("GEMINI_API_KEY missing from .env.local"); process.exit(1); }
  const ai = new GoogleGenAI({ apiKey: key });
  try {
    const r = await ai.models.generateContent({ model: "gemini-flash-latest", contents: "Reply with exactly: OK" });
    const ok = (r.text || "").trim();
    console.log(ok === "OK" || ok.includes("OK") ? "✅ Gemini OK — key and model working." : `⚠️  Unexpected reply: ${ok}`);
    process.exit(0);
  } catch (e) {
    console.error("❌ Gemini call failed:", String(e.message || e).slice(0, 200));
    process.exit(1);
  }
})();
