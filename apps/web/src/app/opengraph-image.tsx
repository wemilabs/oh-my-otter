import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Oh My Otter: agent-readiness benchmarks";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
        background: "rgb(252 252 252)",
        color: "rgb(25 25 25)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontSize: 34,
          fontWeight: 600,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: "rgb(25 25 25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgb(252 252 252)",
            fontSize: 30,
          }}
        >
          ~
        </div>
        Oh My Otter
      </div>
      <div
        style={{
          marginTop: 40,
          fontSize: 64,
          fontWeight: 500,
          letterSpacing: "-0.03em",
          lineHeight: 1.1,
          maxWidth: 900,
        }}
      >
        Find out how ready your repo is for any coding agent
      </div>
      <div
        style={{
          marginTop: 28,
          fontSize: 28,
          color: "rgb(110 110 110)",
        }}
      >
        Scan · benchmark · compare anonymous results
      </div>
    </div>,
    { ...size },
  );
}
