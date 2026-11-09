import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  SESSION_COOKIE,
  isPublicPath,
  requiredRoles,
  roleHome,
  verifySessionToken,
} from "@/server/auth";

/**
 * Access control at the edge.
 *
 * Per the specification, route protection is enforced here with a
 * longest-prefix match against `ROUTE_PERMISSIONS`, and every Server Action
 * re-checks the role through `src/server/rbac.ts`. The session cookie is a
 * stateless HMAC, so verifying it needs no database access and runs on the
 * edge runtime.
 */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const payload = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (!payload) {
    const login = new URL("/login", req.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }

  const { matched, roles } = requiredRoles(pathname);
  if (matched && roles && !roles.includes(payload.r)) {
    return NextResponse.redirect(new URL(roleHome(payload.r), req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
