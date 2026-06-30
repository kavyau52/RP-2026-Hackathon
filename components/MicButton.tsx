"use client";

import { useState } from "react";
import { listenOnce, canListen } from "@/lib/speech";

/**
 * A big microphone button. Listens once, then hands the recognized text back
 * to the parent. Used so users can speak instead of type.
 */
export default function MicButton({
  lang,
  onResult,
  size = "lg",
}: {
  lang: string | null;
  onResult: (text: string) => void;
  size?: "md" | "lg";
}) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canListen()) {
    return (
      <p className="hint">
        🎤 Voice input isn’t supported in this browser — try Chrome, or type
        below.
      </p>
    );
  }

  const handle = async () => {
    setError(null);
    setListening(true);
    try {
      const text = await listenOnce(lang);
      if (text) onResult(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not hear you.");
    } finally {
      setListening(false);
    }
  };

  return (
    <div className="mic-wrap">
      <button
        type="button"
        className={`mic-btn mic-btn--${size} ${listening ? "mic-btn--on" : ""}`}
        onClick={handle}
        disabled={listening}
        aria-label="Tap and speak"
      >
        🎤
      </button>
      <span className="mic-label">
        {listening ? "Listening… speak now" : "Tap and speak"}
      </span>
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
