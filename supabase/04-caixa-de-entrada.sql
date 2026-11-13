-- Sistema Leads MVP — Parte D3d: tabelas de verdade para a caixa de entrada.
-- Cole TUDO isto no Supabase: menu SQL Editor > New query > Run.
-- É seguro rodar mais de uma vez (não apaga nada) e NÃO mexe nas outras tabelas.
-- Nesta etapa as tabelas ficam vazias e o sistema ainda não as usa.

-- Configurações da IA e da base de conhecimento (uma linha por cliente).
create table if not exists public.inbox_settings (
  client_id text primary key references public.clients(id) on delete cascade,
  ai_enabled boolean not null default true,
  business_name text not null default '',
  knowledge text not null default ''
);

-- Conversas: uma por lead.
create table if not exists public.conversations (
  client_id text not null references public.clients(id) on delete cascade,
  lead_id text not null,
  mode text not null default 'ia' check (mode in ('ia', 'humano')),
  needs_human boolean not null default false,
  handoff_reason text,
  ai_replies_in_row integer not null default 0,
  last_inbound_at timestamptz,
  last_message_at timestamptz not null default now(),
  last_preview text not null default '',
  created_at timestamptz not null default now(),
  primary key (client_id, lead_id)
);

-- Mensagens das conversas.
create table if not exists public.inbox_messages (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  lead_id text not null,
  direction text not null check (direction in ('in', 'out')),
  author text not null,
  text text not null default '',
  at timestamptz not null default now(),
  external_id text,
  status text,
  error text
);
create index if not exists inbox_messages_thread_idx on public.inbox_messages (client_id, lead_id, at);
-- A mesma mensagem da Meta entregue duas vezes não entra duas vezes (proteção também no banco).
create unique index if not exists inbox_messages_external_uidx
  on public.inbox_messages (client_id, external_id) where external_id is not null;

-- Quantas respostas da IA já foram dadas em cada dia (limite diário).
create table if not exists public.ai_usage (
  client_id text not null references public.clients(id) on delete cascade,
  day text not null,
  count integer not null default 0,
  primary key (client_id, day)
);

alter table public.inbox_settings enable row level security;
alter table public.conversations enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.ai_usage enable row level security;
revoke all on public.inbox_settings, public.conversations, public.inbox_messages, public.ai_usage from anon, authenticated;
