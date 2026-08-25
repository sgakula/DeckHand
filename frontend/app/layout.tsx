import type { Metadata, Viewport } from "next";
import { Google_Sans, Google_Sans_Code } from "next/font/google";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

/**
 * Google Sans went SIL OFL in December 2025, so this is Google's actual UI
 * typeface rather than a lookalike. `opsz` is driven automatically by
 * font-size; `GRAD` is loaded so dark mode can compensate optically without
 * changing metrics (see globals.css).
 */
const googleSans = Google_Sans({
  subsets: ["latin"],
  axes: ["opsz", "GRAD"],
  weight: "variable",
  variable: "--font-sans-loaded",
  display: "swap",
  fallback: ["Roboto", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

const googleSansCode = Google_Sans_Code({
  subsets: ["latin"],
  weight: "variable",
  variable: "--font-mono-loaded",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
});

export const metadata: Metadata = {
  title: "Deckhand",
  description:
    "An agent that prepares, presents, and follows up on your pitch — end to end.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1014" },
  ],
};

/**
 * Resolves the theme before first paint, otherwise the page renders in one
 * theme for a frame and snaps to the other. Deckhand defaults to dark rather
 * than following the OS: the product is a canvas for white slides, and the
 * dark shell is part of its identity. An explicit choice still wins.
 */
const themeBootstrap = `
try {
  var t = localStorage.getItem("deckhand-theme");
  document.documentElement.dataset.theme = (t === "light" || t === "dark") ? t : "dark";
} catch (e) {
  document.documentElement.dataset.theme = "dark";
}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${googleSans.variable} ${googleSansCode.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
