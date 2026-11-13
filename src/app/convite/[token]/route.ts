import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { acceptPendingInvite, setPendingInvite } from "@/lib/tenancy/active-client";
import { isTokenShape } from "@/lib/tenancy/invite-link";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const go = (path: string) => NextResponse.redirect(new URL(path, request.url));

  if (!isTokenShape(token)) return go("/convite/erro?motivo=invalido");

  await setPendingInvite(token);
  const user = await getSession();
  if (!user) return go("/login?convite=1");

  const result = await acceptPendingInvite(user.id);
  if (result && !result.ok) return go(`/convite/erro?motivo=${result.reason}`);
  return go("/kanban");
}
