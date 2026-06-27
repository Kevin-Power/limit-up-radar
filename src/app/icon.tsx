import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = { width: 192, height: 192 };
export const contentType = "image/png";

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
          background: "#0D1117",
          color: "#FFFFFF",
          fontSize: 120,
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
