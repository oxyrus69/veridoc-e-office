/* Shared presentation helpers (Tailwind class strings). */

export function toneClasses(tone: "success" | "warning" | "danger" | "info" | "neutral"): string {
  switch (tone) {
    case "success":
      return "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]";
    case "warning":
      return "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]";
    case "danger":
      return "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]";
    case "info":
      return "border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-fg)]";
    default:
      return "border-zinc-200 bg-zinc-100 text-zinc-600";
  }
}
