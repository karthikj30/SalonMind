import { NextResponse, type NextRequest } from "next/server";
import { SHELL_COOKIE, parseShell } from "@/lib/domain/apps";

/**
 * Entry point of the Android and desktop apps (and the installed web app). Remembers which shell and version is
 * running — so the site can offer an in-place update of the shell — then opens the dashboard.
 */
export function GET(req: NextRequest) {
  const shell = req.nextUrl.searchParams.get("shell") ?? "";
  const v = req.nextUrl.searchParams.get("v") ?? "";
  const parsed = parseShell(v ? `${shell}:${v}` : shell);
  const res = NextResponse.redirect(new URL("/app", req.url));
  if (parsed) res.cookies.set(SHELL_COOKIE, parsed.version ? `${parsed.kind}:${parsed.version}` : parsed.kind, { path: "/", maxAge: 60 * 60 * 24 * 400, sameSite: "lax" });
  return res;
}
