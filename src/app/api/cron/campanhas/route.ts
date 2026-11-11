import { NextResponse } from "next/server";
import { createAuditSink } from "@/lib/audit";
import { getCampaignsRepository, getSender } from "@/lib/campaigns";
import { config } from "@/lib/config";
import { authorizeCron } from "@/lib/cron/auth";
import { runCampaignsJob } from "@/lib/cron/campaigns-job";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const auth = authorizeCron(request.headers.get("authorization"), config.cronSecret);
  if (auth === "disabled") {
    return NextResponse.json({ ok: false, error: "Agendador desligado: defina CRON_SECRET (24+ caracteres)." }, { status: 503, headers: NO_STORE });
  }
  if (auth !== "ok") {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401, headers: NO_STORE });
  }

  try {
    const summary = await runCampaignsJob({
      campaigns: getCampaignsRepository(),
      sender: getSender(),
      audit: createAuditSink(),
    });
    return NextResponse.json({ ok: true, ...summary }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ ok: false, error: "Erro ao rodar o agendador." }, { status: 500, headers: NO_STORE });
  }
}
