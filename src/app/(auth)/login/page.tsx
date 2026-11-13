import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InviteNotice } from "@/components/invite-notice";
import { config } from "@/lib/config";
import { getSession } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  if (await getSession()) redirect("/kanban");

  return (
    <>
      <InviteNotice />
      <LoginForm mockMode={config.mockMode && config.dataBackend === "file"} />
    </>
  );
}
