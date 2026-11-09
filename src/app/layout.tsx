import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "VeriDoc — E-Office & Verifikasi Dokumen Kriptografis",
    template: "%s",
  },
  description:
    "Tata naskah dinas elektronik dengan persetujuan berjenjang, rantai tanda tangan SHA-256 + RSA-PSS, dan portal verifikasi QR publik.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="antialiased">{children}</body>
    </html>
  );
}
