/**
 * Font configuration with CI fallback.
 *
 * In CI/offline environments, Google Font fetches fail at build time.
 * Set NEXT_PUBLIC_CI_BUILD=1 to skip Google Fonts and use system fallbacks.
 *
 * Usage:
 *   NEXT_PUBLIC_CI_BUILD=1 npm run build
 */

type FontDef = { variable: string; className: string };

function systemFallback(variable: string): FontDef {
  return { variable: "", className: "" };
}

let geistSans: FontDef;
let geistMono: FontDef;
let notoSerifKR: FontDef;

if (process.env.NEXT_PUBLIC_CI_BUILD === "1") {
  // Skip Google Font network requests entirely in CI
  geistSans = systemFallback("--font-geist-sans");
  geistMono = systemFallback("--font-geist-mono");
  notoSerifKR = systemFallback("--font-serif-kr");
} else {
  // Dynamic require so the import is tree-shaken in CI builds
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const google = require("next/font/google");
  geistSans = google.Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
  });
  geistMono = google.Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
  });
  notoSerifKR = google.Noto_Serif_KR({
    variable: "--font-serif-kr",
    subsets: ["latin"],
    weight: ["400", "700"],
  });
}

export { geistSans, geistMono, notoSerifKR };
