import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";

/** Keyed by keyFingerprint — used by auditChain to verify RSA-PSS signatures. */
export async function getCertFingerprintMap() {
  const db = await getDb();
  const rows = await db
    .select({
      fingerprint: schema.signerCertificates.keyFingerprint,
      publicKeyPem: schema.signerCertificates.publicKeyPem,
    })
    .from(schema.signerCertificates);
  return new Map(rows.map((row) => [row.fingerprint, row.publicKeyPem]));
}

/**
 * Loads the approver's active signing certificate (needed to seal a step).
 * Returns null when the officer has no ACTIVE certificate.
 */
export async function getActiveCertForUser(userId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.signerCertificates)
    .where(eq(schema.signerCertificates.userId, userId))
    .limit(1);
  return row && row.status === "ACTIVE" ? row : null;
}
