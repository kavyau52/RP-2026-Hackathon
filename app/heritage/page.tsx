"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import SetupGuard from "@/components/SetupGuard";
import SpeakButton from "@/components/SpeakButton";
import { HERITAGE_CATEGORIES } from "@/lib/languages";
import type { Language } from "@/lib/languages";
import type { HeritageContent } from "@/lib/types";

export default function HeritagePage() {
  return (
    <SetupGuard>
      {({ heritage, mainstream, heritageLang, mainstreamLang }) => (
        <Roots
          heritage={heritage}
          mainstream={mainstream}
          heritageLang={heritageLang}
          mainstreamLang={mainstreamLang}
        />
      )}
    </SetupGuard>
  );
}

const STREAK_KEY = "mt:roots-progress";

function Roots({
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
  const [categoryId, setCategoryId] = useState(HERITAGE_CATEGORIES[0].id);
  const [seed, setSeed] = useState("");
  const [content, setContent] = useState<HeritageContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [points, setPoints] = useState(0);
  const [lessons, setLessons] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STREAK_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        setPoints(p.points || 0);
        setLessons(p.lessons || 0);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const addPoints = (n: number, lessonDone: boolean) => {
    setPoints((prev) => {
      const next = prev + n;
      const nextLessons = lessons + (lessonDone ? 1 : 0);
      try {
        localStorage.setItem(
          STREAK_KEY,
          JSON.stringify({ points: next, lessons: nextLessons })
        );
      } catch {
        /* ignore */
      }
      if (lessonDone) setLessons(nextLessons);
      return next;
    });
  };

  const category = HERITAGE_CATEGORIES.find((c) => c.id === categoryId)!;

  const generate = async () => {
    setLoading(true);
    setError(null);
    setContent(null);
    try {
      const res = await fetch("/api/heritage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: category.kind,
          heritage,
          mainstream,
          seed,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create the lesson.");
      setContent(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Link href="/" className="back-link">
        ← Home
      </Link>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <span className="pill-tag">🌱 Roots · {heritage}</span>
          <h1 style={{ marginTop: 4 }}>Reconnect with your roots</h1>
        </div>
        <div className="score-pill">
          <span className="flame">🔥</span> {points} pts · {lessons} lessons
        </div>
      </div>

      <p className="hint">Pick what you’d like to learn today.</p>
      <div className="tile-grid">
        {HERITAGE_CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={`tile ${categoryId === c.id ? "active" : ""}`}
            onClick={() => setCategoryId(c.id)}
          >
            <span className="tile-icon">{c.icon}</span>
            {c.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <label className="field" style={{ marginTop: 0 }}>
          Anything special you want? (optional)
        </label>
        <input
          type="text"
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          placeholder="e.g. a tale about the moon, grandma’s soup, a harvest festival"
        />
        <div style={{ marginTop: 14 }}>
          <button
            className="btn btn--roots"
            onClick={generate}
            disabled={loading}
          >
            {loading ? <span className="spinner" /> : `✨ Create a ${category.label} lesson`}
          </button>
        </div>
        {error && (
          <p className="error-text" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}
      </div>

      {loading && (
        <div className="loading-block">
          <span className="spinner" /> Your elder is preparing a story…
        </div>
      )}

      {content && (
        <Lesson
          content={content}
          heritageLang={heritageLang}
          mainstreamLang={mainstreamLang}
          mainstream={mainstream}
          onQuizComplete={(correct) => addPoints(correct * 10, true)}
        />
      )}
    </div>
  );
}

/* -------------------------------- Lesson --------------------------------- */
function Lesson({
  content,
  heritageLang,
  mainstreamLang,
  mainstream,
  onQuizComplete,
}: {
  content: HeritageContent;
  heritageLang?: Language;
  mainstreamLang?: Language;
  mainstream: string;
  onQuizComplete: (correct: number) => void;
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const choose = (qi: number, oi: number) => {
    if (submitted) return;
    setAnswers((a) => ({ ...a, [qi]: oi }));
  };

  const correctCount = content.quiz.reduce(
    (n, q, i) => n + (answers[i] === q.answer ? 1 : 0),
    0
  );

  const submit = () => {
    setSubmitted(true);
    onQuizComplete(correctCount);
  };

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2 className="section" style={{ marginTop: 0 }}>
        {content.title}
      </h2>

      <div className="bilingual">
        <div className="col">
          <h4>
            In your language{" "}
            <SpeakButton
              text={content.heritage}
              lang={heritageLang?.bcp47 ?? null}
              label="Hear the whole story"
            />
          </h4>
          <div className="heritage-body">{content.heritage}</div>
        </div>
        <div className="col">
          <h4>
            In {mainstream}{" "}
            <SpeakButton
              text={content.translation}
              lang={mainstreamLang?.bcp47 ?? null}
              size="sm"
            />
          </h4>
          <div className="translation-body">{content.translation}</div>
        </div>
      </div>

      {content.vocab?.length > 0 && (
        <>
          <h2 className="section">Words to keep 📝</h2>
          <div className="vocab-grid">
            {content.vocab.map((v, i) => (
              <div className="vocab-item" key={i}>
                <SpeakButton
                  text={v.heritage}
                  lang={heritageLang?.bcp47 ?? null}
                  size="sm"
                />
                <span className="vh">{v.heritage}</span>
                <span className="vm">— {v.meaning}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {content.quiz?.length > 0 && (
        <>
          <h2 className="section">Quick quiz 🎯</h2>
          {content.quiz.map((q, qi) => (
            <div className="quiz-q" key={qi}>
              <div className="q">{q.question}</div>
              <div className="quiz-options">
                {q.options.map((opt, oi) => {
                  let cls = "opt";
                  if (submitted) {
                    if (oi === q.answer) cls += " correct";
                    else if (answers[qi] === oi) cls += " wrong";
                  } else if (answers[qi] === oi) {
                    cls += " correct";
                  }
                  return (
                    <button
                      key={oi}
                      className={cls}
                      onClick={() => choose(qi, oi)}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {!submitted ? (
            <button
              className="btn btn--roots"
              style={{ marginTop: 16 }}
              onClick={submit}
              disabled={Object.keys(answers).length < content.quiz.length}
            >
              Check my answers
            </button>
          ) : (
            <p style={{ marginTop: 16, fontWeight: 800, fontSize: 18 }}>
              🎉 You got {correctCount} / {content.quiz.length} — +
              {correctCount * 10} points!
            </p>
          )}
        </>
      )}
    </div>
  );
}
