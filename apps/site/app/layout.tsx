import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./premium-stabilization.css";
import "./professional-visuals.css";
import "./exact-preview.css";

export const metadata: Metadata = {
  title: "FitCore Pro | Gestão fitness",
  description: "Sistema profissional para gestão fitness, alunos, treinos, execução e evolução.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
