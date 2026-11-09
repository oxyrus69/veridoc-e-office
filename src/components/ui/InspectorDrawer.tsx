"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Clock, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

export type DrawerTab = "summary" | "history";

export function InspectorDrawer({
  open,
  onClose,
  title,
  badges,
  summary,
  history,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  badges?: React.ReactNode;
  summary: React.ReactNode;
  history: { actor: string; role: string; atLabel: string; action: string; detail?: string }[];
  actions?: React.ReactNode;
}) {
  const [tab, setTab] = useState<DrawerTab>("summary");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setTab("summary");
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Panel inspeksi">
      <div className="absolute inset-0 bg-zinc-950/25" onClick={onClose} />
      <div
        ref={panelRef}
        className="absolute inset-y-0 right-0 flex w-full max-w-[500px] flex-col bg-white shadow-xl ring-1 ring-zinc-950/5 sm:w-[480px]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">{badges}</div>
            <h2 className="mt-2 text-[15px] font-semibold tracking-tight text-zinc-900">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panel"
            className="rounded-[var(--radius-sm)] p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex border-b border-zinc-200">
          {(
            [
              ["summary", "Ringkasan & Metadata"],
              ["history", "Riwayat & Jejak Audit"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`relative flex-1 px-4 py-2.5 text-[12px] font-medium transition-colors ${
                tab === key ? "text-zinc-900" : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {label}
              {tab === key ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--accent-interactive)]" /> : null}
            </button>
          ))}
        </div>

        <div className="thin-scroll flex-1 overflow-y-auto px-5 py-4">
          {tab === "summary" ? (
            <div className="space-y-4 text-[13px] leading-5 text-zinc-700">{summary}</div>
          ) : (
            <ol className="relative ml-2 space-y-4 border-l border-zinc-200 pl-5">
              {history.length === 0 ? (
                <li className="text-sm text-zinc-500">Belum ada aktivitas yang tercatat.</li>
              ) : (
                history.map((entry, index) => (
                  <li key={index} className="relative">
                    <span className="absolute -left-[26px] top-1 h-2 w-2 rounded-full border-2 border-white bg-[var(--accent-interactive)] ring-2 ring-[var(--accent-interactive)]/20" />
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-[13px] font-medium text-zinc-800">{entry.action}</p>
                      <span className="flex items-center gap-1 text-[11px] text-zinc-400">
                        <Clock className="h-3 w-3" />
                        {entry.atLabel}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {entry.actor} · {entry.role}
                    </p>
                    {entry.detail ? <p className="mt-1.5 text-xs leading-4 text-zinc-600">{entry.detail}</p> : null}
                  </li>
                ))
              )}
            </ol>
          )}
        </div>

        {actions ? (
          <footer className="flex items-center justify-between gap-3 border-t border-zinc-200 px-5 py-3">
            {actions}
            <button type="button" onClick={onClose} className="ml-auto text-[12px] font-medium text-zinc-500 hover:text-zinc-700">
              Tutup <span aria-hidden>→</span>
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}

export function DrawerRow({ label, children, right = false }: { label: string; children: React.ReactNode; right?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-2">
      <span className="w-36 shrink-0 pt-0.5 text-xs text-zinc-500">{label}</span>
      <span className={`min-w-0 flex-1 text-[13px] text-zinc-800 ${right ? "text-right font-mono tabular-nums" : ""}`}>
        {children}
      </span>
    </div>
  );
}

export function DrawerLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] text-[12px] font-medium text-[var(--accent-interactive)] hover:underline"
    >
      {children}
      <ChevronRight className="h-3 w-3" />
    </a>
  );
}
