export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[3px] border border-zinc-300 bg-zinc-50 px-1 py-0.5 font-mono text-[10px] font-semibold leading-3 text-zinc-500">
      {children}
    </kbd>
  );
}
