import { redirect } from "next/navigation";

// A página inicial só encaminha: o layout do sistema decide se pede login.
export default function Home() {
  redirect("/kanban");
}
