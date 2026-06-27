import { ImageResponse } from "next/og";

export const runtime = "edge";

// Stable PNG endpoint for the PWA manifest (maskable + any).
// File-convention icons (icon.tsx) get a hashed URL that can't be referenced
// statically in manifest.json, so we expose a fixed route instead.
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
          fontSize: 128,
          fontWeight: 700,
        }}
      >
        漲
      </div>
    ),
    { width: 192, height: 192 },
  );
}
