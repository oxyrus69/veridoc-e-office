"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Command, Search } from "lucide-react";
import { Kbd } from "@/components/ui/Kbd";
import { commandTargets } from "@/lib/nav-data";

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const items = useMemo(() => {
    const base = commandTargets();
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (item) => item.label.toLowerCase().includes(q) || item.keywords.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
        setActive(0);
        return;
      }
      if (!open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((a) => Math.min(a + 1, items.length - 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
        return;
      }
      if (event.key === "Enter" && items[active]) {
        event.preventDefault();
        setOpen(false);
        router.push(items[active].href);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items, active, router]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-2 rounded-[var(--radius-md)] border border-zinc-300 bg-white px-2.5 text-[12px] font-medium text-zinc-500 transition-colors hover:bg-zinc-50"
        aria-label="Buka palet perintah (Ctrl+K)"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden md:inline">Cari atau lompat ke halaman</span>
        <span className="hidden items-center gap-1 md:flex">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-zinc-950/30 px-4 pt-[12vh] backdrop-blur-[1px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Palet perintah"
        >
          <div className="w-full max-w-lg overflow-hidden rounded-[var(--radius-lg)] bg-white shadow-xl ring-1 ring-zinc-950/5">
            <div className="flex items-center gap-2 border-b border-zinc-200 px-3.5 py-3">
              <Command className="h-4 w-4 text-zinc-400" />
              <input
                autoFocus
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                placeholder="Ketik nama halaman, dokumen, atau aksi…"
                className="h-6 w-full bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-[var(--radius-sm)] px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-100"
              >
                Esc
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto py-1.5">
              {items.length === 0 ? (
                <p className="px-3.5 py-6 text-sm text-zinc-500">Tidak ada halaman atau aksi yang cocok.</p>
              ) : (
                items.map((item, index) => (
                  <button
                    key={item.href + item.label}
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => {
                      setOpen(false);
                      router.push(item.href);
                    }}
                    className={`flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-[13px] ${
                      index === active ? "bg-zinc-100" : ""
                    }`}
                  >
                    <span className="truncate font-medium text-zinc-800">{item.label}</span>
                    <span className="shrink-0 rounded-[var(--radius-sm)] bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      {item.group === "action" ? "Aksi" : "Halaman"}
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className="flex items-center gap-3 border-t border-zinc-200 px-3.5 py-2 text-[11px] text-zinc-400">
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                navigasi
              </span>
              <span className="flex items-center gap-1">
                <Kbd>Enter</Kbd>
                buka
              </span>
              <span className="flex items-center gap-1">
                <Kbd>Esc</Kbd>
                tutup
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
