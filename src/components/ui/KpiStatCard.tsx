import { TrendingDown, TrendingUp } from "lucide-react";

export type KpiCardProps = {
  label: string;
  value: string;
  delta?: { value: string; tone: "up" | "down" | "flat"; label?: string };
  sparkline?: number[];
  footer: string;
  tone?: "default" | "warning" | "danger" | "success";
};

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);
  const width = 64;
  const height = 24;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      <polyline points={points} fill="none" stroke="var(--accent-interactive)" strokeWidth="1.5" strokeLinejoin="round" />
      {values.map((v, i) => {
        const x = (i / (values.length - 1)) * width;
        const y = height - ((v - min) / range) * height;
        return <circle key={i} cx={x} cy={y} r="1.4" fill="var(--accent-interactive)" />;
      })}
    </svg>
  );
}

export function KpiStatCard({ label, value, delta, sparkline, footer, tone = "default" }: KpiCardProps) {
  const toneBorder = {
    default: "border-zinc-200/80",
    warning: "border-amber-200 bg-amber-50/40",
    danger: "border-red-200 bg-red-50/40",
    success: "border-emerald-200 bg-emerald-50/40",
  }[tone];

  return (
    <article className={`flex min-h-[128px] flex-col justify-between rounded-[var(--radius-lg)] border bg-white p-4 ${toneBorder}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</p>
        {delta ? (
          <span
            className={`inline-flex items-center gap-1 rounded-[var(--radius-sm)] border px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
              delta.tone === "up"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : delta.tone === "down"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-zinc-200 bg-zinc-50 text-zinc-500"
            }`}
            title={delta.label}
          >
            {delta.tone === "up" ? <TrendingUp className="h-3 w-3" /> : delta.tone === "down" ? <TrendingDown className="h-3 w-3" /> : null}
            {delta.value}
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="font-mono text-2xl font-bold tracking-tight text-zinc-900 tabular-nums">{value}</p>
        {sparkline && sparkline.length > 1 ? <Sparkline values={sparkline} /> : null}
      </div>

      <p className="mt-3 border-t border-zinc-100 pt-2 text-[11px] leading-4 text-zinc-500">{footer}</p>
    </article>
  );
}
