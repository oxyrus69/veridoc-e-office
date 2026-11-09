export type DiffOp = {
  type: "equal" | "added" | "removed" | "changed";
  lineNo: number;
  before: string;
  after: string;
};

export type DiffSummary = {
  ops: DiffOp[];
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  identical: boolean;
};

/**
 * Line-oriented diff. When a line is replaced it is reported as `changed`
 * (before + after in the same row) so a reviewer sees the pair, not two
 * unrelated rows.
 */
export function diffText(before: string, after: string): DiffSummary {
  const a = before.replace(/\r\n/g, "\n").split("\n");
  const b = after.replace(/\r\n/g, "\n").split("\n");

  // Longest common subsequence over lines (n*m, documents are small).
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const raw: { type: "equal" | "added" | "removed"; before: string; after: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      raw.push({ type: "equal", before: a[i], after: b[j] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      raw.push({ type: "removed", before: a[i], after: "" });
      i += 1;
    } else {
      raw.push({ type: "added", before: "", after: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    raw.push({ type: "removed", before: a[i], after: "" });
    i += 1;
  }
  while (j < m) {
    raw.push({ type: "added", before: "", after: b[j] });
    j += 1;
  }

  // Collapse removed+added runs into changed pairs, preserving order.
  const ops: DiffOp[] = [];
  let lineNo = 1;
  let k = 0;
  let added = 0;
  let removed = 0;
  let changed = 0;
  let unchanged = 0;

  while (k < raw.length) {
    const item = raw[k];
    if (item.type === "equal") {
      ops.push({ type: "equal", lineNo, before: item.before, after: item.after });
      unchanged += 1;
      lineNo += 1;
      k += 1;
      continue;
    }

    const removedRun: string[] = [];
    const addedRun: string[] = [];
    while (k < raw.length && raw[k].type === "removed") {
      removedRun.push(raw[k].before);
      k += 1;
    }
    while (k < raw.length && raw[k].type === "added") {
      addedRun.push(raw[k].after);
      k += 1;
    }

    const pairCount = Math.min(removedRun.length, addedRun.length);
    for (let p = 0; p < pairCount; p += 1) {
      ops.push({ type: "changed", lineNo, before: removedRun[p], after: addedRun[p] });
      changed += 1;
      lineNo += 1;
    }
    for (let p = pairCount; p < removedRun.length; p += 1) {
      ops.push({ type: "removed", lineNo, before: removedRun[p], after: "" });
      removed += 1;
      lineNo += 1;
    }
    for (let p = pairCount; p < addedRun.length; p += 1) {
      ops.push({ type: "added", lineNo, before: "", after: addedRun[p] });
      added += 1;
      lineNo += 1;
    }
  }

  return {
    ops,
    added,
    removed,
    changed,
    unchanged,
    identical: added === 0 && removed === 0 && changed === 0,
  };
}

/** Variable-level diff for the payload table. */
export function diffVariables(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { key: string; before: string; after: string; status: "same" | "changed" | "added" | "removed" }[] {
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  return keys.map((key) => {
    const a = before[key] === undefined ? "" : String(before[key]);
    const b = after[key] === undefined ? "" : String(after[key]);
    const status = !(key in before) ? "added" : !(key in after) ? "removed" : a === b ? "same" : "changed";
    return { key, before: a, after: b, status };
  });
}
