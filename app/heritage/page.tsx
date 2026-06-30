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
          categoryId: category.id,
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
          heritage={heritage}
          heritageLang={heritageLang}
          mainstreamLang={mainstreamLang}
          mainstream={mainstream}
          showRecipeGame={category.id === "recipe"}
          onQuizComplete={(correct) => addPoints(correct * 10, true)}
          onGameComplete={(correct) => addPoints(correct * 15, false)}
        />
      )}
    </div>
  );
}

/* -------------------------------- Lesson --------------------------------- */
function Lesson({
  content,
  heritage,
  heritageLang,
  mainstreamLang,
  mainstream,
  showRecipeGame,
  onQuizComplete,
  onGameComplete,
}: {
  content: HeritageContent;
  heritage: string;
  heritageLang?: Language;
  mainstreamLang?: Language;
  mainstream: string;
  showRecipeGame: boolean;
  onQuizComplete: (correct: number) => void;
  onGameComplete: (correct: number) => void;
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

      {showRecipeGame && (content.recipeGame || content.vocab?.length > 0) && (
        <RecipeGame
          recipeGame={content.recipeGame}
          vocab={content.vocab}
          heritage={heritage}
          heritageLang={heritageLang}
          mainstream={mainstream}
          onComplete={onGameComplete}
        />
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


/* ------------------------------ Recipe Game ------------------------------ */
function RecipeGame({
  recipeGame,
  vocab,
  heritage,
  heritageLang,
  mainstream,
  onComplete,
}: {
  recipeGame?: HeritageContent["recipeGame"];
  vocab: HeritageContent["vocab"];
  heritage: string;
  heritageLang?: Language;
  mainstream: string;
  onComplete: (correct: number) => void;
}) {
  const required = getRequiredIngredients(recipeGame, vocab);
  const cards = getCookingCards(recipeGame, vocab);
  const [added, setAdded] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [message, setMessage] = useState("Choose the ingredients grandma asked for.");
  const [smoky, setSmoky] = useState(false);
  const [completed, setCompleted] = useState(false);

  const requiredMeanings = required.map((item) => item.meaning);
  const dish = recipeGame?.dish || "Family stew";
  const completeEmoji = recipeGame?.completeEmoji || "🍲";
  const isComplete = required.length > 0 && added.length === required.length;

  const addIngredient = (meaning: string) => {
    if (completed || added.includes(meaning)) return;

    const card = cards.find((item) => item.meaning === meaning);
    if (!card) return;

    if (!requiredMeanings.includes(meaning)) {
      setMistakes((n) => n + 1);
      setSmoky(true);
      setMessage(`${card.meaning} makes black smoke. Try another ingredient.`);
      window.setTimeout(() => setSmoky(false), 900);
      return;
    }

    const nextAdded = [...added, meaning];
    setAdded(nextAdded);
    setSmoky(false);
    setMessage(`${card.meaning} went into the pot.`);

    if (nextAdded.length === required.length) {
      setCompleted(true);
      setMessage(`${dish} is ready.`);
      onComplete(Math.max(required.length - mistakes, 1));
    }
  };

  if (required.length === 0 || cards.length === 0) return null;

  return (
    <div className="recipe-game">
      <h2 className="section" style={{ marginTop: 0 }}>
        Cook with grandma
      </h2>
      <p className="hint">
        Add the right ingredients to make {dish}. The cards use {heritage}, with
        {" "}{mainstream} underneath.
      </p>

      <div className="cook-play-area">
        <div className={`cook-pot-large ${smoky ? "smoky" : ""} ${isComplete ? "complete" : ""}`}>
          <div className="smoke-cloud" aria-hidden="true" />
          <div className="pot-emoji" aria-hidden="true">
            {isComplete ? completeEmoji : "🍲"}
          </div>
          <div className="pot-contents">
            {added.length === 0
              ? "Empty pot"
              : added.map((meaning) => cards.find((card) => card.meaning === meaning)?.emoji).join(" ")}
          </div>
        </div>

        <div className="cook-status">
          <strong>{message}</strong>
          <span>
            {added.length} / {required.length} ingredients added
          </span>
        </div>
      </div>

      <div className="ingredient-grid">
        {cards.map((card) => {
          const used = added.includes(card.meaning);
          return (
            <div
              key={`${card.heritage}-${card.meaning}`}
              role="button"
              tabIndex={used || completed ? -1 : 0}
              aria-disabled={used || completed}
              className={`ingredient-card ${used ? "used" : ""}`}
              onClick={() => addIngredient(card.meaning)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  addIngredient(card.meaning);
                }
              }}
            >
              <span className="ingredient-art" aria-hidden="true">
                {card.emoji}
              </span>
              <span className="ingredient-heritage">{card.heritage}</span>
              <SpeakButton
                text={card.heritage}
                lang={heritageLang?.bcp47 ?? null}
                size="sm"
                label="Hear ingredient"
              />
              <span className="ingredient-meaning">{card.meaning}</span>
            </div>
          );
        })}
      </div>

      {completed && (
        <div className="cook-complete">
          <div className="cook-pot" aria-hidden="true">
            {completeEmoji}
          </div>
          <strong>{dish} complete!</strong>
          <span>+{Math.max(required.length - mistakes, 1) * 15} points</span>
        </div>
      )}
    </div>
  );
}

function getRequiredIngredients(
  recipeGame: HeritageContent["recipeGame"] | undefined,
  vocab: HeritageContent["vocab"]
) {
  if (recipeGame?.ingredients?.length) return recipeGame.ingredients.slice(0, 4);
  return vocab.slice(0, 4).map((item) => ({
    ...item,
    emoji: emojiForIngredient(item.meaning),
  }));
}

function getCookingCards(
  recipeGame: HeritageContent["recipeGame"] | undefined,
  vocab: HeritageContent["vocab"]
) {
  const required = getRequiredIngredients(recipeGame, vocab);
  const decoys = recipeGame?.decoys?.length
    ? recipeGame.decoys.slice(0, 3)
    : [
        { heritage: "salt", meaning: "salt", emoji: "🧂" },
        { heritage: "apple", meaning: "apple", emoji: "🍎" },
        { heritage: "fish", meaning: "fish", emoji: "🐟" },
      ];

  return [...required, ...decoys]
    .filter((item, index, all) => all.findIndex((other) => other.meaning === item.meaning) === index)
    .sort((a, b) => a.meaning.localeCompare(b.meaning));
}

function emojiForIngredient(meaning: string) {
  const lower = meaning.toLowerCase();
  if (lower.includes("potato")) return "🥔";
  if (lower.includes("carrot")) return "🥕";
  if (lower.includes("onion")) return "🧅";
  if (lower.includes("meat") || lower.includes("beef") || lower.includes("lamb")) return "🥩";
  if (lower.includes("corn")) return "🌽";
  if (lower.includes("bean")) return "🫘";
  if (lower.includes("tomato")) return "🍅";
  if (lower.includes("rice")) return "🍚";
  if (lower.includes("water")) return "💧";
  return "🥣";
}
