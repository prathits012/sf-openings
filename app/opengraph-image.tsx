import { ImageResponse } from "next/og";
import { livePlaces } from "../lib/openings";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "New in SF — new cafes & retail openings";

// The card that shows when the link is shared (iMessage, Slack, X, etc.).
// Note: next/og (Satori) requires display:flex on every div with >1 child.
export default function OG() {
  const live = livePlaces();
  const open = live.filter((p) => p.status === "open" || p.status === "just_opened").length;
  const soon = live.filter((p) => p.status === "coming_soon").length;

  const stat = (n: number, label: string, color: string) => (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{ fontSize: 64, fontWeight: 800, color }}>{n}</span>
      <span style={{ fontSize: 26, color: "#6b7783", letterSpacing: 2 }}>{label}</span>
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0d1117",
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 30, color: "#6b7783", letterSpacing: 4 }}>SAN FRANCISCO</span>
          <div style={{ display: "flex", fontSize: 104, fontWeight: 800, letterSpacing: -3, marginTop: 10 }}>
            <span style={{ color: "#e9edf1" }}>New in </span>
            <span style={{ color: "#3ddc84" }}>&nbsp;SF</span>
          </div>
          <span style={{ fontSize: 38, color: "#9aa6b2", marginTop: 16 }}>
            New cafes and retail, caught from permit filings and confirmed live.
          </span>
        </div>
        <div style={{ display: "flex", gap: 56 }}>
          {stat(open, "OPEN", "#3ddc84")}
          {stat(soon, "COMING SOON", "#f0b45e")}
        </div>
      </div>
    ),
    size
  );
}
