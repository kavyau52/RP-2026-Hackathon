"use client";

import Link from "next/link";
import { useLangs } from "@/lib/useLangs";
import type { Language } from "@/lib/languages";

/**
 * Wraps a page that needs the user's language selection. Shows a friendly
 * prompt to go pick languages if they haven't yet; otherwise renders the page
 * with the resolved Language objects.
 */
export default function SetupGuard({
  children,
}: {
  children: (ctx: {
    heritage: string;
    mainstream: string;
    heritageLang?: Language;
    mainstreamLang?: Language;
  }) => React.ReactNode;
}) {
  const { langs, heritageLang, mainstreamLang, ready } = useLangs();

  if (!ready) {
    return (
      <div className="loading-block">
        <span className="spinner" /> Loading…
      </div>
    );
  }

  if (!langs) {
    return (
      <div className="card center stack">
        <div style={{ fontSize: 42 }}>🪶</div>
        <h2 className="section" style={{ marginTop: 0 }}>
          First, choose your language
        </h2>
        <p className="muted">
          Mother Tongue personalizes everything to your heritage language and
          the city language you need.
        </p>
        <div>
          <Link href="/" className="btn">
            Choose languages
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {children({
        heritage: langs.heritage,
        mainstream: langs.mainstream,
        heritageLang,
        mainstreamLang,
      })}
    </>
  );
}
