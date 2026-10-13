import { builtinChecks } from "@oh-my-otter/checks";
import { NextResponse, type NextRequest } from "next/server";

const checkIds = new Set(builtinChecks.map((check) => check.id));

export function proxy(request: NextRequest) {
  const id = request.nextUrl.pathname.match(/^\/checks\/([^/]+)\/?$/)?.[1];
  if (!id || checkIds.has(id)) return NextResponse.next();

  const destination = request.nextUrl.clone();
  destination.pathname = "/_not-found";
  return NextResponse.rewrite(destination);
}

export const config = {
  matcher: "/checks/:id",
};
