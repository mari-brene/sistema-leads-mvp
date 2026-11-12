-- Sistema Leads MVP — Parte D3a: tabelas de verdade para campanhas.
-- Cole TUDO isto no Supabase: menu SQL Editor > New query > Run.
-- É seguro rodar mais de uma vez (não apaga nada) e NÃO mexe em app_data, clients, memberships nem leads.
-- Nesta etapa as tabelas ficam vazias e o sistema ainda não as usa.

-- Limites e horários de envio (uma linha por cliente).
create table if not exists public.campaign_settings (
  client_id text primary key references public.clients(id) on delete cascade,
  daily_limit integer not null default 30,
  window_start integer not null default 9,
  window_end integer not null default 18,
  weekdays_only boolean not null default true,
  opt_out_footer text not null default ''
);

-- Modelos de mensagem.
create table if not exists public.message_templates (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  name text not null default '',
  body text not null default '',
  meta_name text,
  status text not null default 'pendente',
  created_at timestamptz not null default now()
);
create index if not exists message_templates_client_idx on public.message_templates (client_id);

-- Campanhas.
create table if not exists public.campaigns (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  name text not null default '',
  template_id text not null default '',
  template_name text not null default '',
  body text not null default '',
  stages jsonb not null default '[]'::jsonb,
  tag text not null default '',
  status text not null default 'rascunho',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists campaigns_client_idx on public.campaigns (client_id, status);

-- Fila de mensagens de cada campanha.
create table if not exists public.campaign_messages (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  campaign_id text not null references public.campaigns(id) on delete cascade,
  lead_id text not null default '',
  lead_name text not null default '',
  phone text not null default '',
  text text not null default '',
  status text not null default 'na_fila',
  reason text not null default '',
  provider_id text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists campaign_messages_client_idx on public.campaign_messages (client_id, campaign_id);

-- Proteção: segurança ligada e SEM regras de acesso para a chave pública (só o servidor, com a chave secreta).
alter table public.campaign_settings enable row level security;
alter table public.message_templates enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_messages enable row level security;
revoke all on public.campaign_settings, public.message_templates, public.campaigns, public.campaign_messages from anon, authenticated;
