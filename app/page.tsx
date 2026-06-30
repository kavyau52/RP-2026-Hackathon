"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  HERITAGE_LANGUAGES,
  MAINSTREAM_LANGUAGES,
} from "@/lib/languages";
import { useLangs } from "@/lib/useLangs";

export default function Home() {
  const { langs, ready, save } = useLangs();
  const [heritage, setHeritage] = useState("");
  const [mainstream, setMainstream] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (langs) {
      setHeritage(langs.heritage);
      setMainstream(langs.mainstream);
    }
  }, [langs]);

  const ledger = heritage && mainstream;

  const onSave = () => {
    if (ledger) save({ heritage, mainstream });
  };

  const goTo = (path: string) => {
  if (!heritage || !mainstream) return;
  save({ heritage, mainstream });
  router.push(path);
  };

  return (
    <div className="stack">
      <section className="hero">
        <span className="eyebrow">RP 2026 Hackathon</span>
        <h1>Keep your language alive — and let it carry you forward.</h1>
        <p className="lead">
          Mother Tongue helps people who speak an endangered language thrive in
          the modern world, and helps their children and grandchildren
          reconnect with the language of their roots. Voice-first, built for
          everyone — even if you can’t read.
        </p>
      </section>

      <section className="card">
        <h2 className="section" style={{ marginTop: 0 }}>
          1 · Choose your language
        </h2>
        <div className="row">
          <div>
            <label className="field">Your heritage language</label>
            <select
              value={heritage}
              onChange={(e) => setHeritage(e.target.value)}
            >
              <option value="">Select a language…</option>
              {HERITAGE_LANGUAGES.map((l) => (
                <option key={l.code} value={l.name}>
                  {l.name}
                  {l.endonym ? ` — ${l.endonym}` : ""} ({l.region})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field">The city / world language you need</label>
            <select
              value={mainstream}
              onChange={(e) => setMainstream(e.target.value)}
            >
              <option value="">Select a language…</option>
              {MAINSTREAM_LANGUAGES.map((l) => (
                <option key={l.code} value={l.name}>
                  {l.name}
                  {l.endonym ? ` — ${l.endonym}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <button className="btn" onClick={onSave} disabled={!ledger}>
            Save my languages
          </button>
          {ready && langs && (
            <span className="pill-tag" style={{ marginLeft: 12 }}>
              ✓ {langs.heritage} ⇄ {langs.mainstream}
            </span>
          )}
        </div>
      </section>

      <section>
        <h2 className="section">2 · Choose how Mother Tongue helps you</h2>
        <div className="mode-grid">
          <button
            type="button"
            className="mode-card mode-card--bridge"
            onClick={() => goTo("/speaker")}
            disabled={!heritage || !mainstream}
          >
            <div className="mode-icon">🌉</div>
            <h3>Bridge</h3>
            <p>
              I speak my language and want to get by in the city — at the
              doctor, the market, on the bus, and at work. Translate by voice,
              learn survival phrases, and find a job.
            </p>
            <span className="who">For speakers of the language →</span>
          </button>

        <button
          type="button"
          className="mode-card mode-card--roots"
          onClick={() => goTo("/heritage")}
          disabled={!heritage || !mainstream}
        >
            <div className="mode-icon">🌱</div>
            <h3>Roots</h3>
            <p>
              My family speaks this language and I want to reconnect with it.
              Learn recipes, myths, history, and songs — in the language — with
              fun quizzes and a daily streak.
            </p>
            <span className="who">For children &amp; grandchildren →</span>
          </button>
        </div>
        {!langs && (
          <p className="hint" style={{ marginTop: 12 }}>
            Tip: pick your languages above first so everything is personalized.
          </p>
        )}
      </section>
    </div>
  );
}
