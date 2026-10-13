import { builtinChecks } from "@oh-my-otter/checks";
import { NextResponse, type NextRequest } from "next/server";
import { BUILTIN_TASK_IDS } from "@oh-my-otter/benchmarks/report";

const checkIds = new Set(builtinChecks.map((check) => check.id));
const taskIds = new Set(BUILTIN_TASK_IDS);

export function proxy(request: NextRequest) {
  const match = request.nextUrl.pathname.match(
    /^\/(checks|tasks)\/([^/]+)\/?$/,
  );
  if (!match) return NextResponse.next();

  const [, section, id] = match;
  const knownId = section === "checks" ? checkIds.has(id!) : taskIds.has(id!);
  if (knownId) return NextResponse.next();

  const destination = request.nextUrl.clone();
  destination.pathname = "/_not-found";
  return NextResponse.rewrite(destination);
}

export const config = {
  matcher: ["/checks/:id", "/tasks/:id"],
};
