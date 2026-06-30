"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import SetupGuard from "@/components/SetupGuard";
import MicButton from "@/components/MicButton";
import SpeakButton from "@/components/SpeakButton";
import { TOPICS } from "@/lib/languages";
import type { Language } from "@/lib/languages";
import type { Phrase, TranslateResult, JobMatch } from "@/lib/types";

type Tab = "translate" | "phrases" | "jobs";

export default function SpeakerPage() {
  return (
    <SetupGuard>
      {({ heritage, mainstream, heritageLang, mainstreamLang }) => (
        <Bridge
          heritage={heritage}
          mainstream={mainstream}
          heritageLang={heritageLang}
          mainstreamLang={mainstreamLang}
        />
      )}
    </SetupGuard>
  );
}

function Bridge({
  heritage,
  mainstream,
  heritageLang,
  mainstreamLang,
}: {
  heritage: string;
  mainstream: string;
  heritageLang?: Language;
  mainstreamLang?: Language;
}) {
  const [tab, setTab] = useState<Tab>("translate");

  return (
    <div>
      <Link href="/" className="back-link">
        ← Home
      </Link>
      <span className="pill-tag">🌉 Bridge · {heritage} ⇄ {mainstream}</span>
      <h1 style={{ marginTop: 4 }}>Get by in the city</h1>

      <div className="tabs">
        <button
          className={`tab ${tab === "translate" ? "active" : ""}`}
          onClick={() => setTab("translate")}
        >
          🗣️ Translate
        </button>
        <button
          className={`tab ${tab === "phrases" ? "active" : ""}`}
          onClick={() => setTab("phrases")}
        >
          📚 Phrasebook
        </button>
        <button
          className={`tab ${tab === "jobs" ? "active" : ""}`}
          onClick={() => setTab("jobs")}
        >
          🧰 Find work
        </button>
      </div>

      {tab === "translate" && (
        <Translate
          heritage={heritage}
          mainstream={mainstream}
          heritageLang={heritageLang}
          mainstreamLang={mainstreamLang}
        />
      )}
      {tab === "phrases" && (
        <Phrasebook
          heritage={heritage}
          mainstream={mainstream}
          heritageLang={heritageLang}
          mainstreamLang={mainstreamLang}
        />
      )}
      {tab === "jobs" && (
        <Jobs
          heritage={heritage}
          mainstream={mainstream}
          heritageLang={heritageLang}
        />
      )}
    </div>
  );
}

/* ------------------------------- Translate ------------------------------- */
function Translate({
  heritage,
  mainstream,
  heritageLang,
  mainstreamLang,
}: {
  heritage: string;
  mainstream: string;
  heritageLang?: Language;
  mainstreamLang?: Language;
}) {
  // direction: true = mainstream→heritage (understand the city),
  //            false = heritage→mainstream (make myself understood).
  const [toHeritage, setToHeritage] = useState(true);
  const [text, setText] = useState("");
  const [result, setResult] = useState<TranslateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = toHeritage ? mainstream : heritage;
  const to = toHeritage ? heritage : mainstream;
  const sourceLang = toHeritage ? mainstreamLang : heritageLang;
  const targetLang = toHeritage ? heritageLang : mainstreamLang;

  const run = async (value: string) => {
    if (!value.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, from, to }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Translation failed.");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <strong>{from}</strong>
        <button
          className="btn btn--ghost swap-btn"
          onClick={() => {
            setToHeritage((v) => !v);
            setResult(null);
            setText("");
          }}
          aria-label="Swap direction"
        >
          ⇄
        </button>
        <strong>{to}</strong>
      </div>

      <p className="hint" style={{ marginTop: 8 }}>
        {toHeritage
          ? "Hear what someone said to you, in your language."
          : "Say it in your language — we’ll give you the city words."}
      </p>

      <div style={{ margin: "18px 0", textAlign: "center" }}>
        <MicButton
          lang={sourceLang?.bcp47 ?? null}
          onResult={(t) => {
            setText(t);
            run(t);
          }}
        />
      </div>

      <label className="field">…or type it</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Type ${from} here`}
      />
      <div style={{ marginTop: 12 }}>
        <button
          className="btn btn--bridge"
          onClick={() => run(text)}
          disabled={loading || !text.trim()}
        >
          {loading ? <span className="spinner" /> : "Translate"}
        </button>
      </div>

      {error && (
        <p className="error-text" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}

      {result && (
        <div className="translate-out">
          <div className="big">
            <span>{result.translation}</span>
            <SpeakButton text={result.translation} lang={targetLang?.bcp47 ?? null} />
          </div>
          {result.phonetic && (
            <div className="phonetic">🔤 {result.phonetic}</div>
          )}
          {result.note && <div className="note">💡 {result.note}</div>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Phrasebook ------------------------------ */
function Phrasebook({
  heritage,
  mainstream,
  heritageLang,
  mainstreamLang,
}: {
  heritage: string;
  mainstream: string;
  heritageLang?: Language;
  mainstreamLang?: Language;
}) {
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const [customText, setCustomText] = useState("");
  const [customResult, setCustomResult] = useState<TranslateResult | null>(null);
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  const translateCustomPhrase = async (value: string) => {
    if (!value.trim()) return;

    setCustomLoading(true);
    setCustomError(null);
    setCustomResult(null);

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: value,
          from: mainstream,
          to: heritage,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Could not translate phrase.");

      setCustomResult(data);
    } catch (e) {
      setCustomError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setCustomLoading(false);
    }
  };

  const loadTopic = async (topicId: string, situation: string) => {
    const id = ++requestId.current;

    setActiveTopic(topicId);
    setLoading(true);
    setError(null);
    setPhrases([]);

    try {
      const res = await fetch("/api/phrases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situation, mainstream, heritage }),
      });

      const data = await res.json();

      if (id !== requestId.current) return;

      if (!res.ok) throw new Error(data.error || "Could not load phrases.");

      setPhrases(data.phrases || []);
    } catch (e) {
      if (id !== requestId.current) return;

      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      if (id === requestId.current) {
        setLoading(false);
      }
    }
  };

  return (
    <div>
      <p className="hint">Tap a place. We’ll give you the words you need there.</p>
      <div className="tile-grid">
        {TOPICS.map((t) => (
          <button
            key={t.id}
            className={`tile ${activeTopic === t.id ? "active" : ""}`}
            onClick={() => loadTopic(t.id, t.situation)}
            disabled={loading}
          >
            <span className="tile-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="loading-block">
          <span className="spinner" /> Preparing your phrases…
        </div>
      )}
      {error && <p className="error-text">{error}</p>}

      {phrases.length > 0 && (
        <>
          <div className="card" style={{ marginTop: 18 }}>
            <h2 className="section" style={{ marginTop: 0 }}>
              Ask for your own phrase
            </h2>

            <p className="hint">
              Type or speak a specific thing you need to say. We’ll translate it into{" "}
              {heritage}.
            </p>

            <div style={{ margin: "18px 0", textAlign: "center" }}>
              <MicButton
                lang={mainstreamLang?.bcp47 ?? null}
                onResult={(t) => {
                  setCustomText(t);
                  translateCustomPhrase(t);
                }}
              />
            </div>

            <textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder={`Type a phrase in ${mainstream}`}
            />

            <div style={{ marginTop: 12 }}>
              <button
                className="btn btn--bridge"
                onClick={() => translateCustomPhrase(customText)}
                disabled={customLoading || !customText.trim()}
              >
                {customLoading ? <span className="spinner" /> : "Translate this phrase"}
              </button>
            </div>

            {customError && (
              <p className="error-text" style={{ marginTop: 12 }}>
                {customError}
              </p>
            )}

            {customResult && (
              <div className="translate-out">
                <div className="big">
                  <span>{customResult.translation}</span>
                  <SpeakButton
                    text={customResult.translation}
                    lang={heritageLang?.bcp47 ?? null}
                  />
                </div>

                {customResult.phonetic && (
                  <div className="phonetic">🔤 {customResult.phonetic}</div>
                )}

                {customResult.note && <div className="note">💡 {customResult.note}</div>}
              </div>
            )}
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            {phrases.map((p, i) => (
              <div className="phrase" key={i}>
                <SpeakButton
                  text={p.heritage}
                  lang={heritageLang?.bcp47 ?? null}
                  label="Hear it in your language"
                />
                <div className="body">
                  <div className="situation">{p.situation}</div>
                  <div className="heritage-text">{p.heritage}</div>
                  <div className="phonetic">🔤 {p.phonetic}</div>
                  <div className="mainstream-text">
                    {p.mainstream}{" "}
                    <SpeakButton
                      text={p.mainstream}
                      lang={mainstreamLang?.bcp47 ?? null}
                      size="sm"
                      label={`Hear it in ${mainstream}`}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------- Jobs --------------------------------- */
function Jobs({
  heritage,
  mainstream,
  heritageLang,
}: {
  heritage: string;
  mainstream: string;
  heritageLang?: Language;
}) {
  const [skills, setSkills] = useState("");
  const [jobs, setJobs] = useState<JobMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (value: string) => {
    if (!value.trim()) return;
    setLoading(true);
    setError(null);
    setJobs([]);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills: value, heritage, mainstream }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not find work.");
      setJobs(data.jobs || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h2 className="section" style={{ marginTop: 0 }}>
        What work can you do?
      </h2>
      <p className="hint">
        Tell us what you’re good at — farming, cooking, sewing, fixing things,
        caring for people. Speak in your own language. We’ll find jobs that fit.
      </p>

      <div style={{ margin: "18px 0", textAlign: "center" }}>
        <MicButton
          lang={heritageLang?.bcp47 ?? null}
          onResult={(t) => {
            setSkills(t);
            run(t);
          }}
        />
      </div>

      <textarea
        value={skills}
        onChange={(e) => setSkills(e.target.value)}
        placeholder="e.g. I grew rice and vegetables, I can cook for many people, I am strong and careful"
      />
      <div style={{ marginTop: 12 }}>
        <button
          className="btn btn--bridge"
          onClick={() => run(skills)}
          disabled={loading || !skills.trim()}
        >
          {loading ? <span className="spinner" /> : "Find jobs for me"}
        </button>
      </div>

      {error && (
        <p className="error-text" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}

      {jobs.length > 0 && (
        <div className="stack" style={{ marginTop: 18 }}>
          {jobs.map((j, i) => (
            <div
              key={i}
              className="translate-out"
              style={{ background: "#fff", borderColor: "var(--line)" }}
            >
              <div className="big" style={{ fontSize: 20 }}>
                💼 {j.title}
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 18,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                {j.whyHeritage}
                <SpeakButton text={j.whyHeritage} lang={heritageLang?.bcp47 ?? null} />
              </div>
              <div className="note">{j.whyMainstream}</div>
              <div
                className="note"
                style={{ marginTop: 8, color: "var(--bridge)", fontWeight: 700 }}
              >
                👉 {j.nextStepHeritage}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
