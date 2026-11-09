import { Search, SlidersHorizontal } from "lucide-react";

export type TableColumn<T> = {
  key: string;
  header: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  cell: (row: T, index: number) => React.ReactNode;
};

export default function EnterpriseDataGrid<T>({
  title,
  count,
  description,
  toolbar,
  columns,
  rows,
  rowKey,
  emptyMessage = "Tidak ada data yang cocok dengan filter saat ini.",
  onRowClickHref,
  footer,
  stickyHeader = false,
}: {
  title: string;
  count: number;
  description?: string;
  toolbar?: React.ReactNode;
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage?: string;
  onRowClickHref?: (row: T) => string | undefined;
  footer?: React.ReactNode;
  stickyHeader?: boolean;
}) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white">
      {/* integrated toolbar */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200/80 px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">{title}</h2>
            <span className="rounded-[var(--radius-sm)] bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-zinc-600">
              {count}
            </span>
          </div>
          {description ? <p className="mt-0.5 text-xs text-zinc-500">{description}</p> : null}
        </div>
        {toolbar ? <div className="flex flex-wrap items-center gap-2">{toolbar}</div> : null}
      </header>

      <div className="thin-scroll overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-[13px] leading-5">
          <thead className={`${stickyHeader ? "sticky top-0 z-10" : ""} bg-zinc-50/90 border-b border-zinc-200`}>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 ${
                    column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : ""
                  } ${column.className ?? ""}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-zinc-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const href = onRowClickHref?.(row);
                const cells = columns.map((column) => (
                  <td
                    key={column.key}
                    className={`px-4 py-2.5 align-top ${
                      column.align === "right" ? "text-right font-mono tabular-nums" : column.align === "center" ? "text-center" : ""
                    } ${column.className ?? ""}`}
                  >
                    {column.cell(row, index)}
                  </td>
                ));
                if (href) {
                  return (
                    <tr key={rowKey(row)} className="border-b border-zinc-100 last:border-0 transition-colors hover:bg-zinc-50/80">
                      {cells}
                    </tr>
                  );
                }
                return (
                  <tr key={rowKey(row)} className="border-b border-zinc-100 last:border-0 transition-colors hover:bg-zinc-50/80">
                    {cells}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {footer ? (
        <footer className="border-t border-zinc-200/80 px-4 py-2.5 text-xs text-zinc-500">{footer}</footer>
      ) : null}
    </section>
  );
}

export function SearchInput({ placeholder, name }: { placeholder: string; name: string }) {
  return (
    <label className="relative flex items-center">
      <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-zinc-400" />
      <input
        type="search"
        name={name}
        placeholder={placeholder}
        className="h-8 w-52 rounded-[var(--radius-md)] border border-zinc-300 bg-white pl-7 pr-2 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:border-[var(--accent-interactive)] focus:outline-none"
      />
    </label>
  );
}

export function FilterChips({
  name,
  options,
  active,
  baseHref,
  extraQuery = {},
}: {
  name: string;
  options: { value: string; label: string; count?: number }[];
  active: string;
  baseHref: string;
  extraQuery?: Record<string, string>;
}) {
  const hrefFor = (value: string) => {
    const params = new URLSearchParams(extraQuery);
    if (value && value !== "ALL") params.set(name, value);
    const qs = params.toString();
    return qs ? `${baseHref}?${qs}` : baseHref;
  };

  return (
    <nav aria-label="Filter" className="flex flex-wrap items-center gap-1 rounded-[var(--radius-md)] border border-zinc-300 bg-white px-1 py-0.5">
      <SlidersHorizontal className="ml-1.5 h-3.5 w-3.5 text-zinc-400" />
      {options.map((option) => {
        const isActive = option.value === active || (!option.value && !active);
        return (
          <a
            key={option.value || "ALL"}
            href={hrefFor(option.value)}
            className={`whitespace-nowrap rounded-[var(--radius-sm)] px-2 py-1 text-[12px] font-medium transition-colors ${
              isActive ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className={`ml-1.5 font-mono text-[10px] tabular-nums ${isActive ? "text-zinc-300" : "text-zinc-400"}`}>
                {option.count}
              </span>
            ) : null}
          </a>
        );
      })}
    </nav>
  );
}

export function PaginationFooter({
  from,
  to,
  total,
  page,
  pageCount,
  baseHref,
  extraQuery = {},
}: {
  from: number;
  to: number;
  total: number;
  page: number;
  pageCount: number;
  baseHref: string;
  extraQuery?: Record<string, string>;
}) {
  const hrefFor = (n: number) => {
    const params = new URLSearchParams(extraQuery);
    params.set("page", String(n));
    return `${baseHref}?${params.toString()}`;
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-zinc-500">
        Menampilkan <span className="font-mono tabular-nums">{from}-{to}</span> dari{" "}
        <span className="font-mono tabular-nums">{total}</span> baris
      </p>
      {pageCount > 1 ? (
        <nav className="flex items-center gap-1" aria-label="Pagination">
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <a
              key={n}
              href={hrefFor(n)}
              className={`min-w-7 rounded-[var(--radius-sm)] px-2 py-1 text-center font-mono text-[12px] tabular-nums ${
                n === page ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              {n}
            </a>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
