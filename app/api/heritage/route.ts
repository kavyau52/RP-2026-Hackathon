import { NextRequest, NextResponse } from "next/server";
import { generateJSON } from "@/lib/gemini";
import type { HeritageContent } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Generates an engaging piece of cultural content (recipe, folk tale, history,
 * proverb/song) in the heritage language, with a side-by-side translation, a
 * vocabulary list, and a short quiz to make learning gamified.
 */
export async function POST(req: NextRequest) {
  try {
    const { kind, heritage, mainstream, seed } = await req.json();
    if (!kind || !heritage || !mainstream) {
      return NextResponse.json(
        { error: "kind, heritage, and mainstream are required." },
        { status: 400 }
      );
    }

    const content = await generateJSON<HeritageContent>({
      system:
        "You are a beloved elder and storyteller helping young people reconnect with their heritage language. " +
        "You create warm, authentic, age-appropriate cultural content. Keep the heritage text short enough for a " +
        "beginner (about 4-8 short lines). Make the translation line-for-line so a learner can follow along. " +
        "Be culturally accurate and respectful; never stereotype.",
      prompt:
        `Create ${kind} for the ${heritage} language and culture.\n` +
        (seed ? `Theme or request from the learner: ${seed}\n` : "") +
        `The learner reads ${mainstream}.\n\n` +
        `Respond as JSON:\n` +
        `{\n` +
        `  "title": "a short title in ${mainstream}",\n` +
        `  "heritage": "the content written in ${heritage} (4-8 short lines, use \\n between lines)",\n` +
        `  "translation": "line-for-line translation in ${mainstream} (same number of lines, use \\n)",\n` +
        `  "vocab": [ { "heritage": "a key word", "meaning": "its meaning in ${mainstream}" } ],\n` +
        `  "quiz": [ { "question": "a fun comprehension question in ${mainstream}", "options": ["a","b","c"], "answer": 0 } ]\n` +
        `}\n` +
        `Include 4 vocab items and 3 quiz questions. "answer" is the 0-based index of the correct option.`,
      temperature: 0.8,
      maxOutputTokens: 2048,
    });

    return NextResponse.json(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    console.error("[/api/heritage]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
