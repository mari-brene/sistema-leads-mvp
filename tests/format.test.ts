import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatShortDateTime } from "@/lib/format";

describe("datas no fuso de São Paulo", () => {
  it("converte de UTC para o horário de Brasília (UTC-3)", () => {
    expect(formatDateTime("2026-10-08T17:30:00.000Z")).toBe("08/10/2026 14:30");
    expect(formatShortDateTime("2026-10-08T17:30:00.000Z")).toBe("08/10 14:30");
    expect(formatDate("2026-10-08T17:30:00.000Z")).toBe("08/10/2026");
  });

  it("meia-noite aparece como 00:xx, nunca 24:xx", () => {
    expect(formatShortDateTime("2026-10-08T03:05:00.000Z")).toBe("08/10 00:05");
  });

  it("o dia muda conforme o fuso (21h em SP já é dia seguinte em UTC)", () => {
    expect(formatDate("2026-10-09T00:30:00.000Z")).toBe("08/10/2026");
  });

  it("valores vazios ou inválidos viram traço", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("")).toBe("—");
    expect(formatShortDateTime("não é data")).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });
});
