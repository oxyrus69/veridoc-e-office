/**
 * Isomorphic tamper-detection helpers. No node: imports so the same code can
 * run in the server and inside the browser-based Tamper Detection Lab.
 * The SHA-256 itself is provider-specific: node:cryoteri on the server
 * (cryptoMath.ts) and Web Crypto in the browser (TamperLab.tsx).
 */

export type TamperLine = {
  lineNo: number;
  original: string;
  modified: string;
};

export type TamperReport = {
  status: "VALID" | "TAMPERED";
  changedLines: TamperLine[];
  lineCountDelta: number;
  identicalPrefixChars: number;
  avalancheBits: number | null;
};

/** `\r\n` and lone `\r` collapse to `\n`; trailing whitespace is trimmed per line. */
export function normalizeBodyText(body: string): string {
  return body
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
}

/** Longest common prefix between two strings, by characters. */
export function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i += 1;
  return i;
}

/** Number of differing bits between two equal-length hex digests. */
export function bitDifference(a: string, b: string): number {
  let diff = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    diff += ((x >> 3) & 1) + ((x >> 2) & 1) + ((x >> 1) & 1) + (x & 1);
  }
  return diff;
}

/** Line-by-line diff between normalized texts. */
export function diffLines(originalText: string, modifiedText: string) {
  const original = normalizeBodyText(originalText);
  const modified = normalizeBodyText(modifiedText);
  const originalLines = original.split("\n");
  const modifiedLines = modified.split("\n");
  const changed: TamperLine[] = [];
  const max = Math.max(originalLines.length, modifiedLines.length);
  for (let i = 0; i < max; i += 1) {
    if (originalLines[i] === modifiedLines[i]) continue;
    changed.push({ lineNo: i + 1, original: originalLines[i] ?? "", modified: modifiedLines[i] ?? "" });
  }
  return { original, modified, changed, lineCountDelta: modifiedLines.length - originalLines.length };
}

/** Final structured report given the digests and the diff. */
export function buildTamperReport(params: {
  originalText: string;
  modifiedText: string;
  originalHash: string;
  modifiedHash: string;
}): TamperReport {
  const diff = diffLines(params.originalText, params.modifiedText);
  return {
    status: params.modifiedHash !== params.originalHash || diff.changed.length > 0 ? "TAMPERED" : "VALID",
    changedLines: diff.changed,
    lineCountDelta: diff.lineCountDelta,
    identicalPrefixChars: commonPrefixLength(diff.original, diff.modified),
    avalancheBits: params.modifiedHash.length === 64 ? bitDifference(params.originalHash, params.modifiedHash) : null,
  };
}
