import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import "./globals.css";
import "./premium-stabilization.css";
import "./professional-visuals.css";
import "./exact-preview.css";
import "./mvp-43-visual-fix.css";
import "./mvp-44-precision-layout.css";
import "./mvp-45-mobile-brand.css";
import "./mvp-48-premium-product.css";
import "./mvp-54-logo-contrast.css";
import "./fitcore-immersive-hero.css";

export const metadata: Metadata = {
  title: "FitCore Pro | Gestão fitness",
  description: "Sistema profissional para gestão fitness, alunos, treinos, execução e evolução.",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Script src="/fitcore-energy.js" strategy="afterInteractive" />
        {children}
      </body>
    </html>
  );
}
