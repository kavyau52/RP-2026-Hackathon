import { NextRequest, NextResponse } from "next/server";
import { generateJSON } from "@/lib/gemini";
import type { Phrase } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Generates a survival phrasebook for a given real-life situation (doctor,
 * market, etc.), giving each essential phrase in both the mainstream and the
 * heritage language with a phonetic spelling.
 */
export async function POST(req: NextRequest) {
  try {
    const { situation, mainstream, heritage } = await req.json();
    if (!situation || !mainstream || !heritage) {
      return NextResponse.json(
        { error: "situation, mainstream, and heritage are required." },
        { status: 400 }
      );
    }

    const data = await generateJSON<{ phrases: Phrase[] }>({
      system:
        "You build practical survival phrasebooks for people who speak an endangered language and need to get by " +
        "in a city that speaks a mainstream language. Choose the most useful, real phrases for the situation. " +
        "Keep them short and spoken. Be culturally respectful and accurate.",
      prompt:
        `Situation: ${situation}\n` +
        `Mainstream language (the city): ${mainstream}\n` +
        `Heritage language (the person's own): ${heritage}\n\n` +
        `Give 8 essential phrases. Respond as JSON:\n` +
        `{ "phrases": [ {\n` +
        `  "situation": "what this phrase is for, in ${mainstream}",\n` +
        `  "mainstream": "the phrase in ${mainstream}",\n` +
        `  "heritage": "the phrase in ${heritage}",\n` +
        `  "phonetic": "simple pronunciation of the ${heritage} phrase"\n` +
        `} ] }`,
      temperature: 0.5,
      maxOutputTokens: 2048,
    });

    return NextResponse.json({ phrases: data.phrases ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    console.error("[/api/phrases]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
