/**
 * VeriDoc — pure cryptographic primitives.
 *
 * Everything here is deterministic and side-effect free so the same code can
 * run inside the Next.js server, inside `scripts/seed.mjs` (via node) and
 * inside `scripts/e2e-verify.mjs`.
 */
import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
  createSign,
  createVerify,
  generateKeyPairSync,
  constants,
} from "node:crypto";

export const GENESIS_CHAIN = "GENESIS_VERIDOC_CHAIN";

/* ------------------------------------------------------------------ */
/* Canonicalisation                                                    */
/* ------------------------------------------------------------------ */

export type CanonicalDocumentInput = {
  title: string;
  category: string;
  documentNumber: string;
  variablesPayload: Record<string, unknown>;
  renderedBodyText: string;
};

/** Deterministic key-sorted JSON serialisation (deep). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
  return `{${entries.join(",")}}`;
}

/** `\r\n` and lone `\r` collapse to `\n`; trailing whitespace is trimmed per line. */
export function normalizeBodyText(body: string): string {
  return body
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * H_doc = SHA256( CanonicalJSON(metadata) || NormalizedBody )
 * Returns 64 lowercase hex characters.
 */
export function computeCanonicalDocumentHashPure(input: CanonicalDocumentInput): string {
  const metadata = {
    title: input.title.trim(),
    category: input.category,
    document_number: input.documentNumber,
    variables_payload_json: input.variablesPayload,
  };
  return sha256Hex(canonicalJson(metadata) + normalizeBodyText(input.renderedBodyText));
}

/* ------------------------------------------------------------------ */
/* Hash-chained signatures                                             */
/* ------------------------------------------------------------------ */

export type ChainedSignatureInput = {
  contentHash: string;
  previousSignatureHash: string;
  approverId: string;
  timestamp: string;
  key: string;
};

/**
 * S_i = HMAC_SHA256_Key_i( H_doc || S_(i-1) || ApproverId_i || Timestamp_i )
 */
export function computeChainedSignaturePure(input: ChainedSignatureInput): string {
  const payload = [input.contentHash, input.previousSignatureHash || GENESIS_CHAIN, input.approverId, input.timestamp].join("|");
  return createHmac("sha256", input.key).update(payload, "utf8").digest("hex");
}

/**
 * Per-officer HMAC key: SHA-256(pin || ":" || certificateFingerprint).
 * Knowing the PIN is required to produce a valid step signature.
 */
export function deriveSigningKey(pin: string, certificateFingerprint: string): string {
  return sha256Hex(`${pin}:${certificateFingerprint}`);
}

/** Final seal = SHA-256 over the ordered list of step signatures. */
export function computeFinalChainHash(stepSignatures: string[]): string {
  return sha256Hex(stepSignatures.join("->"));
}

/** Human readable fingerprint used on certificates and QR footers. */
export function formatFingerprint(hex: string): string {
  return (hex.match(/.{1,4}/g) ?? []).join(":").toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Tamper detection                                                    */
/* ------------------------------------------------------------------ */

export type TamperLine = {
  lineNo: number;
  original: string;
  modified: string;
};

export type TamperResult = {
  status: "VALID" | "TAMPERED";
  originalHash: string;
  modifiedHash: string;
  identicalPrefixChars: number;
  avalancheBits: number;
  changedLines: TamperLine[];
  lineCountDelta: number;
};

/** Longest common prefix between two strings, by characters. */
function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i += 1;
  return i;
}

/** Number of differing bits between two equal-length hex digests. */
function bitDifference(a: string, b: string): number {
  let diff = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    diff += ((x >> 3) & 1) + ((x >> 2) & 1) + ((x >> 1) & 1) + (x & 1);
  }
  return diff;
}

/**
 * Diffs the sealed text against the text supplied by the verifier and reports
 * exactly which lines were altered so the UI can point at the tampered line.
 */
export function verifyAndDetectTamperingPure(params: {
  originalText: string;
  modifiedText: string;
  originalHash: string;
}): TamperResult {
  const original = normalizeBodyText(params.originalText);
  const modified = normalizeBodyText(params.modifiedText);
  const modifiedHash = sha256Hex(modified);

  const originalLines = original.split("\n");
  const modifiedLines = modified.split("\n");
  const changedLines: TamperLine[] = [];
  const max = Math.max(originalLines.length, modifiedLines.length);
  for (let i = 0; i < max; i += 1) {
    const a = originalLines[i];
    const b = modifiedLines[i];
    if (a === b) continue;
    changedLines.push({
      lineNo: i + 1,
      original: a ?? "",
      modified: b ?? "",
    });
  }

  const tampered = modifiedHash !== params.originalHash || changedLines.length > 0;

  return {
    status: tampered ? "TAMPERED" : "VALID",
    originalHash: params.originalHash,
    modifiedHash,
    identicalPrefixChars: commonPrefixLength(original, modified),
    avalancheBits: bitDifference(params.originalHash, modifiedHash),
    changedLines,
    lineCountDelta: modifiedLines.length - originalLines.length,
  };
}

/* ------------------------------------------------------------------ */
/* Signing PIN storage                                                 */
/* ------------------------------------------------------------------ */

const SCRYPT_KEYLEN = 32;

/** `scrypt$salt$hash` — never store or log the raw PIN. */
export function hashSigningPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(pin, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifySigningPin(pin: string, stored: string): boolean {
  const [scheme, salt, digest] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !digest) return false;
  const derived = scryptSync(pin, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(digest, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(derived, expected);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  return verifySigningPin(password, stored);
}

/* ------------------------------------------------------------------ */
/* AES-256-GCM private key envelope                                    */
/* ------------------------------------------------------------------ */

const IV_LENGTH = 12;

export function deriveEnvelopeKey(secret: string): Buffer {
  return scryptSync(secret, "veridoc-key-envelope-v1", 32);
}

export function encryptPrivateKey(privateKeyPem: string, secret: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", deriveEnvelopeKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(privateKeyPem, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptPrivateKey(envelope: string, secret: string): string {
  const [version, ivB64, tagB64, dataB64] = envelope.split(".");
  if (version !== "v1") throw new Error("Unsupported key envelope version");
  const decipher = createDecipheriv("aes-256-gcm", deriveEnvelopeKey(secret), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]).toString("utf8");
}

/* ------------------------------------------------------------------ */
/* RSA-PSS asymmetric signature over the chain hash                    */
/* ------------------------------------------------------------------ */

export function generateRsaPssKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

/** Signs with RSA-SHA256 using PSS padding (salt length 32). */
export function signChainHash(privateKeyPem: string, chainHash: string): string {
  const signer = createSign("RSA-SHA256");
  signer.update(chainHash);
  signer.end();
  return signer.sign({ key: privateKeyPem, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }).toString("base64");
}

export function verifyChainHashSignature(publicKeyPem: string, chainHash: string, signatureB64: string): boolean {
  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(chainHash);
    verifier.end();
    return verifier.verify(
      { key: publicKeyPem, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
      Buffer.from(signatureB64, "base64"),
    );
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Verification code                                                   */
/* ------------------------------------------------------------------ */

export function generateVerificationCode(year: number, rand: () => number = () => Math.random()): string {
  const alphabet = "0123456789ABCDEF";
  let suffix = "";
  for (let i = 0; i < 6; i += 1) suffix += alphabet[Math.floor(rand() * alphabet.length)];
  return `VRD-${year}-${suffix}`;
}

export const ROMAN_MONTHS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/** Expands `SK/{{YEAR}}/{{ROMAN_MONTH}}/{{SEQ}}` style formats. */
export function buildDocumentNumber(params: {
  format: string;
  year: number;
  monthIndex: number;
  sequence: number;
  department?: string;
}): string {
  const seq = String(params.sequence).padStart(4, "0");
  return params.format
    .replaceAll("{{YEAR}}", String(params.year))
    .replaceAll("{{ROMAN_MONTH}}", ROMAN_MONTHS[params.monthIndex] ?? "I")
    .replaceAll("{{MONTH}}", String(params.monthIndex + 1).padStart(2, "0"))
    .replaceAll("{{SEQ}}", seq)
    .replaceAll("{{DEPT}}", params.department ?? "VRD");
}
