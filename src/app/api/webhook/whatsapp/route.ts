import { NextResponse } from "next/server";
import { createAuditSink } from "@/lib/audit";
import { config } from "@/lib/config";
import { getInboxRepository } from "@/lib/inbox";
import { getLeadsRepository } from "@/lib/leads";
import { processInbound } from "@/lib/whatsapp/inbound";
import { parseInbound, verifyChallenge, verifySignature } from "@/lib/whatsapp/webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const challenge = verifyChallenge(new URL(request.url).searchParams, config.whatsappVerifyToken);
  if (challenge === null) return new Response("Não autorizado.", { status: 403, headers: NO_STORE });
  return new Response(challenge, { status: 200, headers: { ...NO_STORE, "Content-Type": "text/plain" } });
}

export async function POST(request: Request) {
  if (config.simulatedWhatsApp || !config.metaAppSecret) {
    return NextResponse.json({ ok: false, error: "Webhook desligado." }, { status: 503, headers: NO_STORE });
  }
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), config.metaAppSecret)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401, headers: NO_STORE });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400, headers: NO_STORE });
  }

  try {
    const summary = await processInbound(
      { leads: getLeadsRepository(), inbox: getInboxRepository(), audit: createAuditSink(), ownerId: config.whatsappOwnerId },
      parseInbound(payload, config.whatsappPhoneNumberId),
    );
    return NextResponse.json({ ok: true, ...summary }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ ok: false, error: "Erro ao processar." }, { status: 500, headers: NO_STORE });
  }
}
