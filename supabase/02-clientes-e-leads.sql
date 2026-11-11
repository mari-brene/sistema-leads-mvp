-- Sistema Leads MVP — Parte C2a: tabelas de verdade para clientes, vínculos e leads.
-- Cole TUDO isto no Supabase: menu SQL Editor > New query > Run.
-- É seguro rodar mais de uma vez (não apaga nada) e NÃO mexe na tabela app_data.
-- Nesta etapa as tabelas ficam vazias e o sistema ainda não as usa.

-- Clientes da agência (o id é texto porque os clientes atuais usam o id da conta como id).
create table if not exists public.clients (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

-- Quem pertence a qual cliente, e com qual papel.
create table if not exists public.memberships (
  user_id text not null,
  client_id text not null references public.clients(id) on delete cascade,
  role text not null check (role in ('agency_admin', 'client_manager', 'agent')),
  created_at timestamptz not null default now(),
  primary key (user_id, client_id)
);
create index if not exists memberships_client_idx on public.memberships (client_id);

-- Leads: uma linha por lead, sempre marcada com o cliente dono.
create table if not exists public.leads (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  name text not null default '',
  company text not null default '',
  phone text,
  email text not null default '',
  source text not null default 'manual',
  stage text not null default 'novo',
  position integer not null default 0,
  tags jsonb not null default '[]'::jsonb,
  notes text not null default '',
  external_id text,
  opt_in boolean not null default false,
  opt_in_at timestamptz,
  opt_in_source text,
  opt_out boolean not null default false,
  opt_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_interaction_at timestamptz not null default now(),
  events jsonb not null default '[]'::jsonb
);
create index if not exists leads_client_stage_idx on public.leads (client_id, stage, position);
create index if not exists leads_client_phone_idx on public.leads (client_id, phone);
-- Não repetir o mesmo lead de origem (ex.: da busca de empresas) dentro do mesmo cliente.
create unique index if not exists leads_client_external_uidx
  on public.leads (client_id, external_id) where external_id is not null;

-- Proteção: segurança ligada e SEM regras de acesso para a chave pública.
-- Só o servidor, com a chave secreta, lê e grava (como na tabela app_data).
alter table public.clients enable row level security;
alter table public.memberships enable row level security;
alter table public.leads enable row level security;
revoke all on public.clients, public.memberships, public.leads from anon, authenticated;
