/**
 * Live smoke of AI test generation (CP-15).
 *   node scripts/test-assessments-smoke.cjs
 * Generates a small test for a role and prints the questions + answer keys,
 * confirming the model returns valid, gradeable structured output.
 */
const path = require("path");
process.loadEnvFile(path.join(__dirname, "..", ".env.local"));
const { GoogleGenAI, Type } = require("@google/genai");

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING },
          prompt: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          correctIndexes: { type: Type.ARRAY, items: { type: Type.INTEGER } },
          rubric: { type: Type.STRING },
          marks: { type: Type.INTEGER },
          skill: { type: Type.STRING },
          difficulty: { type: Type.STRING },
        },
        required: ["type", "prompt", "options", "correctIndexes", "rubric", "marks", "skill", "difficulty"],
      },
    },
  },
  required: ["questions"],
};

const PROMPT = `You are an expert technical assessment author. Write a fair, job-relevant test.

ROLE: Senior React Developer
Must-have skills: React, TypeScript, State management
Nice-to-have skills: Next.js, Testing

Produce exactly 5 questions.
Allowed question types: Single choice, True / False, Short answer. Use only these types.
Mix difficulties (easy / medium / hard).
For choice questions give 3-4 plausible options with exactly the right correctIndexes.
For written questions give a concise grading rubric and no options.
Assign each question the single skill it tests and reasonable marks (1-10).`;

(async () => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const res = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: PROMPT,
    config: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0.6 },
  });
  const qs = JSON.parse(res.text).questions;
  console.log(`Generated ${qs.length} questions:\n`);
  let issues = 0;
  qs.forEach((q, i) => {
    console.log(`Q${i + 1} [${q.type}, ${q.difficulty}, ${q.marks} marks, skill=${q.skill}]`);
    console.log(`   ${q.prompt}`);
    const choice = ["single_choice", "multiple_choice", "true_false"].includes(q.type);
    if (choice) {
      q.options.forEach((o, oi) => console.log(`     ${q.correctIndexes.includes(oi) ? "✓" : " "} ${o}`));
      if (!q.options.length || !q.correctIndexes.length) issues++;
    } else {
      console.log(`   rubric: ${q.rubric.slice(0, 80)}…`);
      if (!q.rubric) issues++;
    }
    console.log("");
  });
  console.log(issues === 0 ? "All questions well-formed (options+key or rubric present)." : `${issues} malformed question(s).`);
  process.exit(issues === 0 ? 0 : 1);
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
