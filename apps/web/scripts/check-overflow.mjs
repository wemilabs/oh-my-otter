#!/usr/bin/env node
// Horizontal-overflow and tap-target check for the omot site (not run in CI).
// Connects to Chrome over CDP (env CDP_URL, default http://localhost:29229),
// visits every route at several widths in both color schemes, and reports:
//   - documentElement.scrollWidth > clientWidth (page is wider than the view)
//   - visible a/button/[role=button]/summary/input under 44x44, except links
//     inside prose paragraphs
// Usage: node scripts/check-overflow.mjs [baseUrl]   (default http://localhost:3300)

import { chromium } from "@playwright/test";
import { builtinChecks } from "@oh-my-otter/checks";

const BASE = process.argv[2] ?? "http://localhost:3300";
const CDP_URL = process.env.CDP_URL ?? "http://localhost:29229";
const TASKS = [
  "a11y-img-alt",
  "add-unit-test",
  "dep-patch-bump",
  "fix-failing-test",
  "fix-lint-rule",
  "ts-strict-file",
];
const ROUTES = [
  "/",
  "/checks",
  ...builtinChecks.map((check) => `/checks/${check.id}`),
  "/methodology",
  "/contribute",
  "/results",
  "/tasks",
  "/privacy",
  ...TASKS.map((t) => `/tasks/${t}`),
];
const WIDTHS = [320, 375, 390, 414, 768];
const SCHEMES = ["light", "dark"];

const browser = await chromium.connectOverCDP(CDP_URL);
const failures = [];
for (const width of WIDTHS) {
  for (const scheme of SCHEMES) {
    const ctx = await browser.newContext({
      viewport: { width, height: 844 },
      colorScheme: scheme,
      isMobile: width < 768,
      hasTouch: width < 768,
    });
    const page = await ctx.newPage();
    for (const route of ROUTES) {
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(200);
      const result = await page.evaluate(() => {
        const w = document.documentElement.clientWidth;
        const overflow = document.documentElement.scrollWidth > w + 1;
        const inProse = (el) => !!el.closest("p, .prose-omot");
        const small = [
          ...document.querySelectorAll(
            "a, button, [role=button], summary, input",
          ),
        ]
          .filter((el) => {
            if (inProse(el)) return false;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return false;
            const style = getComputedStyle(el);
            if (style.visibility === "hidden" || style.display === "none")
              return false;
            return r.width < 44 || r.height < 44;
          })
          .map((el) => {
            const r = el.getBoundingClientRect();
            return `${el.tagName} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`;
          });
        return { overflow, small };
      });
      if (result.overflow || result.small.length) {
        failures.push(
          `${route} @ ${width}px ${scheme}` +
            (result.overflow ? " [HORIZONTAL OVERFLOW]" : "") +
            (result.small.length
              ? `\n  small targets: ${result.small.join("\n  ")}`
              : ""),
        );
      }
    }
    await ctx.close();
  }
}
await browser.close();
if (failures.length) {
  console.log(`FAIL\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(
  `OK: ${ROUTES.length} routes x ${WIDTHS.length} widths x ${SCHEMES.length} schemes, no overflow, all targets >= 44px`,
);
