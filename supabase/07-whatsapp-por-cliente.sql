-- Sistema Leads MVP — Parte F: número de WhatsApp de cada cliente.
-- Cole TUDO isto no Supabase: menu SQL Editor > New query > Run.
-- É seguro rodar mais de uma vez (não apaga nada) e NÃO mexe em nenhuma tabela que já existe.
-- O token da Meta fica CRIPTOGRAFADO (o sistema criptografa antes de gravar).

create table if not exists public.whatsapp_accounts (
  client_id text primary key references public.clients(id) on delete cascade,
  phone_number_id text not null unique,
  display_phone text not null default '',
  token_encrypted text not null,
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_accounts enable row level security;
