import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt = "股文觀指 — 台股漲停族群分類平台";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "96px",
          background:
            "linear-gradient(135deg, #1a1f2e 0%, #0D1117 60%, #07080c 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 34,
            fontWeight: 600,
            color: "#F97316",
            letterSpacing: "0.08em",
            marginBottom: 28,
          }}
        >
          AI 驅動 · 台股漲停雷達
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 120,
            fontWeight: 700,
            color: "#FFFFFF",
            lineHeight: 1.05,
            marginBottom: 32,
          }}
        >
          股文觀指
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 40,
            fontWeight: 400,
            color: "#9CA3AF",
            lineHeight: 1.4,
            maxWidth: 900,
          }}
        >
          即時漲停板追蹤 · 族群歸類 · 隔日表現統計 · 策略回測
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 56,
            width: 220,
            height: 8,
            borderRadius: 4,
            background: "linear-gradient(90deg, #EF4444 0%, #F97316 100%)",
          }}
        />
      </div>
    ),
    {
      ...size,
    },
  );
}
