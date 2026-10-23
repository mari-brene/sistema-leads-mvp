import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { getSession } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  // Quem já está logado vai direto para o sistema.
  if (await getSession()) redirect("/kanban");

  return <LoginForm mockMode={config.mockMode && config.dataBackend === "file"} />;
}
