import { toneClasses } from "@/lib/dom";

export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral" | "seal";
export type BadgeSize = "sm" | "md";

const toneExtra: Record<BadgeTone, string> = {
  seal: "border-[var(--seal-border)] bg-[var(--seal-soft)] text-[var(--seal)]",
  success: "",
  warning: "",
  danger: "",
  info: "",
  neutral: "",
};

export function Badge({
  tone = "neutral",
  children,
  size = "sm",
  mono = false,
  title,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  size?: BadgeSize;
  mono?: boolean;
  title?: string;
}) {
  const toneClass =
    tone === "seal" || tone === "neutral"
      ? tone === "seal"
        ? toneExtra.seal
        : toneClasses("neutral")
      : toneClasses(tone as Exclude<BadgeTone, "seal">);

  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-[var(--radius-sm)] border px-2 font-medium leading-4 ${
        size === "sm" ? "py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      } ${mono ? "font-mono tabular-nums" : ""} ${toneClass}`}
    >
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: "success" | "warning" | "danger" | "info" | "neutral" }) {
  const color = {
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-red-500",
    info: "bg-blue-500",
    neutral: "bg-zinc-400",
  }[tone];
  return <span aria-hidden className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />;
}
