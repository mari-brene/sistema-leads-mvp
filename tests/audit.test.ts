import { describe, expect, it } from "vitest";
import { addEntries, emptyAudit, MAX_ENTRIES } from "@/lib/audit";

let n = 0;
const id = () => `id-${++n}`;

describe("auditoria", () => {
  it("coloca os registros novos primeiro e guarda a data", () => {
    const a = addEntries(emptyAudit(), [{ userId: "u1", kind: "agendador", text: "um" }], "2026-10-23T12:00:00.000Z", id);
    const b = addEntries(a, [{ userId: null, kind: "erro", text: "dois" }], "2026-10-23T12:10:00.000Z", id);
    expect(b.entries.map((e) => e.text)).toEqual(["dois", "um"]);
    expect(b.entries[0].at).toBe("2026-10-23T12:10:00.000Z");
  });
  it("mantém só os %s mais recentes".replace("%s", String(MAX_ENTRIES)), () => {
    let data = emptyAudit();
    for (let i = 0; i < MAX_ENTRIES + 20; i += 1) {
      data = addEntries(data, [{ userId: null, kind: "agendador", text: `r${i}` }], "2026-10-23T12:00:00.000Z", id);
    }
    expect(data.entries).toHaveLength(MAX_ENTRIES);
    expect(data.entries[0].text).toBe(`r${MAX_ENTRIES + 19}`);
  });
  it("corta textos enormes", () => {
    const data = addEntries(emptyAudit(), [{ userId: null, kind: "erro", text: "x".repeat(1000) }], "2026-10-23T12:00:00.000Z", id);
    expect(data.entries[0].text).toHaveLength(300);
  });
});
