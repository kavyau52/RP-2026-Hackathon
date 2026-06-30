import { NextRequest, NextResponse } from "next/server";
import { generateJSON } from "@/lib/gemini";
import type { JobMatch } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Takes a free-text description of what kind of work a person can do (often
 * spoken, in their own words) and suggests realistic job paths, explained in
 * BOTH their heritage language and the mainstream language, with a next step.
 */
export async function POST(req: NextRequest) {
  try {
    const { skills, heritage, mainstream } = await req.json();
    if (!skills || !heritage || !mainstream) {
      return NextResponse.json(
        { error: "skills, heritage, and mainstream are required." },
        { status: 400 }
      );
    }

    const data = await generateJSON<{ jobs: JobMatch[] }>({
      system:
        "You are a kind employment counselor for people who have just moved from a rural area to a city and speak " +
        "an endangered language. You suggest realistic, dignified entry-level jobs that match their existing skills " +
        "and require limited mainstream-language fluency to start. You explain everything simply and encouragingly.",
      prompt:
        `The person describes their skills/experience like this: """${skills}"""\n` +
        `Their heritage language: ${heritage}\n` +
        `The city's mainstream language: ${mainstream}\n\n` +
        `Suggest 3 realistic jobs. Respond as JSON:\n` +
        `{ "jobs": [ {\n` +
        `  "title": "the job title in ${mainstream}",\n` +
        `  "whyHeritage": "1-2 warm sentences in ${heritage} on why this fits them",\n` +
        `  "whyMainstream": "the same explanation in ${mainstream}",\n` +
        `  "nextStepHeritage": "one concrete next step today, in ${heritage}"\n` +
        `} ] }`,
      temperature: 0.6,
      maxOutputTokens: 1500,
    });

    return NextResponse.json({ jobs: data.jobs ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    console.error("[/api/jobs]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
