import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedPrefixes = ["/admin", "/inbox", "/documents", "/templates", "/dispositions", "/certificates", "/dss"];

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (protectedPrefixes.some((p) => path.startsWith(p))) {
    // In production, validate session here. Scaffold passes through.
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
