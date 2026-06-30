"use client";

import { useEffect, useState } from "react";
import { findLanguage, type Language } from "./languages";

const STORAGE_KEY = "mt:langs";

export interface LangSelection {
  heritage: string;
  mainstream: string;
}

/**
 * Reads/writes the user's chosen heritage + mainstream languages from
 * localStorage so the choice persists across pages and reloads.
 */
export function useLangs() {
  const [langs, setLangs] = useState<LangSelection | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setLangs(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const save = (next: LangSelection) => {
    setLangs(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const heritageLang: Language | undefined = langs
    ? findLanguage(langs.heritage)
    : undefined;
  const mainstreamLang: Language | undefined = langs
    ? findLanguage(langs.mainstream)
    : undefined;

  return { langs, heritageLang, mainstreamLang, ready, save };
}
