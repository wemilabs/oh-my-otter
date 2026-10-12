import {
  reportPayloadSchema,
  serializeReportPayload,
  type ReportPayload,
} from "./payload";
import type { AgentsFile } from "./agents";

const MAX_BODY_LENGTH = 20_000;

export type IngestResult =
  | { ok: true; fileName: string; contents: string; comment: string }
  | { ok: false; comment: string };

export function extractPayloadJson(body: string): unknown {
  if (body.length > MAX_BODY_LENGTH) {
    throw new Error(
      `The issue body is ${body.length} characters; a report payload is at most ${MAX_BODY_LENGTH}.`,
    );
  }
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("No JSON payload was found in the issue body.");
  }
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch (error) {
    throw new Error(
      `No valid JSON payload was found in the issue body (${error instanceof Error ? error.message : String(error)}).`,
      { cause: error },
    );
  }
}

export function reportFileName(now: Date, random: string): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return `${stamp}-${random}.json`;
}

const RETRY_GUIDANCE =
  "Re-run `omot report` with the latest omot and paste its JSON exactly as printed, without editing it. This issue will be closed; open a new one to submit again.";

function invalidComment(lines: string[]): string {
  return [
    "This report could not be added to the dataset.",
    "",
    ...lines,
    "",
    RETRY_GUIDANCE,
  ].join("\n");
}

function leaksUsername(payload: ReportPayload, agents: AgentsFile, h: string) {
  const fields = [payload.agent, payload.agent_version, payload.model];
  const canonical = new Set(
    agents.agents.flatMap((agent) => [agent.id, ...agent.aliases]),
  );
  return fields.some(
    (field) =>
      field !== undefined &&
      field.toLowerCase().includes(h) &&
      !(field === payload.agent && canonical.has(field)),
  );
}

export function ingestIssue(input: {
  body: string;
  author: string;
  agents: AgentsFile;
  now: Date;
  random: string;
}): IngestResult {
  let value: unknown;
  try {
    value = extractPayloadJson(input.body);
  } catch (error) {
    return {
      ok: false,
      comment: invalidComment([
        `- \`payload\`: ${error instanceof Error ? error.message : String(error)}`,
      ]),
    };
  }
  const parsed = reportPayloadSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      comment: invalidComment(
        parsed.error.issues.map(
          (issue) =>
            `- \`${issue.path.join(".") || "(root)"}\`: ${issue.message}`,
        ),
      ),
    };
  }
  const payload = parsed.data;
  const handle = input.author.toLowerCase();
  if (handle.length >= 3 && leaksUsername(payload, input.agents, handle)) {
    return {
      ok: false,
      comment: invalidComment([
        "- The `agent`, `agent_version`, or `model` field appears to contain your GitHub username, which the dataset never stores.",
      ]),
    };
  }
  return {
    ok: true,
    fileName: reportFileName(input.now, input.random),
    contents: serializeReportPayload(payload),
    comment:
      "Thanks! Your report passed validation and was added to the public dataset. Only the JSON fields were stored; your username and this issue's text were not.",
  };
}
