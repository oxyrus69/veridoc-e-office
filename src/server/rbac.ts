
export const ROLE_HOME: Record<string, string> = {
  SUPER_ADMIN: "/admin",
  EXECUTIVE_SIGNER: "/inbox",
  REVIEWER_LEGAL_FINANCE: "/inbox",
  DOCUMENT_CREATOR: "/documents",
  AUDITOR_COMPLIANCE: "/admin/audit",
};

export function requireRole(role: string | undefined, allowed: string[]) {
  if (!role || !allowed.includes(role)) {
    throw new Error("Unauthorized");
  }
}
