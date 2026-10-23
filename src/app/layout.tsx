import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { APP_NAME } from "@/components/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: "CRM com Kanban de leads, campanhas de WhatsApp (API oficial) e autoresponder com IA.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
