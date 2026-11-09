import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentUser } from "@/server/session";
import { countPendingForUser } from "@/server/services/approvalEngine";
import { computeDss } from "@/server/services/dssEngine";
import { databaseModeLabel } from "@/server/db";

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [inboxCount, dss] = await Promise.all([
    countPendingForUser(user.u).catch(() => 0),
    computeDss().catch(() => ({ findings: [] as { severity: string }[] })),
  ]);

  return (
    <AppShell
      user={user}
      badges={{ inboxCount, dssCount: (dss.findings ?? []).filter((f) => f.severity === "CRITICAL").length }}
    >
      <div className="no-print flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50/70 px-4 py-1.5 text-[11px] text-amber-800 md:px-6">
        <p className="truncate">
          Mode demo — database <span className="font-medium">{databaseModeLabel()}</span> — kata sandi{" "}
          <code className="font-mono">veridoc123</code>, PIN paraf <code className="font-mono">123456</code>.
        </p>
        <Link
          href="/verify/VRD-2026-8F92A1"
          className="shrink-0 font-medium text-amber-900 underline decoration-amber-400 underline-offset-2 hover:decoration-amber-800"
        >
          Uji QR publik
        </Link>
      </div>
      {children}
    </AppShell>
  );
}
