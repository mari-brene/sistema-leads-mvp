import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { config } from "@/lib/config";
import { getSession } from "@/lib/session";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Criar conta" };

export default async function SignUpPage() {
  if (await getSession()) redirect("/kanban");

  return <SignUpForm mockMode={config.mockMode && config.dataBackend === "file"} />;
}
