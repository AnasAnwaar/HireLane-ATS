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

/** An inline image part for a multimodal prompt (base64 data + mime type). */
export type InlineImage = { data: string; mimeType: string };

/**
 * Generate a JSON object matching `schema`. Uses Gemini's structured-output mode
 * (responseSchema) so the model returns valid JSON we can parse without repair.
 * Pass `images` to send a multimodal prompt (e.g. a check-in photo for CP-20).
 */
export async function generateJson<T>(
  prompt: string,
  schema: Schema,
  opts: { temperature?: number; images?: InlineImage[] } = {},
): Promise<T> {
  const ai = getClient();

  // Text-only stays a plain string; with images we send an ordered parts array.
  const contents = opts.images?.length
    ? [...opts.images.map((img) => ({ inlineData: img })), { text: prompt }]
    : prompt;

  let res;
  try {
    res = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
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

/**
 * Generate free-form text (not JSON). Pass `media` for multimodal input — e.g. an
 * audio/video recording to transcribe (CP-22). Returns the model's text.
 */
export async function generateText(
  prompt: string,
  opts: { temperature?: number; media?: InlineImage[] } = {},
): Promise<string> {
  const ai = getClient();
  const contents = opts.media?.length
    ? [...opts.media.map((m) => ({ inlineData: m })), { text: prompt }]
    : prompt;

  let res;
  try {
    res = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: { temperature: opts.temperature ?? 0.2 },
    });
  } catch (err) {
    const message = String((err as Error)?.message ?? err);
    if (/quota|rate|429/i.test(message)) {
      throw new AiError("The AI is temporarily rate-limited. Please try again in a moment.");
    }
    if (/api key|401|403|permission/i.test(message)) {
      throw new AiError("The AI isn't configured correctly. Check the Gemini API key.");
    }
    if (/unsupported|mime|invalid argument|400/i.test(message)) {
      throw new AiError("That recording format can't be transcribed. Try an MP3, M4A or MP4 file.");
    }
    throw new AiError("The AI couldn't complete that request. Please try again.");
  }

  return res.text ?? "";
}
