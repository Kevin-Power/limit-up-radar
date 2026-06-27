import { ImageResponse } from "next/og";

export const runtime = "edge";

// Stable PNG endpoint for the PWA manifest (maskable + any).
// Padding keeps the glyph inside the maskable safe zone (~80% of the canvas).
export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0D1117",
          color: "#FFFFFF",
          fontSize: 320,
          fontWeight: 700,
        }}
      >
        漲
      </div>
    ),
    { width: 512, height: 512 },
  );
}
