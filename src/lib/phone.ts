/**
 * Normalização de telefone para o formato E.164 (ex.: +5547999991234).
 * É a "chave" usada para evitar leads duplicados e, mais tarde, para enviar WhatsApp.
 *
 * Regras:
 * - Sem "+": o número é tratado como brasileiro (DDD + número, com ou sem o 55 na frente).
 * - Com "+" (ou "00" na frente): aceita outros países, de 8 a 15 dígitos.
 * - Brasil: celular = DDD + 9 + 8 dígitos (11 dígitos); fixo = DDD + 2 a 5 + 7 dígitos (10 dígitos).
 * - Número que não encaixa em nenhuma regra devolve null (inválido), nunca um palpite.
 */

function brazilNational(national: string): string | null {
  if (national.length === 11) {
    return /^[1-9][1-9]9\d{8}$/.test(national) ? `+55${national}` : null;
  }
  if (national.length === 10) {
    return /^[1-9][1-9][2-5]\d{7}$/.test(national) ? `+55${national}` : null;
  }
  return null;
}

export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  const international = raw.startsWith("+") || raw.startsWith("00");
  if (international) {
    if (raw.startsWith("00")) digits = digits.slice(2);
    if (digits.startsWith("55")) return brazilNational(digits.slice(2));
    if (digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null;
    return `+${digits}`;
  }

  // Sem "+": remove o zero de "chamada interurbana" (ex.: 047 99999-1234).
  digits = digits.replace(/^0+/, "");

  // Só tira o 55 quando o tamanho mostra que ele é o código do país
  // (DDD 55 existe no Rio Grande do Sul, com 10 ou 11 dígitos no total).
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return brazilNational(digits.slice(2));
  }
  return brazilNational(digits);
}

/** Mostra um telefone E.164 de forma legível: +55 (47) 99999-1234. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "—";
  if (e164.startsWith("+55")) {
    const national = e164.slice(3);
    if (national.length === 11) {
      return `+55 (${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
    }
    if (national.length === 10) {
      return `+55 (${national.slice(0, 2)}) ${national.slice(2, 6)}-${national.slice(6)}`;
    }
  }
  return e164;
}
