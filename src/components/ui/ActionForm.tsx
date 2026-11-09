"use client";

import { useActionState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { runAction } from "@/server/actions";

/**
 * Wraps a <form> in the runAction server action. Shows the result toast and
 * follows `url` in the returned payload when the action succeeds.
 */
export default function ActionForm({ action, children, className }: { action: string; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const [state, formAction] = useActionState(runAction, null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!state) return;
    if (state.url) {
      timerRef.current = setTimeout(() => router.replace(state.url!), 650);
    } else if (state.ok) {
      timerRef.current = setTimeout(() => router.refresh(), 900);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state, router]);

  return (
    <form action={formAction} className={className}>
      <input type="hidden" name="name" value={action} />
      {children}

      {state ? (
        <div
          role="status"
          className={`mt-3 flex items-start justify-between gap-3 rounded-[var(--radius-md)] border px-3 py-2 text-[13px] leading-5 ${
            state.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          <span className="flex items-start gap-2">
            {state.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{state.message}</span>
          </span>
          <button type="submit" onClick={() => router.refresh()} className="rounded p-0.5 text-current/60 hover:bg-white/40" aria-label="Tutup">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </form>
  );
}
