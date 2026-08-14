import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

// Favicon: green location pin on dark, matching the app.
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
          color: "#3ddc84",
          fontSize: 44,
        }}
      >
        ◉
      </div>
    ),
    size
  );
}
