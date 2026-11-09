/**
 * Excel-friendly CSV serialiser.
 * - Starts with the UTF-8 BOM so Excel on Windows detects the encoding.
 * - Uses `;` as the delimiter (Indonesian locale default).
 * - Doubles embedded quotes and strips line breaks inside a cell.
 */
export function toCsv(rows: Record<string, unknown>[]): string {
  const headers = Object.keys(rows[0] ?? {});
  if (headers.length === 0) return "\uFEFF";
  const escape = (value: unknown) => `"${String(value ?? "").replace(/\r?\n/g, " ").replace(/"/g, '""')}"`;
  const lines = rows.map((row) => headers.map((header) => escape(row[header])).join(";"));
  return "\uFEFF" + headers.join(";") + "\n" + lines.join("\n");
}
