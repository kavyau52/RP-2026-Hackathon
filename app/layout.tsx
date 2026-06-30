import type { Metadata } from "next";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ori",
  description:
    "Keep your language alive — and let it carry you forward. An AI app for endangered-language speakers and their descendants.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <header className="topbar">
          <Link href="/" className="brand">
            <span className="brand-mark">🪶</span>
            <span className="brand-name">Ori</span>
          </Link>
        </header>
        <main className="container">{children}</main>
        <footer className="footer">
          Built for RP 2026 Hackathon · AI-powered by Google Gemini
        </footer>
      </body>
    </html>
  );
}
