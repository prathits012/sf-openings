"use client";

import { useState } from "react";

// Native share on mobile, copy-link fallback on desktop.
export default function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  async function onShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const nav: any = typeof navigator !== "undefined" ? navigator : {};
    if (nav.share) {
      try { await nav.share({ title, url }); } catch {}
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  }
  return (
    <button className="linkbtn" onClick={onShare}>{copied ? "Link copied ✓" : "Share"}</button>
  );
}
