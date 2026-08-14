import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

// Favicon: a green "pin" dot on dark — drawn as shapes (no font glyph, which
// Satori can't always source).
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0d1117",
          borderRadius: 14,
        }}
      >
        <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#3ddc84" }} />
      </div>
    ),
    size
  );
}
