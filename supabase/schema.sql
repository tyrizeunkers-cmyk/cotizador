-- =====================================================================
-- Cotizador KM Motors / DK Energy — esquema de base de datos (Supabase)
-- Cómo usarlo: Supabase > SQL Editor > New query > pega todo > Run
-- =====================================================================

-- ---------- Cotizaciones ----------
create table if not exists public.cotizaciones (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  empresa       text not null check (empresa in ('km','dk')),
  folio         text not null,
  fecha         date not null default current_date,
  cliente       text,
  total         numeric(14,2) not null default 0,
  estado        text not null default 'borrador',
  datos         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, empresa, folio)
);
create index if not exists cotizaciones_empresa_idx on public.cotizaciones (user_id, empresa, created_at desc);

-- ---------- Clientes ----------
create table if not exists public.clientes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  empresa     text not null check (empresa in ('km','dk')),
  nombre      text not null,
  telefono    text,
  correo      text,
  ubicacion   text,
  vehiculo    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists clientes_empresa_idx on public.clientes (user_id, empresa, nombre);

-- ---------- Catálogo de productos / servicios ----------
create table if not exists public.productos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  empresa      text not null check (empresa in ('km','dk')),
  seccion      text not null,             -- km: 'ref' | 'mo'   dk: 'art'
  descripcion  text not null,
  tipo         text,                      -- ORIGINAL / GENÉRICO (solo refacciones KM)
  precio       numeric(14,2) not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists productos_empresa_idx on public.productos (user_id, empresa, descripcion);

-- ---------- Consecutivos de folio ----------
create table if not exists public.folios (
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  empresa  text not null,
  clave    text not null,   -- 'global' o la fecha (DDMMAA) para folios por día
  ultimo   integer not null,
  primary key (user_id, empresa, clave)
);

-- ---------- Seguridad: cada usuario solo ve sus datos ----------
alter table public.cotizaciones enable row level security;
alter table public.clientes     enable row level security;
alter table public.productos    enable row level security;
alter table public.folios       enable row level security;

drop policy if exists "dueno" on public.cotizaciones;
drop policy if exists "dueno" on public.clientes;
drop policy if exists "dueno" on public.productos;
drop policy if exists "dueno" on public.folios;
create policy "dueno" on public.cotizaciones for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dueno" on public.clientes     for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dueno" on public.productos    for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dueno" on public.folios       for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------- Siguiente folio (atómico, sin duplicados) ----------
create or replace function public.siguiente_folio(p_empresa text, p_clave text, p_inicio integer)
returns integer
language sql
security invoker
set search_path = ''
as $$
  insert into public.folios (user_id, empresa, clave, ultimo)
  values (auth.uid(), p_empresa, p_clave, p_inicio)
  on conflict (user_id, empresa, clave)
  do update set ultimo = public.folios.ultimo + 1
  returning ultimo;
$$;

revoke execute on function public.siguiente_folio(text, text, integer) from public, anon;
grant execute on function public.siguiente_folio(text, text, integer) to authenticated;
