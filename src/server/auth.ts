/**
 * Stateless signed session cookie.
 *
 * `verifySessionToken` uses Web Crypto only, so the same function runs inside
 * middleware (edge-compatible) and in Node server components. Signing happens
 * on the server with the same HMAC-SHA256 routine.
 */
import type { UserRole } from "@/server/db/schema";

export const SESSION_COOKIE = "veridoc_session";
export const SESSION_MAX_AGE = 60 * 60 * 12; // 12 hours

export type SessionPayload = {
  u: string; // user id
  r: UserRole; // role
  n: string; // display name
  e: string; // email
  x: number; // expiry epoch seconds
};

const encoder = new TextEncoder();

function secret(): string {
  return process.env.VERIDOC_SESSION_SECRET ?? "veridoc-demo-session-secret-v1-change-me";
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmac(message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return base64UrlEncode(new Uint8Array(signature));
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await hmac(body);
  return `${body}.${signature}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  try {
    const expected = await hmac(body);
    if (expected !== signature) return null;
    const decoded = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as SessionPayload;
    if (!decoded?.u || !decoded?.r) return null;
    if (typeof decoded.x !== "number" || decoded.x * 1000 < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function expiryEpoch(secondsFromNow = SESSION_MAX_AGE): number {
  return Math.floor(Date.now() / 1000) + secondsFromNow;
}

/* ------------------------------------------------------------------ */
/* Route permissions                                                   */
/* ------------------------------------------------------------------ */

/** Longest-prefix RBAC table. `null` = any authenticated role. */
export const ROUTE_PERMISSIONS: { prefix: string; roles: UserRole[] | null }[] = [
  { prefix: "/print", roles: null },
  { prefix: "/admin/settings", roles: ["SUPER_ADMIN"] },
  { prefix: "/admin/audit", roles: ["SUPER_ADMIN", "AUDITOR_COMPLIANCE"] },
  { prefix: "/admin", roles: ["SUPER_ADMIN", "AUDITOR_COMPLIANCE"] },
  { prefix: "/certificates", roles: ["SUPER_ADMIN", "AUDITOR_COMPLIANCE"] },
  { prefix: "/dss", roles: ["SUPER_ADMIN", "AUDITOR_COMPLIANCE", "EXECUTIVE_SIGNER"] },
  { prefix: "/inbox", roles: ["EXECUTIVE_SIGNER", "REVIEWER_LEGAL_FINANCE"] },
  { prefix: "/documents/compose", roles: ["DOCUMENT_CREATOR", "SUPER_ADMIN"] },
  { prefix: "/documents", roles: null },
  { prefix: "/templates", roles: null },
  { prefix: "/dispositions", roles: null },
];

export const PUBLIC_PREFIXES = ["/verify", "/login", "/api/auth", "/api/export", "/_next", "/favicon.ico"];

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function requiredRoles(pathname: string): { matched: boolean; roles: UserRole[] | null } {
  let best: { prefix: string; roles: UserRole[] | null } | null = null;
  for (const entry of ROUTE_PERMISSIONS) {
    if (pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)) {
      if (!best || entry.prefix.length > best.prefix.length) best = entry;
    }
  }
  return best ? { matched: true, roles: best.roles } : { matched: false, roles: null };
}

export function canAccess(role: UserRole, pathname: string): boolean {
  const { matched, roles } = requiredRoles(pathname);
  if (!matched) return true;
  if (roles === null) return true;
  return roles.includes(role);
}

export function roleHome(role: UserRole): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "/admin";
    case "EXECUTIVE_SIGNER":
    case "REVIEWER_LEGAL_FINANCE":
      return "/inbox";
    case "DOCUMENT_CREATOR":
      return "/documents";
    case "AUDITOR_COMPLIANCE":
      return "/admin/audit";
    default:
      return "/verify";
  }
}

export function canSign(role: UserRole): boolean {
  return role === "EXECUTIVE_SIGNER" || role === "REVIEWER_LEGAL_FINANCE";
}

export function isReadOnly(role: UserRole): boolean {
  return role === "AUDITOR_COMPLIANCE";
}
