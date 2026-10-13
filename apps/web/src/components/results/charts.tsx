"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AgentGroup, Group } from "@oh-my-otter/benchmarks/report";
import { NotEnoughBar } from "@/components/results/stats";
import { chartHeightForRows, toRateRows } from "@/lib/charts";

const chartColors = {
  pass: "var(--brand)",
  partial: "var(--muted-foreground)",
  fail: "color-mix(in srgb, var(--foreground) 30%, var(--background))",
};

function RankBadge() {
  return (
    <span className="ml-2 rounded-md bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
      unranked
    </span>
  );
}

function ChartCategoryTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: unknown };
}) {
  const value = String(payload?.value ?? "");
  const separator = value.lastIndexOf(" · n=");
  const label = separator === -1 ? value : value.slice(0, separator);
  const sample = separator === -1 ? null : value.slice(separator + 5);
  const tickX = x - 8;
  const hyphenated = label.includes("-");
  const parts = hyphenated
    ? label
        .split("-")
        .map((part, index, all) => part + (index < all.length - 1 ? "-" : ""))
    : label.split(" ");
  const labelLines: string[] = [];
  let line = "";
  for (const part of parts) {
    const next = line ? `${line}${hyphenated ? "" : " "}${part}` : part;
    if (line && next.length > 8) {
      labelLines.push(line);
      line = part;
    } else {
      line = next;
    }
  }
  if (line) labelLines.push(line);
  const lines = sample === null ? labelLines : [...labelLines, `n=${sample}`];
  const lineHeight = 0.9;

  return (
    <text
      x={tickX}
      y={y}
      fill="var(--muted-foreground)"
      textAnchor="end"
      fontSize={12}
    >
      {lines.map((text, index) => (
        <tspan
          key={index}
          x={tickX}
          dy={
            index === 0
              ? `${-((lines.length - 1) * lineHeight) / 2}em`
              : `${lineHeight}em`
          }
        >
          {text}
        </tspan>
      ))}
    </text>
  );
}

function InsufficientRows({ rows }: { rows: ReturnType<typeof toRateRows> }) {
  if (rows.length === 0) {
    return (
      <div className="mt-4 border-t border-border pt-4">
        <p className="font-mono text-[13px] text-muted-foreground">n=0</p>
        <div className="mt-2">
          <NotEnoughBar n={0} />
        </div>
      </div>
    );
  }
  const small = rows.filter((row) => !row.enough);
  if (small.length === 0) return null;
  return (
    <ul className="mt-4 space-y-3 border-t border-border pt-4">
      {small.map((row) => (
        <li
          key={row.key}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
        >
          <span className="font-mono text-[13px]">
            {row.label} · n={row.n}
            {!row.ranked ? <RankBadge /> : null}
          </span>
          <NotEnoughBar n={row.n} />
        </li>
      ))}
    </ul>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <span
        aria-hidden="true"
        className="size-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function ChartLegend({ outcome = false }: { outcome?: boolean }) {
  return (
    <div
      aria-label="Chart legend"
      role="group"
      className="mt-3 flex flex-wrap gap-x-5 gap-y-2"
    >
      <LegendItem
        color={chartColors.pass}
        label={outcome ? "Pass" : "Pass rate"}
      />
      {outcome ? (
        <>
          <LegendItem color={chartColors.partial} label="Partial" />
          <LegendItem color={chartColors.fail} label="Fail" />
        </>
      ) : null}
    </div>
  );
}

function ChartFrame({
  caption,
  children,
}: {
  caption: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="min-w-0 overflow-hidden rounded-lg border border-border bg-card p-5 shadow-sm">
      <figcaption className="text-sm font-medium">{caption}</figcaption>
      {children}
    </figure>
  );
}

export function SuccessRateChart({
  groups,
  caption,
}: {
  groups: Array<Group | AgentGroup>;
  caption: ReactNode;
}) {
  const rows = toRateRows(groups);
  const enoughRows = rows.filter((row) => row.enough && row.pass !== null);
  const data = enoughRows.map((row) => ({
    ...row,
    labelN: `${row.label} · n=${row.n}`,
    valueLabel: `${Math.round(row.pass!)}% · n=${row.n}`,
  }));
  const height = chartHeightForRows(data.length);
  const showOtherNote = data.some((row) => row.key === "other");

  return (
    <ChartFrame caption={caption}>
      {data.length > 0 ? (
        <div
          data-testid="success-rate-chart"
          role="img"
          aria-label="Pass rate by group"
          className="mt-4 w-full min-w-0"
          style={{ height }}
        >
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            initialDimension={{ width: 640, height }}
          >
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 8, right: 4, bottom: 18, left: 0 }}
            >
              <CartesianGrid
                horizontal={false}
                stroke="var(--border)"
                strokeDasharray="3 3"
              />
              <XAxis
                type="number"
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(value: number) => `${value}%`}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="labelN"
                width={60}
                tick={<ChartCategoryTick />}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value) => [
                  `${Math.round(Number(value))}%`,
                  "Pass rate",
                ]}
                labelFormatter={(label) => String(label)}
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  borderColor: "var(--border)",
                  borderRadius: "var(--radius)",
                  color: "var(--popover-foreground)",
                }}
              />
              <Bar
                dataKey="pass"
                fill={chartColors.pass}
                radius={[0, 4, 4, 0]}
                maxBarSize={28}
              >
                <LabelList
                  dataKey="valueLabel"
                  position="insideRight"
                  fill="var(--background)"
                  fontSize={12}
                  fontWeight={500}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      {showOtherNote ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Other is shown but not ranked.
        </p>
      ) : null}
      <InsufficientRows rows={rows} />
      <ChartLegend />
    </ChartFrame>
  );
}

export function OutcomeChart({
  groups,
  caption,
}: {
  groups: AgentGroup[];
  caption: ReactNode;
}) {
  const rows = toRateRows(groups);
  const enoughRows = rows.filter(
    (row) =>
      row.enough &&
      row.pass !== null &&
      row.partial !== null &&
      row.fail !== null,
  );
  const data = enoughRows.map((row) => ({
    ...row,
    labelN: `${row.label} · n=${row.n}`,
  }));
  const height = chartHeightForRows(data.length);
  const showOtherNote = data.some((row) => row.key === "other");

  return (
    <ChartFrame caption={caption}>
      {data.length > 0 ? (
        <div
          data-testid="outcome-chart"
          role="img"
          aria-label="Pass, partial, and fail rates by coding agent"
          className="mt-4 w-full min-w-0"
          style={{ height }}
        >
          <ResponsiveContainer
            width="100%"
            height="100%"
            minWidth={0}
            initialDimension={{ width: 640, height }}
          >
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 8, right: 4, bottom: 18, left: 0 }}
            >
              <CartesianGrid
                horizontal={false}
                stroke="var(--border)"
                strokeDasharray="3 3"
              />
              <XAxis
                type="number"
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(value: number) => `${value}%`}
                tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="labelN"
                width={60}
                tick={<ChartCategoryTick />}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value) => `${Math.round(Number(value))}%`}
                labelFormatter={(label) => String(label)}
                contentStyle={{
                  backgroundColor: "var(--popover)",
                  borderColor: "var(--border)",
                  borderRadius: "var(--radius)",
                  color: "var(--popover-foreground)",
                }}
              />
              <Bar
                dataKey="pass"
                name="Pass"
                stackId="outcomes"
                fill={chartColors.pass}
                maxBarSize={28}
              />
              <Bar
                dataKey="partial"
                name="Partial"
                stackId="outcomes"
                fill={chartColors.partial}
                maxBarSize={28}
              />
              <Bar
                dataKey="fail"
                name="Fail"
                stackId="outcomes"
                fill={chartColors.fail}
                radius={[0, 4, 4, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      {showOtherNote ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Other is shown but not ranked.
        </p>
      ) : null}
      <InsufficientRows rows={rows} />
      <ChartLegend outcome />
    </ChartFrame>
  );
}

export function TaskChartCaption({ id, title }: { id: string; title: string }) {
  return (
    <span>
      Outcomes by coding agent ·{" "}
      <Link
        href={`/tasks/${id}`}
        className="inline-flex min-h-11 items-center hover:underline"
      >
        {title}
      </Link>
    </span>
  );
}
