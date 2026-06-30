import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

/**
 * Returns a singleton Gemini client. Created lazily so the API key is read at
 * request time (after env vars are loaded), not at module import.
 */
export function getGemini(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY is missing. Copy .env.local.example to .env.local and add your key."
      );
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

/** The model we use everywhere. Fast + multilingual, good for low-resource languages. */
export const MODEL = "gemini-flash-latest";

/**
 * Calls Gemini expecting a JSON response and parses it defensively. The model
 * occasionally wraps JSON in ```json fences or adds stray prose, so we strip
 * that before parsing.
 */
export async function generateJSON<T>(opts: {
  system: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<T> {
  const ai = getGemini();
  const response = await ai.models.generateContent({
    model: MODEL,
    config: {
      systemInstruction: opts.system,
      temperature: opts.temperature ?? 0.6,
      maxOutputTokens: opts.maxOutputTokens ?? 2048,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
    },
    contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
  });

  const raw = (response.text ?? "").trim();
  return parseJSON<T>(raw);
}

/** Strips markdown code fences and parses, with a best-effort fallback. */
export function parseJSON<T>(raw: string): T {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    // Fallback: grab the outermost JSON object/array if extra prose slipped in.
    const match = text.match(/[[{][\s\S]*[\]}]/);
    if (match) {
      return JSON.parse(match[0]) as T;
    }
    throw new Error("Gemini did not return valid JSON.");
  }
}
