import { ImageResponse } from "next/og";

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
        <svg width="48" height="48" viewBox="0 0 24 24">
          <ellipse cx="12" cy="13.4" rx="10.4" ry="6.9" fill="rgb(25 25 25)" />
          <circle cx="3.6" cy="9.4" r="1.9" fill="rgb(25 25 25)" />
          <circle cx="20.4" cy="9.4" r="1.9" fill="rgb(25 25 25)" />
          <circle cx="7.9" cy="11.6" r="1.5" fill="rgb(252 252 252)" />
          <circle cx="16.1" cy="11.6" r="1.5" fill="rgb(252 252 252)" />
          <path
            d="M9.6 14.6c0-1 1.1-1.5 2.4-1.5s2.4.5 2.4 1.5c0 1.1-1.3 2.2-2.4 2.2s-2.4-1.1-2.4-2.2z"
            fill="rgb(252 252 252)"
          />
        </svg>
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
