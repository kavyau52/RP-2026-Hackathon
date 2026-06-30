"use client";

import { speak, canSpeak } from "@/lib/speech";

/**
 * A round "tap to hear" button. Central to the low-literacy experience: it
 * appears next to every piece of text so a user can listen instead of read.
 */
export default function SpeakButton({
  text,
  lang,
  label = "Hear it",
  size = "md",
}: {
  text: string;
  lang: string | null;
  label?: string;
  size?: "sm" | "md";
}) {
  if (!canSpeak()) return null;
  return (
    <button
      type="button"
      className={`speak-btn speak-btn--${size}`}
      onClick={() => speak(text, lang)}
      aria-label={label}
      title={label}
    >
      🔊
    </button>
  );
}
