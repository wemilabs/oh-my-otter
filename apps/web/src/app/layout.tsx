import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SITE_URL } from "@oh-my-otter/benchmarks/report";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "@/components/site/theme-provider";
import "./globals.css";

export const viewport: Viewport = { viewportFit: "cover" };

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  title: {
    default: "Oh My Otter: agent-readiness benchmarks",
    template: "%s · Oh My Otter",
  },
  description:
    "Open-source benchmarks and fixes that get your repo ready for AI coding agents. Scan your repo, benchmark any coding agent locally, and compare anonymous results.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>{children}</ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
