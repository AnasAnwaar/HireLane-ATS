import "server-only";

import { GoogleGenAI, type Schema } from "@google/genai";

import { serverEnv } from "@/lib/env";

/**
 * Gemini (Google) client — the AI behind post generation (CP-11), and later
 * screening (CP-13) and test authoring.
 *
 * `gemini-flash-latest` is a stable alias that always resolves to the current
 * Flash model, so we don't chase deprecated version strings. The client is
 * lazily created so importing this module never throws when the key is absent —
 * callers check `isAiConfigured()` first and degrade gracefully.
 */

export const GEMINI_MODEL = "gemini-flash-latest";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const key = serverEnv().GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured.");
  client ??= new GoogleGenAI({ apiKey: key });
  return client;
}

export function isAiConfigured(): boolean {
  return Boolean(serverEnv().GEMINI_API_KEY);
}

export class AiError extends Error {}

/**
 * Generate a JSON object matching `schema`. Uses Gemini's structured-output mode
 * (responseSchema) so the model returns valid JSON we can parse without repair.
 */
export async function generateJson<T>(
  prompt: string,
  schema: Schema,
  opts: { temperature?: number } = {},
): Promise<T> {
  const ai = getClient();

  let res;
  try {
    res = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: opts.temperature ?? 0.7,
      },
    });
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    // Surface the common cases in language a user can act on.
    if (/quota|rate|429/i.test(message)) {
      throw new AiError("The AI is temporarily rate-limited. Please try again in a moment.");
    }
    if (/api key|401|403|permission/i.test(message)) {
      throw new AiError("The AI isn't configured correctly. Check the Gemini API key.");
    }
    throw new AiError("The AI couldn't complete that request. Please try again.");
  }

  const text = res.text ?? "";
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AiError("The AI returned an unexpected response. Please try again.");
  }
}
