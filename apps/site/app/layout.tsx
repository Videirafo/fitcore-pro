import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FitCore Pro",
  description: "Sistema fitness multi-tenant com login real, RBAC e PostgreSQL.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
