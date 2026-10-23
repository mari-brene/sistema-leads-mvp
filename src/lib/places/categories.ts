/**
 * Tipos de negócio que o sistema sabe procurar no OpenStreetMap.
 * Quando o termo digitado é um destes (ou um sinônimo), a busca usa o tipo no mapa.
 * Quando não é, o termo é procurado dentro do nome das empresas.
 */

export type Category = {
  id: string;
  label: string;
  /** Palavras que a pessoa pode digitar (sem acento, no singular). */
  words: string[];
  /** Etiquetas do OpenStreetMap: [chave, valor]. A empresa precisa ter UMA delas. */
  tags: Array<[string, string]>;
};

export const CATEGORIES: Category[] = [
  { id: "padaria", label: "Padaria", words: ["padaria", "panificadora", "confeitaria"], tags: [["shop", "bakery"], ["shop", "pastry"]] },
  { id: "restaurante", label: "Restaurante", words: ["restaurante", "churrascaria", "pizzaria"], tags: [["amenity", "restaurant"]] },
  { id: "lanchonete", label: "Lanchonete", words: ["lanchonete", "fast food", "hamburgueria"], tags: [["amenity", "fast_food"]] },
  { id: "cafe", label: "Cafeteria", words: ["cafe", "cafeteria"], tags: [["amenity", "cafe"]] },
  { id: "bar", label: "Bar", words: ["bar", "pub", "boteco"], tags: [["amenity", "bar"], ["amenity", "pub"]] },
  { id: "mercado", label: "Mercado", words: ["mercado", "supermercado", "mercearia"], tags: [["shop", "supermarket"], ["shop", "convenience"], ["shop", "grocery"]] },
  { id: "acougue", label: "Açougue", words: ["acougue"], tags: [["shop", "butcher"]] },
  { id: "farmacia", label: "Farmácia", words: ["farmacia", "drogaria"], tags: [["amenity", "pharmacy"]] },
  { id: "dentista", label: "Dentista", words: ["dentista", "odontologia", "consultorio odontologico"], tags: [["amenity", "dentist"], ["healthcare", "dentist"]] },
  { id: "clinica", label: "Clínica", words: ["clinica", "consultorio", "medico"], tags: [["amenity", "clinic"], ["amenity", "doctors"], ["healthcare", "doctor"]] },
  { id: "veterinario", label: "Veterinário", words: ["veterinario", "clinica veterinaria"], tags: [["amenity", "veterinary"]] },
  { id: "petshop", label: "Pet shop", words: ["pet shop", "petshop", "pet"], tags: [["shop", "pet"]] },
  { id: "salao", label: "Salão de beleza", words: ["salao", "salao de beleza", "cabeleireiro", "cabelereiro"], tags: [["shop", "hairdresser"]] },
  { id: "barbearia", label: "Barbearia", words: ["barbearia", "barbeiro"], tags: [["shop", "barber"]] },
  { id: "estetica", label: "Estética", words: ["estetica", "clinica de estetica", "manicure"], tags: [["shop", "beauty"]] },
  { id: "academia", label: "Academia", words: ["academia", "crossfit", "musculacao"], tags: [["leisure", "fitness_centre"]] },
  { id: "oficina", label: "Oficina mecânica", words: ["oficina", "mecanica", "oficina mecanica", "auto center"], tags: [["shop", "car_repair"], ["amenity", "car_repair"]] },
  { id: "autopecas", label: "Autopeças", words: ["autopecas", "auto pecas", "pecas"], tags: [["shop", "car_parts"]] },
  { id: "lojaroupa", label: "Loja de roupas", words: ["loja de roupa", "roupa", "moda", "boutique"], tags: [["shop", "clothes"], ["shop", "boutique"]] },
  { id: "calcados", label: "Calçados", words: ["calcado", "sapataria", "loja de sapato"], tags: [["shop", "shoes"]] },
  { id: "papelaria", label: "Papelaria", words: ["papelaria", "livraria"], tags: [["shop", "stationery"], ["shop", "books"]] },
  { id: "construcao", label: "Material de construção", words: ["material de construcao", "construcao", "ferragem", "ferragens"], tags: [["shop", "hardware"], ["shop", "doityourself"], ["shop", "building_materials"]] },
  { id: "moveis", label: "Móveis", words: ["movel", "loja de moveis", "moveleira", "marcenaria"], tags: [["shop", "furniture"]] },
  { id: "eletronicos", label: "Eletrônicos e celulares", words: ["eletronico", "celular", "assistencia tecnica", "informatica"], tags: [["shop", "electronics"], ["shop", "mobile_phone"], ["shop", "computer"]] },
  { id: "floricultura", label: "Floricultura", words: ["floricultura", "flores"], tags: [["shop", "florist"]] },
  { id: "otica", label: "Ótica", words: ["otica", "optica"], tags: [["shop", "optician"]] },
  { id: "hotel", label: "Hotel e pousada", words: ["hotel", "pousada", "hostel"], tags: [["tourism", "hotel"], ["tourism", "guest_house"], ["tourism", "hostel"]] },
  { id: "escola", label: "Escola e cursos", words: ["escola", "curso", "creche", "escola de idiomas"], tags: [["amenity", "school"], ["amenity", "kindergarten"], ["amenity", "language_school"]] },
  { id: "advogado", label: "Advocacia", words: ["advogado", "advocacia", "escritorio de advocacia"], tags: [["office", "lawyer"]] },
  { id: "contabilidade", label: "Contabilidade", words: ["contador", "contabilidade", "escritorio de contabilidade"], tags: [["office", "accountant"]] },
  { id: "imobiliaria", label: "Imobiliária", words: ["imobiliaria", "corretor de imoveis"], tags: [["office", "estate_agent"]] },
  { id: "seguros", label: "Seguros", words: ["seguro", "corretora de seguros", "seguradora"], tags: [["office", "insurance"]] },
  { id: "lavanderia", label: "Lavanderia", words: ["lavanderia", "lava rapido", "lavajato"], tags: [["shop", "laundry"], ["amenity", "car_wash"]] },
];

/** Tira acento, deixa minúsculo e troca símbolos por espaço. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "padarias" e "padaria" ficam iguais (tira o plural simples de cada palavra). */
function stem(value: string): string {
  return normalizeText(value)
    .split(" ")
    .map((word) => (word.length > 3 ? word.replace(/(es|s)$/, "") : word))
    .join(" ");
}

/** Devolve o tipo de negócio que o termo representa, ou null se for um termo livre. */
export function findCategory(term: string): Category | null {
  const key = stem(term);
  if (!key) return null;
  return CATEGORIES.find((category) => category.words.some((word) => stem(word) === key)) ?? null;
}

/** Nome do tipo de negócio a partir das etiquetas de um item do mapa. */
export function categoryOfTags(tags: Record<string, string>): string {
  for (const category of CATEGORIES) {
    if (category.tags.some(([key, value]) => tags[key] === value)) return category.label;
  }
  return "";
}

/** Sugestões mostradas no campo "O que procurar". */
export const SUGGESTIONS: string[] = CATEGORIES.map((category) => category.label);
