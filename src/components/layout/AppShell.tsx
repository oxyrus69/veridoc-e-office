"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  Boxes,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Files,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Mail,
  Menu,
  Radar,
  ShieldCheck,
  Sliders,
  Stethoscope,
  Users,
  X,
} from "lucide-react";
import CommandPalette from "@/components/ui/CommandPalette";
import { Badge as UiBadge } from "@/components/ui/Badge";
import { logoutAction } from "@/server/actions";


type UserRole = "SUPER_ADMIN" | "EXECUTIVE_SIGNER" | "REVIEWER_LEGAL_FINANCE" | "DOCUMENT_CREATOR" | "AUDITOR_COMPLIANCE";

export type AppUser = {
  u: string;
  r: UserRole;
  n: string;
  e: string;
  department: string;
  jobTitle: string;
  certificateFingerprint: string | null;
  certificateStatus: string | null;
};

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[] | null;
  badge?: string;
  children?: { label: string; href: string }[];
};

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Operasional",
    items: [
      { label: "Dasbor", href: "/admin", icon: LayoutDashboard, roles: ["SUPER_ADMIN"] },
      { label: "Kotak Masuk Paraf", href: "/inbox", icon: ClipboardCheck, roles: ["EXECUTIVE_SIGNER", "REVIEWER_LEGAL_FINANCE"], badge: "inbox" },
      { label: "Repositori Dokumen", href: "/documents", icon: Files, roles: null },
      { label: "Studio Penyusunan", href: "/documents/compose", icon: FileText, roles: ["DOCUMENT_CREATOR", "SUPER_ADMIN"] },
      { label: "Template Naskah", href: "/templates", icon: Boxes, roles: null },
      { label: "Agenda Disposisi", href: "/dispositions", icon: Mail, roles: null },
    ],
  },
  {
    title: "Verifikasi & Kunci",
    items: [
      {
        label: "Verifikasi Publik",
        href: "/verify",
        icon: ShieldCheck,
        roles: null,
        children: [{ label: "Tamper Detection Lab", href: "/verify/VRD-2026-8F92A1?tab=lab" }],
      },
      { label: "Sertifikat Penandatangan", href: "/certificates", icon: KeyRound, roles: null },
    ],
  },
  {
    title: "Keputusan & Kepatuhan",
    items: [
      { label: "DSS Tata Kelola", href: "/dss", icon: Gauge, roles: ["SUPER_ADMIN", "EXECUTIVE_SIGNER", "AUDITOR_COMPLIANCE"] },
      { label: "Leher Botol Persetujuan", href: "/dss/bottlenecks", icon: Activity, roles: ["SUPER_ADMIN", "AUDITOR_COMPLIANCE"] },
      { label: "Radar Kedaluwarsa", href: "/dss/expiry-radar", icon: Radar, roles: ["SUPER_ADMIN", "AUDITOR_COMPLIANCE"] },
      { label: "Riwayat Keputusan", href: "/dss/riwayat", icon: Stethoscope, roles: ["SUPER_ADMIN", "AUDITOR_COMPLIANCE"] },
    ],
  },
  {
    title: "Administrasi",
    items: [
      { label: "Jejak Audit", href: "/admin/audit", icon: ClipboardList, roles: ["SUPER_ADMIN", "AUDITOR_COMPLIANCE"] },
      { label: "Pengaturan", href: "/admin/settings", icon: Sliders, roles: ["SUPER_ADMIN"] },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  user,
  badges,
  children,
}: {
  user: AppUser;
  badges: { inboxCount: number; dssCount: number };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const readOnly = user.r === "AUDITOR_COMPLIANCE";

  const roleLabel = {
    SUPER_ADMIN: "Super Admin",
    EXECUTIVE_SIGNER: "Penandatangan Eksekutif",
    REVIEWER_LEGAL_FINANCE: "Reviewer Legal & Keuangan",
    DOCUMENT_CREATOR: "Penyusun Dokumen",
    AUDITOR_COMPLIANCE: "Auditor Kepatuhan",
  }[user.r];

  const filtered = SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.roles || item.roles.includes(user.r)),
  })).filter((s) => s.items.length > 0);

  return (
    <div className="min-h-screen bg-[var(--bg-canvas)] text-zinc-900">
      {/* Zone A — navigation rail */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex flex-col border-r border-zinc-200/80 bg-white transition-[width,transform] duration-200 ${
          collapsed ? "w-16" : "w-60"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
        aria-label="Navigasi utama"
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-zinc-200/80 px-3.5">
          <div
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--seal)] font-mono text-sm font-bold text-white"
          >
            Vd
          </div>
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold tracking-tight">VeriDoc</p>
              <p className="truncate text-[11px] text-zinc-500">E-Office & Verifikasi</p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="ml-auto rounded-[var(--radius-sm)] p-1 text-zinc-400 hover:bg-zinc-100 md:hidden"
            aria-label="Tutup navigasi"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* workspace switcher */}
        <div className="border-b border-zinc-100 px-3 py-2.5">
          <button
            type="button"
            className={`flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-zinc-200 px-2.5 py-2 text-left text-[12px] font-medium transition-colors hover:bg-zinc-50 ${
              collapsed ? "justify-center" : ""
            }`}
            title="Pilih ruang kerja"
          >
            <div className="min-w-0 flex-1 text-left">
              {!collapsed ? (
                <>
                  <p className="truncate">Kantor Pusat</p>
                  <p className="truncate text-[11px] font-normal text-zinc-400">veridoc.id</p>
                </>
              ) : (
                <span className="sr-only">Kantor Pusat</span>
              )}
            </div>
            {!collapsed ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" /> : null}
          </button>
        </div>

        <nav className="thin-scroll flex-1 overflow-y-auto px-2 py-3" aria-label="Menu">
          {filtered.map((section) => (
            <div key={section.title}>
              {!collapsed ? (
                <p className="px-2.5 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  {section.title}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(pathname, item.href);
                  const count = item.badge === "inbox" ? badges.inboxCount : 0;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        className={`group flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-[13px] font-medium transition-colors ${
                          active ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100"
                        } ${collapsed ? "justify-center" : ""}`}
                        aria-current={active ? "page" : undefined}
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-zinc-400 group-hover:text-zinc-600"}`} />
                        {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
                        {!collapsed && count > 0 ? (
                          <span className={`inline-flex min-w-[22px] justify-center rounded-[3px] px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums ${
                            active ? "bg-white/15 text-white" : "bg-amber-100 text-amber-800"
                          }`}>
                            {count}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* footer: health + user */}
        <div className={`border-t border-zinc-200/80 px-3 py-3 ${collapsed ? "space-y-2" : "space-y-3"}`}>
          <div className={`flex items-center gap-2 ${collapsed ? "justify-center" : ""}`}>
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            {!collapsed ? (
              <p className="text-[11px] leading-4 text-zinc-500">
                DB: <span className="font-medium text-zinc-700">Online; PGlite lokal</span>
              </p>
            ) : null}
          </div>
          {!collapsed ? (
            <div className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-zinc-200 bg-zinc-50/60 px-2.5 py-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-semibold text-white">
                {user.n
                  .split(" ")
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-zinc-800">{user.n}</p>
                <p className="truncate text-[11px] text-zinc-500">{user.jobTitle}</p>
              </div>
              <UiBadge tone={readOnly ? "info" : "seal"}>{roleLabel}</UiBadge>
              <form action={logoutAction} className="shrink-0" title="Keluar dari sesi ini">
                <button
                  type="submit"
                  aria-label="Keluar"
                  className="rounded-[var(--radius-sm)] border border-zinc-300 bg-white px-1.5 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50"
                >
                  Keluar
                </button>
              </form>
            </div>
          ) : (
            <div className="flex justify-center">
              <div
                title={`${user.n} — ${user.jobTitle} (${roleLabel})`}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-[11px] font-semibold text-white"
              >
                {user.n
                  .split(" ")
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* overlay on mobile */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-20 bg-zinc-950/30 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      ) : null}

      {/* main pane */}
      <div className={`flex min-h-screen flex-col transition-[padding] duration-200 ${collapsed ? "md:pl-16" : "md:pl-60"}`}>
        {/* Zone B — top utility bar */}
        <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-zinc-200/80 bg-white/95 px-3 backdrop-blur md:px-4">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-[var(--radius-sm)] p-2 text-zinc-500 hover:bg-zinc-100 md:hidden"
            aria-label="Buka navigasi"
          >
            <Menu className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="hidden rounded-[var(--radius-sm)] p-2 text-zinc-500 hover:bg-zinc-100 md:block"
            aria-label={collapsed ? "Buka navigasi" : "Sembunyikan navigasi"}
            title={collapsed ? "Buka navigasi" : "Sembunyikan navigasi"}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? "rotate-90" : "rotate-[-90deg]"}`} />
          </button>

          <nav aria-label="Breadcrumb" className="hidden min-w-0 flex-1 items-center gap-1 text-[12px] text-zinc-500 sm:flex">
            <Link href="/" className="hover:text-zinc-700">
              VeriDoc
            </Link>
            <span aria-hidden>/</span>
            <span className="truncate text-zinc-800" />
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <CommandPalette />
            <div className="hidden items-center gap-2 rounded-[var(--radius-md)] border border-zinc-200 bg-zinc-50/70 px-2.5 py-1.5 sm:flex" title="Status kesehatan sistem">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] font-medium text-zinc-500">Sinkron: 0 pending</span>
            </div>
            <Link
              href="/verify"
              className="hidden items-center gap-2 rounded-[var(--radius-md)] border border-[var(--seal-border)] bg-[var(--seal-soft)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--seal)] transition-colors hover:bg-orange-100 sm:flex"
              title="Uji verifikasi QR publik"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Portal verifikasi
            </Link>
            <button
              type="button"
              className="relative rounded-[var(--radius-sm)] p-2 text-zinc-500 hover:bg-zinc-100"
              aria-label="Notifikasi DSS"
              title="Notifikasi DSS"
            >
              <Users className="h-4 w-4" />
              {badges.dssCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 font-mono text-[10px] font-semibold text-white">
                  {badges.dssCount}
                </span>
              ) : null}
            </button>
          </div>
        </header>

        <div className="flex-1 bg-[var(--bg-canvas)]">{children}</div>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  count,
  description,
  actions,
  children,
}: {
  title: string;
  count?: number;
  description?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-zinc-200/80 bg-white px-4 py-3 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[15px] font-semibold tracking-tight text-zinc-900">{title}</h1>
            {count !== undefined ? (
              <span className="rounded-[var(--radius-sm)] bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-zinc-600">
                {count}
              </span>
            ) : null}
          </div>
          {description ? <p className="mt-0.5 max-w-3xl text-xs text-zinc-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function PageBody({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[1440px] px-4 py-4 md:px-6">{children}</div>;
}
