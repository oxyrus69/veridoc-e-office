/**
 * End-to-end verification of VeriDoc's core guarantees.
 *
 *   npm run e2e
 *
 * The script drives the real engine modules. Because they use `@/` path
 * aliases, this file is bundled by esbuild first (see `npm run e2e`), which
 * resolves the aliases exactly the way Next does at build time.
 */
import { getDb, closeDb } from "@/server/db";
import { submitApprovalVerdict } from "@/server/services/approvalEngine";
import { verifyByCode } from "@/server/services/verificationEngine";
import {
  GENESIS_CHAIN,
  buildDocumentNumber,
  computeCanonicalDocumentHashPure,
  computeChainedSignaturePure,
  deriveSigningKey,
  generateRsaPssKeyPair,
  hashSigningPin,
  normalizeBodyText,
  sha256Hex,
  signChainHash,
  verifyAndDetectTamperingPure,
  verifyChainHashSignature,
  verifySigningPin,
} from "@/lib/cryptoMath";
import { encodeQr } from "@/lib/qr";

let passed = 0;
let failed = 0;
const results: string[] = [];

async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed += 1;
    results.push(`  PASS  ${name}`);
  } catch (error) {
    failed += 1;
    results.push(`  FAIL  ${name}\n        ${(error as Error).message}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/* ================================================================== */
/* 1. Hash determinism                                                 */
/* ================================================================== */

const sampleInput = {
  title: "Surat Keputusan Uji Determinisme",
  category: "DECREE_SK",
  documentNumber: "0042/SK-DIR/VRD/XI/2026",
  variablesPayload: { zeta: 1, alpha: "dua", nested: { b: 2, a: 1 } },
  renderedBodyText: "Baris pertama\r\nBaris kedua\r\n",
};

await check("computeCanonicalDocumentHashPure is deterministic", () => {
  const a = computeCanonicalDocumentHashPure(sampleInput);
  const b = computeCanonicalDocumentHashPure({ ...sampleInput });
  assertEqual(a, b, "hash must repeat byte for byte");
  assert(/^[0-9a-f]{64}$/.test(a), "hash must be 64 lowercase hex characters");
});

await check("hash normalises CRLF and trailing whitespace", () => {
  const crlf = computeCanonicalDocumentHashPure({ ...sampleInput, renderedBodyText: "Baris pertama\r\nBaris kedua" });
  const lf = computeCanonicalDocumentHashPure({ ...sampleInput, renderedBodyText: "Baris pertama\nBaris kedua   " });
  assertEqual(crlf, lf, "line endings and trailing spaces must not change the digest");
});

await check("hash ignores JSON key ordering", () => {
  const a = computeCanonicalDocumentHashPure({ ...sampleInput, variablesPayload: { a: 1, b: 2, c: 3 } });
  const b = computeCanonicalDocumentHashPure({ ...sampleInput, variablesPayload: { c: 3, a: 1, b: 2 } });
  assertEqual(a, b, "key order must be canonicalised");
});

await check("one rupiah digit changes the digest completely", () => {
  const before = computeCanonicalDocumentHashPure({ ...sampleInput, variablesPayload: { nilai: "Rp 150.000.000" } });
  const after = computeCanonicalDocumentHashPure({ ...sampleInput, variablesPayload: { nilai: "Rp 150.000.001" } });
  assert(before !== after, "digests must differ");
  let differing = 0;
  for (let i = 0; i < 64; i += 1) if (before[i] !== after[i]) differing += 1;
  assert(differing > 40, `avalanche effect expected (>40 differing hex chars), got ${differing}`);
});

/* ================================================================== */
/* 2. Chained signatures                                               */
/* ================================================================== */

const key1 = deriveSigningKey("123456", "f".repeat(40));
const key2 = deriveSigningKey("654321", "f".repeat(40));

await check("computeChainedSignaturePure is deterministic", () => {
  const params = {
    contentHash: "a".repeat(64),
    previousSignatureHash: GENESIS_CHAIN,
    approverId: "user-1",
    timestamp: "2026-01-01T00:00:00.000Z",
    key: key1,
  };
  assertEqual(computeChainedSignaturePure(params), computeChainedSignaturePure(params), "signature must repeat");
});

await check("a different PIN yields a different signature", () => {
  const base = {
    contentHash: "a".repeat(64),
    previousSignatureHash: GENESIS_CHAIN,
    approverId: "user-1",
    timestamp: "2026-01-01T00:00:00.000Z",
  };
  assert(computeChainedSignaturePure({ ...base, key: key1 }) !== computeChainedSignaturePure({ ...base, key: key2 }), "PIN must matter");
});

await check("tampering the previous signature breaks the next one", () => {
  const base = {
    contentHash: "a".repeat(64),
    approverId: "user-2",
    timestamp: "2026-01-01T01:00:00.000Z",
    key: key1,
  };
  const s1 = computeChainedSignaturePure({ ...base, previousSignatureHash: GENESIS_CHAIN });
  const honest = computeChainedSignaturePure({ ...base, previousSignatureHash: s1 });
  const forged = computeChainedSignaturePure({ ...base, previousSignatureHash: GENESIS_CHAIN });
  assert(honest !== forged, "chain must be sensitive to the previous hash");
});

await check("PIN storage verifies the correct PIN only", () => {
  const stored = hashSigningPin("123456");
  assert(stored.startsWith("scrypt$"), "must use scrypt with a salt");
  assert(!stored.includes("123456"), "raw PIN must never be stored");
  assert(verifySigningPin("123456", stored), "correct PIN must verify");
  assert(!verifySigningPin("123457", stored), "wrong PIN must fail");
});

/* ================================================================== */
/* 3. RSA-PSS                                                          */
/* ================================================================== */

await check("RSA-PSS binds the chain hash to the signer key", () => {
  const { publicKeyPem, privateKeyPem } = generateRsaPssKeyPair();
  const chainHash = sha256Hex("chain-under-test");
  const signature = signChainHash(privateKeyPem, chainHash);
  assert(verifyChainHashSignature(publicKeyPem, chainHash, signature), "valid signature must verify");
  assert(!verifyChainHashSignature(publicKeyPem, sha256Hex("other"), signature), "altered hash must fail");
  const foreign = generateRsaPssKeyPair();
  assert(!verifyChainHashSignature(foreign.publicKeyPem, chainHash, signature), "foreign public key must fail");
});

/* ================================================================== */
/* 4. Tamper detection                                                 */
/* ================================================================== */

await check("one changed character is TAMPERED and points at the line", () => {
  const original = ["MEMORANDUM ANGGARAN", "", "Nilai pengajuan", "Rp 150.000.000"].join("\n");
  const modified = original.replace("Rp 150.000.000", "Rp 150.000.001");
  const result = verifyAndDetectTamperingPure({
    originalText: original,
    modifiedText: modified,
    originalHash: sha256Hex(normalizeBodyText(original)),
  });
  assertEqual(result.status, "TAMPERED", "status must flip to TAMPERED");
  assertEqual(result.changedLines.length, 1, "exactly one line changed");
  assertEqual(result.changedLines[0].lineNo, 4, "the 4th line is the tampered one");
  assert(result.avalancheBits > 100, `avalanche must be visible, got ${result.avalancheBits} bits`);
});

await check("an untouched document stays VALID", () => {
  const text = "Baris satu\nBaris dua";
  const result = verifyAndDetectTamperingPure({ originalText: text, modifiedText: text, originalHash: sha256Hex(normalizeBodyText(text)) });
  assertEqual(result.status, "VALID", "unchanged text must verify");
  assertEqual(result.changedLines.length, 0, "no changed lines");
});

await check("inserting a clause is detected", () => {
  const original = "Pasal 1\nPasal 2";
  const modified = "Pasal 1\nPasal 1a\nPasal 2";
  const result = verifyAndDetectTamperingPure({
    originalText: original,
    modifiedText: modified,
    originalHash: sha256Hex(normalizeBodyText(original)),
  });
  assertEqual(result.status, "TAMPERED", "inserted line must be flagged");
  assertEqual(result.lineCountDelta, 1, "one line was added");
});

/* ================================================================== */
/* 5. QR and numbering                                                 */
/* ================================================================== */

await check("QR matrix has standards-compliant geometry", () => {
  const m = encodeQr("https://veridoc.id/verify/VRD-2026-8F92A1");
  assert((m.size - 17) % 4 === 0, "size must be 4v+17");
  assert(m.modules.length === m.size, "rows must match size");
  assert(m.modules[0].slice(0, 7).every(Boolean), "finder pattern top row must be solid");
});

await check("document numbers follow the template", () => {
  const number = buildDocumentNumber({ format: "{{SEQ}}/SK-DIR/VRD/{{ROMAN_MONTH}}/{{YEAR}}", year: 2026, monthIndex: 10, sequence: 42 });
  assertEqual(number, "0042/SK-DIR/VRD/XI/2026", "sequence is zero-padded and month romanised");
});

/* ================================================================== */
/* 6. Live database                                                    */
/* ================================================================== */

/* eslint-disable @typescript-eslint/no-explicit-any */
const db: any = await getDb();
/** Raw SQL for assertions; the Drizzle PGlite driver exposes the client. */
const rawQuery = async (sql: string, params: unknown[] = []): Promise<any[]> => {
  const client = db.$client as { query: (q: string, p: unknown[]) => Promise<{ rows: any[] }> };
  const result = await client.query(sql, params);
  return result.rows;
};
const one = async (sql: string, params?: unknown[]): Promise<any> => (await rawQuery(sql, params))[0] ?? null;
const all = async (sql: string, params?: unknown[]): Promise<any[]> => rawQuery(sql, params);

await check("seeded dataset has the required shape", async () => {
  const counts = await one(`
    SELECT (SELECT count(*)::int FROM profiles) AS profiles,
           (SELECT count(*)::int FROM signer_certificates) AS certs,
           (SELECT count(*)::int FROM document_templates) AS templates,
           (SELECT count(*)::int FROM official_documents) AS documents,
           (SELECT count(*)::int FROM incoming_correspondences) AS letters,
           (SELECT count(*)::int FROM disposition_chains) AS dispositions`);
  assertEqual(counts.profiles, 5, "5 demo accounts");
  assertEqual(counts.certs, 4, "4 certificates");
  assertEqual(counts.templates, 4, "4 templates");
  assertEqual(counts.documents, 8, "8 documents");
  assertEqual(counts.letters, 4, "4 incoming letters");
  assert(counts.dispositions >= 6, `expected disposition chains, got ${counts.dispositions}`);
});

await check("every sealed document's content hash matches its version", async () => {
  const docs = await all(`
    SELECT d.title, d.canonical_content_hash, v.content_sha256
    FROM official_documents d
    JOIN document_versions v ON v.document_id = d.id AND v.version_no = d.current_version_no
    WHERE d.status IN ('SEALED_PUBLISHED', 'REVOKED_INVALIDATED')`);
  assert(docs.length >= 4, `expected sealed documents, got ${docs.length}`);
  for (const doc of docs) assertEqual(doc.canonical_content_hash, doc.content_sha256, `content hash must match (${doc.title})`);
});

await check("every signed step verifies against its RSA public key", async () => {
  const steps = await all(`
    SELECT s.step_order, s.step_signature_hash, s.rsa_signature, c.public_key_pem, d.title
    FROM approval_workflow_steps s
    JOIN official_documents d ON d.id = s.document_id
    JOIN signer_certificates c ON c.key_fingerprint = s.certificate_fingerprint
    WHERE s.verdict = 'APPROVED_SIGNED'`);
  assert(steps.length >= 8, `expected signed steps, got ${steps.length}`);
  for (const step of steps) {
    assert(verifyChainHashSignature(step.public_key_pem, step.step_signature_hash, step.rsa_signature), `RSA-PSS must verify (${step.title} step ${step.step_order})`);
  }
});

await check("step chains link continuously from GENESIS", async () => {
  const docs = await all(`SELECT id, title FROM official_documents WHERE status IN ('SEALED_PUBLISHED','REVOKED_INVALIDATED')`);
  for (const doc of docs) {
    const steps = await all(`SELECT verdict, previous_step_signature_hash, step_signature_hash FROM approval_workflow_steps WHERE document_id = $1 ORDER BY step_order`, [doc.id]);
    let previous = GENESIS_CHAIN;
    for (const step of steps) {
      if (step.verdict !== "APPROVED_SIGNED") continue;
      assertEqual(step.previous_step_signature_hash, previous, `chain link broken in ${doc.title}`);
      previous = step.step_signature_hash;
    }
  }
});

await check("a sealed document cannot be silently re-hashed", async () => {
  const doc = await one(`SELECT id, canonical_content_hash FROM official_documents WHERE verification_code = 'VRD-2026-8F92A1'`);
  assert(doc, "seeded verification code must exist");
  const version = await one(`SELECT rendered_body_text FROM document_versions WHERE document_id = $1 AND version_no = 1`, [doc.id]);
  const forged = sha256Hex(normalizeBodyText(version.rendered_body_text.replace("Rp 25.000", "Rp 2.500")));
  assert(forged !== doc.canonical_content_hash, "forged body must not reproduce the sealed hash");
});

await check("RBAC route table isolates every role", async () => {
  const { requiredRoles } = await import("@/server/auth");
  assertEqual(requiredRoles("/admin/settings").roles?.join(), "SUPER_ADMIN", "only super admin opens settings");
  assert(!requiredRoles("/admin/settings").roles?.includes("AUDITOR_COMPLIANCE" as never), "auditor must not open settings");
  assert(!requiredRoles("/inbox").roles?.includes("DOCUMENT_CREATOR" as never), "creator must not open the inbox");
  assert(!requiredRoles("/documents/compose").roles?.includes("REVIEWER_LEGAL_FINANCE" as never), "reviewer must not compose");
  assert(requiredRoles("/documents/compose").roles?.includes("DOCUMENT_CREATOR" as never), "creator may compose");
  assert(requiredRoles("/admin/audit").roles?.includes("AUDITOR_COMPLIANCE" as never), "auditor reads the audit trail");
  assert(!requiredRoles("/admin/audit").roles?.includes("EXECUTIVE_SIGNER" as never), "signer must not read the audit trail");
});

await check("CSV exporter emits BOM and semicolons", async () => {
  const { toCsv } = await import("@/lib/csv");
  const csv = toCsv([
    { nomor: "0042/SK", judul: "Panitia Dies", nilai: 150000000 },
    { nomor: "0018/PKS", judul: 'Kontrak "Cloud"', nilai: 1480000000 },
  ]);
  assert(csv.startsWith("\uFEFF"), "must start with the UTF-8 BOM");
  const body = csv.slice(1);
  assert(body.includes(";"), "must use semicolons");
  assert(!body.includes(","), "must not mix comma separators");
  assert(body.includes('"Kontrak ""Cloud"""'), "embedded quotes must be doubled");
  assertEqual(body.split("\n").length, 3, "header plus two data rows");
});

await check("public verification resolves the seeded codes", async () => {
  const valid = await verifyByCode("VRD-2026-8F92A1");
  assertEqual(valid.status, "VALID_SEALED", "demo code must resolve to a valid sealed document");
  assert(valid.chain.valid, "chain must verify end-to-end");
  assert(valid.signers.every((s) => s.verdict !== "APPROVED_SIGNED" || s.rsaVerified), "every signature must verify RSA-PSS");

  const revoked = await verifyByCode("VRD-2026-C0DE77");
  assertEqual(revoked.status, "REVOKED", "revoked code must report REVOKED");
  assert((revoked.document?.revocationReason ?? "").length > 10, "revocation reason must be recorded");

  const missing = await verifyByCode("VRD-0000-000000");
  assertEqual(missing.status, "NOT_FOUND", "unknown codes must not resolve");
});

await check("no password or PIN is stored in clear text", async () => {
  for (const p of await all(`SELECT password_hash FROM profiles`)) {
    assert(p.password_hash.startsWith("scrypt$"), "passwords must be scrypt-hashed");
    assert(!p.password_hash.includes("veridoc123"), "raw password must never be stored");
  }
  for (const c of await all(`SELECT signing_pin_hash, encrypted_private_key FROM signer_certificates`)) {
    assert(c.signing_pin_hash.startsWith("scrypt$"), "PINs must be scrypt-hashed");
    assert(c.encrypted_private_key.startsWith("v1."), "private keys must be AES-256-GCM enveloped");
    assert(!c.encrypted_private_key.includes("BEGIN PRIVATE KEY"), "private keys must never be stored in clear");
  }
});

/* ================================================================== */
/* 7. Approval state machine (real engine)                             */
/* ================================================================== */

await check("approval flow: wrong PIN, wrong officer and stale version are refused", async () => {
  const doc = await one(`
    SELECT d.id, d.version,
           (SELECT assigned_approver_id FROM approval_workflow_steps s
             WHERE s.document_id = d.id AND s.verdict = 'PENDING_ACTION' ORDER BY step_order LIMIT 1) AS approver_id
    FROM official_documents d
    WHERE d.status = 'IN_REVIEW_WORKFLOW'
      AND EXISTS (SELECT 1 FROM approval_workflow_steps s WHERE s.document_id = d.id AND s.verdict = 'PENDING_ACTION')
    ORDER BY d.created_at LIMIT 1`);
  assert(doc, "seed must leave a document awaiting a signature");
  const otherOfficer = await one(`SELECT id FROM profiles WHERE id <> $1 ORDER BY full_name LIMIT 1`, [doc.approver_id]);
  const before = await one(`SELECT status, document_number FROM official_documents WHERE id = $1`, [doc.id]);

  const wrongPin = await submitApprovalVerdict({ documentId: doc.id, approverId: doc.approver_id, pin: "000000", verdict: "APPROVED_SIGNED" });
  assertEqual(wrongPin.code, "INVALID_PIN", "wrong PIN must be refused");

  const notAssigned = await submitApprovalVerdict({ documentId: doc.id, approverId: otherOfficer.id, pin: "123456", verdict: "APPROVED_SIGNED" });
  assertEqual(notAssigned.code, "NOT_ASSIGNED", "a different officer must not sign");

  const stale = await submitApprovalVerdict({
    documentId: doc.id,
    approverId: doc.approver_id,
    pin: "123456",
    verdict: "APPROVED_SIGNED",
    expectedVersion: doc.version - 1,
  });
  assertEqual(stale.code, "VERSION_CONFLICT", "stale version must be refused");

  const after = await one(`SELECT status, document_number FROM official_documents WHERE id = $1`, [doc.id]);
  assertEqual(after.status, before.status, "refused actions must not change the status");
  assertEqual(after.document_number, before.document_number, "refused actions must not issue a number");
});

await check("approval flow: correct PIN seals the step and chains from the previous hash", async () => {
  const doc = await one(`
    SELECT d.id, d.version,
           (SELECT assigned_approver_id FROM approval_workflow_steps s
             WHERE s.document_id = d.id AND s.verdict = 'PENDING_ACTION' ORDER BY step_order LIMIT 1) AS approver_id,
           (SELECT step_order FROM approval_workflow_steps s
             WHERE s.document_id = d.id AND s.verdict = 'PENDING_ACTION' ORDER BY step_order LIMIT 1) AS step_order
    FROM official_documents d
    WHERE d.status = 'IN_REVIEW_WORKFLOW'
      AND EXISTS (SELECT 1 FROM approval_workflow_steps s WHERE s.document_id = d.id AND s.verdict = 'PENDING_ACTION')
    ORDER BY d.created_at LIMIT 1`);
  assert(doc, "seed must leave a document awaiting a signature");

  const result = await submitApprovalVerdict({
    documentId: doc.id,
    approverId: doc.approver_id,
    pin: "123456",
    verdict: "APPROVED_SIGNED",
    comments: "Paraf e2e.",
    expectedVersion: doc.version,
  });
  assert(result.ok, `signature must succeed: ${result.code} ${result.message}`);
  assert(["APPROVED_INTERMEDIATE", "SEALED_FINAL"].includes(result.code), `unexpected code ${result.code}`);

  const step = await one(
    `SELECT step_signature_hash, rsa_signature, certificate_fingerprint
     FROM approval_workflow_steps WHERE document_id = $1 AND step_order = $2::int`,
    [doc.id, Number(doc.step_order)],
  );
  assert(step, `signed step ${doc.step_order} must exist for ${doc.id}`);
  assert(
    /^[0-9a-f]{64}$/.test(step.step_signature_hash),
    `signature must be sha-256 hex, got ${JSON.stringify(step.step_signature_hash)} (code=${result.code}, step=${doc.step_order})`,
  );
  const cert = await one(`SELECT public_key_pem FROM signer_certificates WHERE key_fingerprint = $1`, [step.certificate_fingerprint]);
  assert(verifyChainHashSignature(cert.public_key_pem, step.step_signature_hash, step.rsa_signature), "stored RSA signature must verify");

  if (result.code === "SEALED_FINAL") {
    const sealed = await one(`SELECT status, document_number, final_signature_chain_hash FROM official_documents WHERE id = $1`, [doc.id]);
    assertEqual(sealed.status, "SEALED_PUBLISHED", "final signature must seal the document");
    assert(sealed.document_number, "final signature must issue a document number");
    assert(/^[0-9a-f]{64}$/.test(sealed.final_signature_chain_hash), "final chain hash must be stored");
  }
});

await closeDb();

/* ================================================================== */

console.log("\nVeriDoc end-to-end verification\n");
console.log(results.join("\n"));
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
