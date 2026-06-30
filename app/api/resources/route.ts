import { NextRequest, NextResponse } from "next/server";
import { generateJSON } from "@/lib/gemini";
import type { ResourceTip } from "@/lib/types";

function fallbackTips(category: string): ResourceTip[] {
  return [
    {
      title: "Bring a helper",
      heritageAdvice:
        "Translation is temporarily unavailable. Bring a trusted person who can help you ask questions and understand forms.",
      mainstreamAdvice:
        "Bring a trusted friend, family member, or community helper if you can. They can help you ask questions, understand forms, and remember next steps.",
      phrase: "Can someone help me in my language?",
      phonetic: "kan sum-wun help mee in my lang-gwij",
    },
    {
      title: "Carry key papers",
      heritageAdvice:
        "Translation is temporarily unavailable. Bring your ID, address, phone number, and any papers related to this service.",
      mainstreamAdvice:
        `For ${category}, bring identification, proof of address if you have it, your phone number, and any papers related to the service you need.`,
      phrase: "These are my documents.",
      phonetic: "theez ar my dok-yoo-ments",
    },
    {
      title: "Ask about cost",
      heritageAdvice:
        "Translation is temporarily unavailable. Ask if the service is free, low-cost, or if there is financial help.",
      mainstreamAdvice:
        "Before you agree to anything, ask whether the service is free, low-cost, or if financial help is available.",
      phrase: "Is there a free or low-cost option?",
      phonetic: "iz thair uh free or low-kost op-shun",
    },
    {
      title: "Write it down",
      heritageAdvice:
        "Translation is temporarily unavailable. Ask the worker to write the next step, date, address, or phone number for you.",
      mainstreamAdvice:
        "Ask the worker to write down your next step, appointment date, address, phone number, or documents you need to bring next time.",
      phrase: "Please write that down for me.",
      phonetic: "pleez ryt that down for mee",
    },
  ];
}

export async function POST(req: NextRequest) {
  let category = "local services";

  try {
    const body = await req.json();
    category = body.category ?? category;
    const { heritage, mainstream } = body;

    const tips = await generateJSON<ResourceTip[]>({
      system: `You are a compassionate multilingual assistant helping people who speak an endangered or minority heritage language (${heritage}) navigate city services in a place where ${mainstream} is spoken. Give practical, culturally-aware, easy-to-follow advice. Write heritage-language content in the actual ${heritage} script/language — not in ${mainstream}.`,
      prompt: `Generate exactly 4 practical tips for someone who speaks ${heritage} trying to access "${category}" services in a city where ${mainstream} is the main language.

For each tip return a JSON object with these exact fields:
- "title": short tip title in ${mainstream} (5 words max, e.g. "Bring a helper")
- "heritageAdvice": the advice written in ${heritage} (2–3 sentences, warm and practical)
- "mainstreamAdvice": the same advice in ${mainstream} (2–3 sentences)
- "phrase": one key phrase they might need to say at the ${category}, written in ${heritage}
- "phonetic": romanized phonetic spelling of that phrase so a non-reader can sound it out

Return a JSON array of exactly 4 objects. No other text.`,
      temperature: 0.5,
      maxOutputTokens: 2048,
    });

    return NextResponse.json({ tips });
  } catch {
    return NextResponse.json({ tips: fallbackTips(category), fallback: true });
  }
}
