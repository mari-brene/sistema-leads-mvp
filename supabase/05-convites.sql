-- Sistema Leads MVP — Parte E1b: convites para entrar em um cliente.
-- Cole TUDO isto no Supabase: menu SQL Editor > New query > Run.
-- É seguro rodar mais de uma vez (não apaga nada) e NÃO mexe nas outras tabelas.

-- O link do convite NUNCA é guardado: só o "resumo" dele (token_hash). Quem ler o banco não consegue entrar com ele.
create table if not exists public.invitations (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  role text not null check (role in ('client_manager', 'agent')),
  token_hash text not null unique,
  created_by text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_by text,
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index if not exists invitations_client_idx on public.invitations (client_id);

alter table public.invitations enable row level security;
revoke all on public.invitations from anon, authenticated;
