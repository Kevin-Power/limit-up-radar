import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Apple touch icons are displayed on a solid tile; fill the whole
          // square so iOS does not letterbox it on the home screen.
          background: "linear-gradient(135deg, #1a1f2e 0%, #0D1117 100%)",
          color: "#FFFFFF",
          fontSize: 112,
          fontWeight: 700,
        }}
      >
        漲
      </div>
    ),
    {
      ...size,
    },
  );
}
