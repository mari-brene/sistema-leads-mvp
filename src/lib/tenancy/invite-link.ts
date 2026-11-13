export const INVITE_COOKIE = "sl_invite";
export const CLIENT_COOKIE = "sl_client";

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,100}$/;

export function isTokenShape(value: unknown): value is string {
  return typeof value === "string" && TOKEN_SHAPE.test(value);
}

export const invitePath = (token: string): string => `/convite/${token}`;

export type InviteFailure = "invalido" | "ja-membro" | "erro";

export const INVITE_FAILURE_TEXT: Record<InviteFailure, string> = {
  invalido: "Convite inválido ou expirado. Peça um novo link a quem convidou você.",
  "ja-membro": "Você já faz parte deste cliente. Nada a fazer aqui.",
  erro: "Não foi possível usar este convite agora. Tente de novo em alguns minutos.",
};

export function failureOf(error: string): InviteFailure {
  return error.includes("já faz parte") ? "ja-membro" : "invalido";
}

export function isInviteFailure(value: unknown): value is InviteFailure {
  return typeof value === "string" && value in INVITE_FAILURE_TEXT;
}
