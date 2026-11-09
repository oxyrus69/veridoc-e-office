import Link from "next/link";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "seal";

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary-hover)] border border-[var(--accent-primary)]",
  secondary:
    "bg-white text-zinc-900 border border-zinc-300 hover:bg-zinc-50",
  ghost:
    "bg-transparent text-zinc-700 border border-transparent hover:bg-zinc-100",
  seal:
    "bg-[var(--seal)] text-white border border-[var(--seal)] hover:bg-[#7c2d12]",
  danger:
    "bg-white text-[var(--status-danger-fg)] border border-[var(--status-danger-border)] hover:bg-[var(--status-danger-bg)]",
};

export function ActionButton({
  children,
  href,
  variant = "secondary",
  type = "button",
  className = "",
  title,
  disabled = false,
  formAction,
}: {
  children: React.ReactNode;
  href?: string;
  variant?: ButtonVariant;
  type?: "button" | "submit";
  className?: string;
  title?: string;
  disabled?: boolean;
  formAction?: string;
}) {
  const base = `inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--radius-md)] px-3 py-1.5 text-[13px] font-medium leading-5 transition-colors ${variantClass[variant]} ${disabled ? "pointer-events-none opacity-50" : ""} ${className}`;

  if (href) {
    return (
      <Link href={href} className={base} title={title}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} className={base} title={title} disabled={disabled} formAction={formAction}>
      {children}
    </button>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[3px] border border-zinc-300 bg-zinc-50 px-1 py-0.5 font-mono text-[10px] font-semibold leading-3 text-zinc-500">
      {children}
    </kbd>
  );
}
