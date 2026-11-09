import type { ReactNode } from "react";

export function Segmented({
  options,
  active,
  name,
}: {
  options: { value: string; label: string }[];
  active: string;
  name: string;
}) {
  return (
    <div className="flex items-center rounded-[var(--radius-md)] border border-zinc-300 bg-white p-0.5" role="tablist" aria-label={name}>
      {options.map((option) => {
        const isActive = option.value === active;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled
            className={`rounded-[3px] px-2.5 py-1 text-[12px] font-medium ${
              isActive ? "bg-zinc-900 text-white" : "text-zinc-500"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-zinc-300 bg-white p-8 text-center">
      <h3 className="text-sm font-semibold text-zinc-800">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-5 text-zinc-500">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  action,
  children,
  className = "",
  padded = true,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/80 px-4 py-2.5">
        <div>
          <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</p> : null}
        </div>
        {action}
      </header>
      <div className={padded ? "px-4 py-3" : ""}>{children}</div>
    </section>
  );
}

export function HealthBar({ healthy, warning, critical }: { healthy: number; warning: number; critical: number }) {
  const total = Math.max(healthy + warning + critical, 1);
  const pct = (v: number) => `${(v / total) * 100}%`;
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-zinc-100">
        {healthy > 0 ? <span style={{ width: pct(healthy) }} className="bg-emerald-500" title={`Sehat ${pct(healthy)}`} /> : null}
        {warning > 0 ? <span style={{ width: pct(warning) }} className="bg-amber-500" title={`Peringatan ${pct(warning)}`} /> : null}
        {critical > 0 ? <span style={{ width: pct(critical) }} className="bg-red-500" title={`Kritis ${pct(critical)}`} /> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Sehat {healthy}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Peringatan {warning}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Kritis {critical}
        </span>
      </div>
    </div>
  );
}
