import { z } from "zod";
import {
  reportPayloadSchema,
  serializeReportPayload,
  SECRET_SLUG_MESSAGE,
  type ReportPayload,
} from "./payload";
import type { AgentsFile } from "./agents";

const MAX_BODY_LENGTH = 20_000;
const MAX_ISSUES = 30;
const KEY_PATTERN = /^[a-z0-9_-]{1,40}$/i;

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
    throw new Error(
      "The issue body doesn't contain valid JSON. Paste the output of `omot report` unedited.",
    );
  }
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch (error) {
    throw new Error(
      "The issue body doesn't contain valid JSON. Paste the output of `omot report` unedited.",
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

function safeKey(key: unknown): string {
  if (typeof key === "number") return String(key);
  if (typeof key === "string" && KEY_PATTERN.test(key)) return key;
  return "<invalid key>";
}

function safePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "(root)";
  return path.map((seg) => safeKey(seg)).join(".");
}

function issueText(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return `expected ${issue.expected}`;
    case "invalid_value":
      return "not an allowed value";
    case "too_small":
    case "too_big":
      return "out of range";
    case "invalid_format":
      return "invalid format";
    case "unrecognized_keys":
      return `unexpected field(s): ${issue.keys
        .slice(0, 10)
        .map(safeKey)
        .join(", ")}${issue.keys.length > 10 ? "…" : ""}`;
    case "invalid_key":
      return "invalid key";
    case "custom":
      return issue.message === SECRET_SLUG_MESSAGE
        ? SECRET_SLUG_MESSAGE
        : "invalid value";
    default:
      return "invalid value";
  }
}

function invalidComment(lines: string[]): string {
  return [
    "This report could not be added to the dataset.",
    "",
    ...lines.slice(0, MAX_ISSUES),
    "",
    RETRY_GUIDANCE,
  ].join("\n");
}

function leaksUsername(payload: ReportPayload, agents: AgentsFile, h: string) {
  const canonical = new Set(
    agents.agents.flatMap((agent) => [agent.id, ...agent.aliases]),
  );
  if (canonical.has(h)) return false;
  const agentTokens = new Set(
    agents.agents.flatMap((agent) =>
      [agent.id, ...agent.aliases].flatMap((slug) =>
        slug.toLowerCase().split(/[._-]/),
      ),
    ),
  );
  if (agentTokens.has(h)) return false;
  const hs = h.split(/[._-]/).filter((segment) => segment !== "");
  const aligned = (field: string) => {
    const fs = field.toLowerCase().split(/[._-]/);
    return fs.some(
      (_, i) =>
        i + hs.length <= fs.length &&
        hs.every((segment, j) => fs[i + j] === segment),
    );
  };
  return [payload.agent, payload.agent_version, payload.model].some(
    (field) =>
      field !== undefined &&
      aligned(field) &&
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
        `- payload: ${error instanceof Error ? error.message : "invalid payload"}`,
      ]),
    };
  }
  const parsed = reportPayloadSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      comment: invalidComment(
        parsed.error.issues.map(
          (issue) => `- ${safePath(issue.path)}: ${issueText(issue)}`,
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
