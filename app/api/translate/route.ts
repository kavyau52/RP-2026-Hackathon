import { NextRequest, NextResponse } from "next/server";
import { generateJSON } from "@/lib/gemini";
import type { TranslateResult } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Two-way translation between a mainstream language and an endangered heritage
 * language. Returns the translation plus a phonetic spelling so a user who
 * cannot read the script can still sound the phrase out.
 */
export async function POST(req: NextRequest) {
  try {
    const { text, from, to } = await req.json();
    if (!text || !from || !to) {
      return NextResponse.json(
        { error: "text, from, and to are required." },
        { status: 400 }
      );
    }

    const result = await generateJSON<TranslateResult>({
      system:
        "You are a careful, respectful translator specializing in endangered and Indigenous languages. " +
        "You preserve cultural nuance and never invent words you are unsure of — if a concept has no direct " +
        "equivalent, translate the meaning and explain briefly in the note. Keep translations natural and spoken, " +
        "as a kind local would actually say them.",
      prompt:
        `Translate the following from ${from} into ${to}.\n\n` +
        `TEXT: """${text}"""\n\n` +
        `Respond as JSON with exactly these keys:\n` +
        `{\n` +
        `  "translation": "the text in ${to}",\n` +
        `  "phonetic": "a simple romanized pronunciation a non-reader can sound out",\n` +
        `  "note": "a short, optional usage or cultural tip in ${from} (empty string if none)"\n` +
        `}`,
      temperature: 0.4,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    console.error("[/api/translate]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
