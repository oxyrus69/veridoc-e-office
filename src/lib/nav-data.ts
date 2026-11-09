export type NavItem = {
  href: string;
  label: string;
  icon: string; // lucide name, resolved in the client component
  roles: string[] | null;
  badge?: string;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export function commandTargets(): { label: string; href: string; keywords: string; group: "action" | "page" }[] {
  return [
    { label: "Verifikasi dokumen dari QR", href: "/verify", keywords: "verify qr public", group: "action" },
    { label: "Susun dokumen baru", href: "/documents/compose", keywords: "compose new document draft", group: "action" },
    { label: "Buka kotak masuk paraf", href: "/inbox", keywords: "inbox approval sign", group: "action" },
    { label: "Unduh buku agenda dokumen", href: "/api/export/documents", keywords: "export csv docs", group: "action" },
    { label: "Unduh buku agenda disposisi", href: "/api/export/dispositions", keywords: "export csv dispositions", group: "action" },
    { label: "Cetak dokumen contoh (QR)", href: "/print/document/seed", keywords: "print", group: "action" },
    { label: "Dasbor", href: "/admin", keywords: "dashboard admin", group: "page" },
    { label: "Inbox persetujuan", href: "/inbox", keywords: "inbox", group: "page" },
    { label: "Repositori dokumen", href: "/documents", keywords: "documents list", group: "page" },
    { label: "Studio template", href: "/templates", keywords: "templates", group: "page" },
    { label: "Agenda disposisi", href: "/dispositions", keywords: "dispositions letters", group: "page" },
    { label: "Sertifikat penandatangan", href: "/certificates", keywords: "certificates keys", group: "page" },
    { label: "DSS tata kelola", href: "/dss", keywords: "dss decision support", group: "page" },
    { label: "Jejak audit", href: "/admin/audit", keywords: "audit logs", group: "page" },
    { label: "Pengaturan", href: "/admin/settings", keywords: "settings sla", group: "page" },
    { label: "Verifikasi publik", href: "/verify", keywords: "verify", group: "page" },
  ];
}
