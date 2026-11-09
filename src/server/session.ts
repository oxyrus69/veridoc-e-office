import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import {
  SESSION_COOKIE,
  canSign,
  expiryEpoch,
  isReadOnly,
  roleHome,
  signSession,
  verifySessionToken,
  type SessionPayload,
} from "@/server/auth";
import { verifyPassword } from "@/lib/cryptoMath";

export type CurrentUser = SessionPayload & {
  department: string;
  jobTitle: string;
  certificateFingerprint: string | null;
  certificateStatus: string | null;
};

export async function getSessionPayload(): Promise<SessionPayload | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** Loads the authenticated user with role, department and active certificate. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const payload = await getSessionPayload();
  if (!payload) return null;

  const db = await getDb();
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.id, payload.u)).limit(1);
  if (!profile || !profile.isActive) return null;

  const [cert] = await db
    .select({
      status: schema.signerCertificates.status,
      fingerprint: schema.signerCertificates.keyFingerprint,
    })
    .from(schema.signerCertificates)
    .where(eq(schema.signerCertificates.userId, profile.id))
    .limit(1);

  return {
    ...payload,
    r: profile.role,
    n: profile.fullName,
    e: profile.email,
    department: profile.department,
    jobTitle: profile.jobTitle,
    certificateFingerprint: cert?.fingerprint ?? null,
    certificateStatus: cert?.status ?? null,
  };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

export async function requireRole(allowed: string[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!allowed.includes(user.r)) throw new Error("FORBIDDEN");
  return user;
}

export async function requireSigner(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!canSign(user.r)) throw new Error("FORBIDDEN");
  return user;
}

export function assertWritable(user: CurrentUser) {
  if (isReadOnly(user.r)) throw new Error("FORBIDDEN");
}

export async function login(email: string, password: string) {
  const db = await getDb();
  const [profile] = await db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.email, email.trim().toLowerCase()))
    .limit(1);
  if (!profile || !profile.isActive) return { ok: false as const, message: "Akun tidak ditemukan atau tidak aktif" };
  if (!verifyPassword(password, profile.passwordHash)) return { ok: false as const, message: "Kata sandi salah" };

  const token = await signSession({
    u: profile.id,
    r: profile.role,
    n: profile.fullName,
    e: profile.email,
    x: expiryEpoch(),
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return { ok: true as const, role: profile.role, home: roleHome(profile.role) };
}

export async function logout() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function listDemoAccounts() {
  const db = await getDb();
  return db
    .select({
      email: schema.profiles.email,
      fullName: schema.profiles.fullName,
      role: schema.profiles.role,
      jobTitle: schema.profiles.jobTitle,
      department: schema.profiles.department,
    })
    .from(schema.profiles)
    .orderBy(schema.profiles.role);
}

export { roleHome, canSign, isReadOnly };
