export type IconName =
  | "kanban"
  | "users"
  | "upload"
  | "map"
  | "send"
  | "inbox"
  | "chart"
  | "settings"
  | "audit";

export type NavItem = {
  slug: string;
  href: string;
  label: string;
  icon: IconName;
  /** Fase do projeto em que a tela fica pronta. */
  phase: number;
  description: string;
};

export const NAV_ITEMS: NavItem[] = [
  {
    slug: "kanban",
    href: "/kanban",
    label: "Kanban",
    icon: "kanban",
    phase: 2,
    description: "Quadro de leads por etapa, com arrastar e soltar.",
  },
  {
    slug: "leads",
    href: "/leads",
    label: "Leads",
    icon: "users",
    phase: 2,
    description: "Lista de contatos com detalhes, histórico, tags e opt-in.",
  },
  {
    slug: "importar",
    href: "/importar",
    label: "Importar CSV",
    icon: "upload",
    phase: 3,
    description: "Importe contatos de uma planilha, com pré-visualização e relatório de erros.",
  },
  {
    slug: "prospeccao",
    href: "/prospeccao",
    label: "Prospecção",
    icon: "map",
    phase: 4,
    description: "Busque empresas por termo e cidade para alimentar a base de leads.",
  },
  {
    slug: "campanhas",
    href: "/campanhas",
    label: "Campanhas",
    icon: "send",
    phase: 5,
    description: "Disparos de WhatsApp com limite diário, só para contatos autorizados.",
  },
  {
    slug: "inbox",
    href: "/inbox",
    label: "Caixa de entrada",
    icon: "inbox",
    phase: 6,
    description: "Conversas com autoresponder de IA e opção de assumir o atendimento.",
  },
  {
    slug: "painel",
    href: "/painel",
    label: "Painel",
    icon: "chart",
    phase: 9,
    description: "Números de envios, respostas, reuniões e leads por etapa.",
  },
  {
    slug: "configuracoes",
    href: "/configuracoes",
    label: "Configurações",
    icon: "settings",
    phase: 5,
    description: "Limite diário, horários, mensagens de saída e base de conhecimento.",
  },
  {
    slug: "auditoria",
    href: "/auditoria",
    label: "Auditoria",
    icon: "audit",
    phase: 7,
    description: "Registro de tudo o que o sistema fez e página de erros.",
  },
];
