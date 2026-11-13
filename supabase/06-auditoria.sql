-- Sistema Leads MVP — Parte E4: tabelas da auditoria.
-- Cole TUDO isto no Supabase: menu SQL Editor > New query > Run.
-- É seguro rodar mais de uma vez (não apaga nada) e NÃO mexe em nenhuma tabela que já existe.
-- Nesta etapa as tabelas ficam vazias e o sistema ainda não as usa (só passa a usar com AUDIT_STORE=table).

-- Registros da auditoria. client_id vazio = evento do sistema todo.
create table if not exists public.audit_log (
  id text primary key,
  client_id text,
  at timestamptz not null default now(),
  kind text not null default 'agendador',
  text text not null default ''
);
create index if not exists audit_log_client_at_idx on public.audit_log (client_id, at desc);
create index if not exists audit_log_at_idx on public.audit_log (at desc);

-- Última chamada do agendador (uma única linha).
create table if not exists public.audit_state (
  id text primary key,
  at timestamptz not null default now(),
  text text not null default ''
);

alter table public.audit_log enable row level security;
alter table public.audit_state enable row level security;
