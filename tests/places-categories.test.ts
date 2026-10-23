import { describe, expect, it } from "vitest";
import { categoryOfTags, CATEGORIES, findCategory, normalizeText } from "@/lib/places/categories";

describe("normalizeText", () => {
  it("tira acento, maiúsculas e símbolos", () => {
    expect(normalizeText("  Açougue  São-João ")).toBe("acougue sao joao");
  });
});

describe("findCategory", () => {
  it("reconhece o tipo de negócio com ou sem acento e no plural", () => {
    expect(findCategory("padaria")?.id).toBe("padaria");
    expect(findCategory("Padarias")?.id).toBe("padaria");
    expect(findCategory("FARMÁCIA")?.id).toBe("farmacia");
    expect(findCategory("farmacias")?.id).toBe("farmacia");
    expect(findCategory("Salão de beleza")?.id).toBe("salao");
    expect(findCategory("pet shop")?.id).toBe("petshop");
  });

  it("devolve null para termo livre ou vazio", () => {
    expect(findCategory("Pão Quente do Zé")).toBeNull();
    expect(findCategory("")).toBeNull();
    expect(findCategory("   ")).toBeNull();
  });

  it("todo tipo tem rótulo, palavras e etiquetas, e as palavras não se repetem entre tipos", () => {
    const seen = new Map<string, string>();
    for (const category of CATEGORIES) {
      expect(category.label).not.toBe("");
      expect(category.words.length).toBeGreaterThan(0);
      expect(category.tags.length).toBeGreaterThan(0);
      for (const word of category.words) {
        const key = normalizeText(word);
        expect(seen.has(key) ? `${key} repetida em ${seen.get(key)} e ${category.id}` : "ok").toBe("ok");
        seen.set(key, category.id);
      }
    }
  });
});

describe("categoryOfTags", () => {
  it("descobre o tipo pelas etiquetas do mapa", () => {
    expect(categoryOfTags({ shop: "bakery" })).toBe("Padaria");
    expect(categoryOfTags({ amenity: "dentist" })).toBe("Dentista");
    expect(categoryOfTags({ shop: "unknown_thing" })).toBe("");
  });
});
