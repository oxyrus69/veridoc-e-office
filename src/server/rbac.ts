import "server-only";

import type { UserRole } from "@/server/db/schema";
import { getCurrentUser, type CurrentUser } from "@/server/session";

export type { CurrentUser };

/** Thrown by every guard; callers translate it into a user-facing message. */
export class AccessDeniedError extends Error {
  constructor(message = "Peran Anda tidak diizinkan melakukan tindakan ini.") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export class UnauthenticatedError extends Error {
  constructor(message = "Sesi berakhir. Silakan masuk kembali.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/** Loads the session user or throws. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

/** Requires the caller to hold one of `allowed`. */
export async function requireRole(...allowed: UserRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!allowed.includes(user.r)) {
    throw new AccessDeniedError();
  }
  return user;
}

/** Requires a caller who is allowed to sign (and holds an active certificate). */
export async function requireSigner(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.r !== "EXECUTIVE_SIGNER" && user.r !== "REVIEWER_LEGAL_FINANCE") {
    throw new AccessDeniedError("Hanya pejabat penandatangan yang dapat memparaf naskah.");
  }
  if (user.certificateStatus !== "ACTIVE" || !user.certificateFingerprint) {
    throw new AccessDeniedError("Sertifikat penandatangan Anda belum aktif. Hubungi Super Admin.");
  }
  return user;
}

/** Requires a caller who may create or edit content (auditors are read-only). */
export async function requireAuthor(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.r === "AUDITOR_COMPLIANCE") {
    throw new AccessDeniedError("Auditor memiliki akses baca saja.");
  }
  return user;
}

/** Requires a caller who may administer the system. */
export async function requireAdmin(): Promise<CurrentUser> {
  return requireRole("SUPER_ADMIN");
}

/** Requires a caller who may read the audit trail or the DSS ledger. */
export async function requireOversight(): Promise<CurrentUser> {
  return requireRole("SUPER_ADMIN", "AUDITOR_COMPLIANCE");
}

/**
 * Asserts that the signed-in user may perform `action` on the document.
 * Document-level rules are enforced by the engine; this only gates the role.
 */
export function assertNotReadOnly(user: CurrentUser) {
  if (user.r === "AUDITOR_COMPLIANCE") {
    throw new AccessDeniedError("Auditor memiliki akses baca saja.");
  }
}

export const ROLE_HOME: Record<UserRole, string> = {
  SUPER_ADMIN: "/admin",
  EXECUTIVE_SIGNER: "/inbox",
  REVIEWER_LEGAL_FINANCE: "/inbox",
  DOCUMENT_CREATOR: "/documents",
  AUDITOR_COMPLIANCE: "/admin/audit",
};
