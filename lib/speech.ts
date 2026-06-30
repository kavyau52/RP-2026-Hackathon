"use client";

/**
 * Thin wrappers around the browser Web Speech API. These power the voice-first,
 * low-literacy experience: tap to hear any text, tap to speak instead of type.
 *
 * Everything degrades gracefully — if a browser or language has no voice, the
 * UI simply falls back to text.
 */

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function canListen(): boolean {
  return (
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
  );
}

let voicesCache: SpeechSynthesisVoice[] = [];

function loadVoices(): SpeechSynthesisVoice[] {
  if (!canSpeak()) return [];
  const v = window.speechSynthesis.getVoices();
  if (v.length) voicesCache = v;
  return voicesCache;
}

if (canSpeak()) {
  // Voices load asynchronously in some browsers.
  window.speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices();
}

/** Speaks `text` aloud. `lang` is a BCP-47 tag (e.g. "es-ES"); null = default. */
export function speak(text: string, lang: string | null): void {
  if (!canSpeak() || !text) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  if (lang) {
    utter.lang = lang;
    const match =
      loadVoices().find((v) => v.lang === lang) ||
      loadVoices().find((v) => v.lang.startsWith(lang.split("-")[0]));
    if (match) utter.voice = match;
  }
  utter.rate = 0.92;
  window.speechSynthesis.speak(utter);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

/**
 * Listens for one utterance and resolves with the recognized text.
 * Rejects if speech recognition is unavailable or errors.
 */
export function listenOnce(lang: string | null): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!canListen()) {
      reject(new Error("Speech recognition is not supported in this browser."));
      return;
    }
    // The Web Speech API types are inconsistent across browsers and TS lib
    // versions, so we treat the recognizer as `any` and feature-detect.
    const w = window as unknown as Record<string, unknown>;
    const SR = (w.SpeechRecognition || w.webkitSpeechRecognition) as
      | (new () => unknown)
      | undefined;
    if (!SR) {
      reject(new Error("Speech recognition is not supported in this browser."));
      return;
    }
    const recognition = new SR() as {
      lang: string;
      interimResults: boolean;
      maxAlternatives: number;
      onresult: (event: unknown) => void;
      onerror: (event: unknown) => void;
      start: () => void;
    };
    recognition.lang = lang || "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: unknown) => {
      const e = event as { results: { 0: { 0: { transcript: string } } } };
      resolve(e.results[0][0].transcript);
    };
    recognition.onerror = (event: unknown) => {
      const e = event as { error?: string };
      reject(new Error(e.error || "Could not hear you. Please try again."));
    };
    recognition.start();
  });
}
