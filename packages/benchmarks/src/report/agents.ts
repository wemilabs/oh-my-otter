import { z } from "zod";
import { AGENT_PATTERN } from "../schema";

export const OTHER_AGENT = "other";

export const agentsFileSchema = z
  .object({
    agents: z.array(
      z
        .object({
          id: z.string().regex(AGENT_PATTERN),
          display_name: z.string().min(1).max(60),
          aliases: z.array(z.string().regex(AGENT_PATTERN)),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Map<string, string>();
    const reserved = new Set([OTHER_AGENT, "unknown"]);
    file.agents.forEach((agent, index) => {
      const entries: [string, string][] = [
        [agent.id, "id"],
        ...agent.aliases.map((alias): [string, string] => [alias, "alias"]),
      ];
      for (const [slug, kind] of entries) {
        if (reserved.has(slug)) {
          ctx.addIssue({
            code: "custom",
            path: ["agents", index, kind === "id" ? "id" : "aliases"],
            message: `"${slug}" is reserved and cannot be used as an agent ${kind}.`,
          });
          continue;
        }
        const previous = seen.get(slug);
        if (previous !== undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["agents", index, kind === "id" ? "id" : "aliases"],
            message: `"${slug}" is already used by ${previous}.`,
          });
        } else {
          seen.set(slug, agent.id);
        }
      }
    });
  });

export type AgentsFile = z.infer<typeof agentsFileSchema>;

export function canonicalAgent(slug: string, agents: AgentsFile): string {
  for (const agent of agents.agents) {
    if (agent.id === slug || agent.aliases.includes(slug)) return agent.id;
  }
  return OTHER_AGENT;
}
