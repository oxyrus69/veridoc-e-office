import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import type { Database } from "@/server/db";
import {
  GENESIS_CHAIN,
  buildDocumentNumber,
  computeCanonicalDocumentHashPure,
  computeChainedSignaturePure,
  computeFinalChainHash,
  decryptPrivateKey,
  deriveSigningKey,
  encryptPrivateKey,
  formatFingerprint,
  generateRsaPssKeyPair,
  generateVerificationCode,
  hashSigningPin,
  sha256Hex,
  signChainHash,
  verifyChainHashSignature,
  verifySigningPin,
} from "@/lib/cryptoMath";

export { verifyChainHashSignature, signChainHash };

const KEY_ENVELOPE_SECRET = process.env.VERIDOC_KEY_SECRET ?? "veridoc-demo-key-envelope-secret-v1";

/* ------------------------------------------------------------------ */
/* Certificates                                                        */
/* ------------------------------------------------------------------ */

export type CertificateWithOfficer = {
  certificateId: string;
  userId: string;
  fullName: string;
  email: string;
  role: string;
  department: string;
  jobTitleOfficial: string;
  keyFingerprint: string;
  formattedFingerprint: string;
  status: "ACTIVE" | "REVOKED";
  issuedAt: Date;
  expiresAt: Date;
  lastRotatedAt: Date;
  daysToExpiry: number;
  publicKeyPem: string;
};

export async function listCertificates(db?: Database): Promise<CertificateWithOfficer[]> {
  const database = db ?? (await getDb());
  const rows = await database
    .select({
      certificateId: schema.signerCertificates.id,
      userId: schema.profiles.id,
      fullName: schema.profiles.fullName,
      email: schema.profiles.email,
      role: schema.profiles.role,
      department: schema.profiles.department,
      jobTitleOfficial: schema.signerCertificates.jobTitleOfficial,
      keyFingerprint: schema.signerCertificates.keyFingerprint,
      status: schema.signerCertificates.status,
      issuedAt: schema.signerCertificates.issuedAt,
      expiresAt: schema.signerCertificates.expiresAt,
      lastRotatedAt: schema.signerCertificates.lastRotatedAt,
      publicKeyPem: schema.signerCertificates.publicKeyPem,
    })
    .from(schema.signerCertificates)
    .innerJoin(schema.profiles, eq(schema.profiles.id, schema.signerCertificates.userId))
    .orderBy(schema.signerCertificates.issuedAt);

  const now = Date.now();
  return rows.map((row) => ({
    ...row,
    formattedFingerprint: formatFingerprint(row.keyFingerprint),
    daysToExpiry: Math.round((new Date(row.expiresAt).getTime() - now) / 86400000),
  }));
}

export async function getCertificateForUser(userId: string, db?: Database) {
  const database = db ?? (await getDb());
  const [row] = await database
    .select()
    .from(schema.signerCertificates)
    .where(and(eq(schema.signerCertificates.userId, userId), eq(schema.signerCertificates.status, "ACTIVE")))
    .limit(1);
  return row ?? null;
}

export type IssuedCertificate = {
  id: string;
  keyFingerprint: string;
  publicKeyPem: string;
  expiresAt: Date;
};

/** Issues a fresh RSA-PSS keypair for an officer; returns the public half only. */
export async function issueCertificate(params: {
  userId: string;
  jobTitleOfficial: string;
  pin: string;
  validityDays?: number;
  db?: Database;
}): Promise<IssuedCertificate> {
  const database = params.db ?? (await getDb());
  const { publicKeyPem: publicKey, privateKeyPem: privateKey } = generateRsaPssKeyPair();

  const fingerprint = sha256Hex(publicKey).slice(0, 40);
  const expiresAt = new Date(Date.now() + (params.validityDays ?? 365) * 86400000);

  const [row] = await database
    .insert(schema.signerCertificates)
    .values({
      userId: params.userId,
      keyFingerprint: fingerprint,
      publicKeyPem: publicKey,
      encryptedPrivateKey: encryptPrivateKey(privateKey, KEY_ENVELOPE_SECRET),
      signingPinHash: hashSigningPin(params.pin),
      jobTitleOfficial: params.jobTitleOfficial,
      status: "ACTIVE",
      expiresAt,
    })
    .returning();

  return { id: row.id, keyFingerprint: fingerprint, publicKeyPem: publicKey, expiresAt };
}

export async function revokeCertificate(certificateId: string, db?: Database) {
  const database = db ?? (await getDb());
  await database
    .update(schema.signerCertificates)
    .set({ status: "REVOKED" })
    .where(eq(schema.signerCertificates.id, certificateId));
}

export async function rotateCertificate(params: {
  certificateId: string;
  pin: string;
  validityDays?: number;
  db?: Database;
}) {
  const database = params.db ?? (await getDb());
  const [current] = await database
    .select()
    .from(schema.signerCertificates)
    .where(eq(schema.signerCertificates.id, params.certificateId))
    .limit(1);
  if (!current) throw new Error("Sertifikat tidak ditemukan");
  if (!verifySigningPin(params.pin, current.signingPinHash)) throw new Error("PIN tanda tangan tidak valid");

  const { publicKeyPem: publicKey, privateKeyPem: privateKey } = generateRsaPssKeyPair();
  const fingerprint = sha256Hex(publicKey).slice(0, 40);
  const expiresAt = new Date(Date.now() + (params.validityDays ?? 365) * 86400000);

  await database
    .update(schema.signerCertificates)
    .set({
      keyFingerprint: fingerprint,
      publicKeyPem: publicKey,
      encryptedPrivateKey: encryptPrivateKey(privateKey, KEY_ENVELOPE_SECRET),
      expiresAt,
      lastRotatedAt: new Date(),
      status: "ACTIVE",
    })
    .where(eq(schema.signerCertificates.id, params.certificateId));

  return { keyFingerprint: fingerprint, expiresAt };
}

/* ------------------------------------------------------------------ */
/* Note: RSA-PSS helpers live in `src/lib/cryptoMath.ts` so that the   */
/* public verify page can use them without server-only imports.        */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Step sealing                                                        */
/* ------------------------------------------------------------------ */

export type SealStepResult = {
  stepSignatureHash: string;
  previousStepSignatureHash: string;
  certificateFingerprint: string;
  publicKeyPem: string;
  rsaSignature: string;
};

/**
 * Seals one approval step.
 *   S_i = HMAC_SHA256_{K_i}( H_doc | S_(i-1) | ApproverId_i | Timestamp_i )
 * with K_i derived from the officer's PIN + certificate fingerprint, then
 * the whole chain hash is signed with that officer's RSA-PSS private key.
 * Both are required: PIN proves intent, the key proves identity.
 */
export async function sealApprovalStep(params: {
  certificate: {
    keyFingerprint: string;
    publicKeyPem: string;
    signingPinHash: string;
    encryptedPrivateKey: string;
  };
  contentHash: string;
  previousSignatureHash: string;
  approverId: string;
  actedAt: Date;
  pin: string;
}): Promise<SealStepResult> {
  if (!verifySigningPin(params.pin, params.certificate.signingPinHash)) {
    throw new Error("PIN tanda tangan tidak valid");
  }
  const key = deriveSigningKey(params.pin, params.certificate.keyFingerprint);
  const stepSignatureHash = computeChainedSignaturePure({
    contentHash: params.contentHash,
    previousSignatureHash: params.previousSignatureHash || GENESIS_CHAIN,
    approverId: params.approverId,
    timestamp: params.actedAt.toISOString(),
    key,
  });

  const privateKeyPem = decryptPrivateKey(params.certificate.encryptedPrivateKey, KEY_ENVELOPE_SECRET);
  const rsaSignature = signChainHash(privateKeyPem, stepSignatureHash);

  return {
    stepSignatureHash,
    previousStepSignatureHash: params.previousSignatureHash || GENESIS_CHAIN,
    certificateFingerprint: params.certificate.keyFingerprint,
    publicKeyPem: params.certificate.publicKeyPem,
    rsaSignature,
  };
}

/** Verifies the RSA-PSS signature attached to a sealed step. */
export function verifyStepSignature(params: {
  publicKeyPem: string;
  stepSignatureHash: string;
  rsaSignature: string;
}): boolean {
  return verifyChainHashSignature(params.publicKeyPem, params.stepSignatureHash, params.rsaSignature);
}

/** Recomputation helper used by the auditor and by e2e tests. */
export function recomputeStepSignature(params: {
  pin: string;
  certificateFingerprint: string;
  contentHash: string;
  previousSignatureHash: string;
  approverId: string;
  actedAt: Date;
}): string {
  return computeChainedSignaturePure({
    contentHash: params.contentHash,
    previousSignatureHash: params.previousSignatureHash,
    approverId: params.approverId,
    timestamp: params.actedAt.toISOString(),
    key: deriveSigningKey(params.pin, params.certificateFingerprint),
  });
}

export { computeFinalChainHash };

/* ------------------------------------------------------------------ */
/* Atomic numbering                                                    */
/* ------------------------------------------------------------------ */

export async function nextDocumentNumber(params: {
  format: string;
  department: string;
  now?: Date;
  db?: Database;
}): Promise<string> {
  const database = params.db ?? (await getDb());
  const now = params.now ?? new Date();
  const year = now.getFullYear();
  const scopeKey = `${params.department}:${params.format}`;

  const [row] = await database
    .insert(schema.documentSequences)
    .values({ scopeKey, periodYear: year, lastSequence: 1 })
    .onConflictDoUpdate({
      target: [schema.documentSequences.scopeKey, schema.documentSequences.periodYear],
      set: { lastSequence: sql`${schema.documentSequences.lastSequence} + 1`, updatedAt: new Date() },
    })
    .returning();

  return buildDocumentNumber({
    format: params.format,
    year,
    monthIndex: now.getMonth(),
    sequence: row.lastSequence,
    department: params.department,
  });
}

export function newVerificationCode(now = new Date()): string {
  return generateVerificationCode(now.getFullYear());
}

/* ------------------------------------------------------------------ */
/* Document seal (canonical hash of the approved version)              */
/* ------------------------------------------------------------------ */

export function computeDocumentSeal(input: {
  title: string;
  category: string;
  documentNumber: string;
  variablesPayload: Record<string, unknown>;
  renderedBodyText: string;
}) {
  return computeCanonicalDocumentHashPure(input);
}
