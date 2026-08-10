/**
 * Live smoke of the screening model call (CP-13).
 *   node scripts/test-screening-smoke.cjs
 * Screens a strong and a weak candidate against the same role and prints the
 * structured, evidence-cited output. Confirms the model returns usable JSON and
 * that scores separate good from poor fits. Uses the real Gemini key.
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { GoogleGenAI, Type } = require("@google/genai");

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.INTEGER },
    recommendation: { type: Type.STRING },
    summary: { type: Type.STRING },
    mustHaves: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { requirement: { type: Type.STRING }, status: { type: Type.STRING }, evidence: { type: Type.STRING } },
        required: ["requirement", "status", "evidence"],
      },
    },
    highlights: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { text: { type: Type.STRING }, evidence: { type: Type.STRING } },
        required: ["text", "evidence"],
      },
    },
    concerns: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { text: { type: Type.STRING } }, required: ["text"] } },
  },
  required: ["score", "recommendation", "summary", "mustHaves", "highlights", "concerns"],
};

function prompt(cand) {
  return `You are a fair, evidence-based screening assistant. Do NOT use gender, age, nationality or appearance.

ROLE
- Title: Senior React Developer
- Experience wanted: 5+ years
- MUST-HAVE: React, TypeScript, 5+ years frontend, State management
- NICE-TO-HAVE: Next.js, GraphQL, Testing

CANDIDATE (job-relevant fields only)
- Headline: ${cand.headline}
- Years of experience: ${cand.years}
- Skills: ${cand.skills.join(", ")}
- Cover note: ${cand.note}

Score every must-have (matched/partial/missing with evidence), give an overall 0-100 score and a recommendation (strong_fit >=75, possible_fit 50-74, weak_fit <50), plus highlights (with evidence) and concerns.`;
}

const STRONG = { headline: "Senior React Engineer", years: 6, skills: ["React", "TypeScript", "Redux", "Next.js", "GraphQL", "Jest"], note: "6 years building TypeScript design systems and state-heavy dashboards." };
const WEAK = { headline: "Junior Frontend Dev", years: 2, skills: ["React", "JavaScript", "HTML", "CSS"], note: "2 years, keen to grow; no professional TypeScript yet." };

(async () => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  for (const [name, cand] of [["STRONG (Ayesha)", STRONG], ["WEAK (Sara)", WEAK]]) {
    const res = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: prompt(cand),
      config: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.2 },
    });
    const r = JSON.parse(res.text);
    console.log(`\n=== ${name} ===`);
    console.log(`score=${r.score}  recommendation=${r.recommendation}`);
    console.log(`summary: ${r.summary}`);
    console.log("must-haves:");
    for (const m of r.mustHaves) console.log(`  - ${m.requirement}: ${m.status}  (${m.evidence})`);
    console.log(`highlights: ${r.highlights.length}, concerns: ${r.concerns.length}`);
    if (r.highlights[0]) console.log(`  e.g. "${r.highlights[0].text}"  <- ${r.highlights[0].evidence}`);
  }
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
