import type { Metadata } from "next";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

const siteUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "New in SF — new cafes & retail openings",
  description:
    "A live map of new cafes and retail opening across San Francisco — caught from city permit filings and confirmed with fresh web research.",
};

// Set the theme before paint so a dark-mode chooser doesn't flash light.
// Default is light (no stored preference -> "light").
const themeInit = `(function(){try{var t=localStorage.getItem('sf-theme')||'light';document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
