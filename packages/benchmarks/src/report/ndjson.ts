import { reportPayloadSchema, type ReportPayload } from "./payload";

function orderedPayload(payload: ReportPayload): Record<string, unknown> {
  const parsed = reportPayloadSchema.parse(payload);
  const ordered: Record<string, unknown> = {};
  for (const key of Object.keys(reportPayloadSchema.shape)) {
    if (key in parsed) ordered[key] = parsed[key as keyof ReportPayload];
  }
  return ordered;
}

/** One validated payload as a single compact ndjson line (no newline). */
export function serializeReportLine(payload: ReportPayload): string {
  return JSON.stringify(orderedPayload(payload));
}

export function parseReportsNdjson(text: string): {
  reports: ReportPayload[];
  invalid: number[];
} {
  const reports: ReportPayload[] = [];
  const invalid: number[] = [];
  text.split("\n").forEach((line, index) => {
    if (line.trim() === "") return;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      invalid.push(index + 1);
      return;
    }
    const parsed = reportPayloadSchema.safeParse(value);
    if (parsed.success) reports.push(parsed.data);
    else invalid.push(index + 1);
  });
  return { reports, invalid };
}
