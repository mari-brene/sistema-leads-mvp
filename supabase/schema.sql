-- Sistema Leads MVP: tabela única de dados.
-- Cole TUDO isto no Supabase: menu SQL Editor > New query > Run.

create table if not exists public.app_data (
  collection text primary key,
  data jsonb not null default '[]'::jsonb,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

-- Proteção: com a segurança (RLS) ligada e SEM nenhuma regra de acesso,
-- ninguém consegue ler nem gravar pela chave pública. Só o servidor, com a chave secreta.
alter table public.app_data enable row level security;
revoke all on public.app_data from anon, authenticated;
