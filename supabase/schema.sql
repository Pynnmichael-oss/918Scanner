-- 918Scanner schema
-- Run this once in the Supabase SQL editor

create extension if not exists "uuid-ossp";

-- ── properties ────────────────────────────────────────────────────────────────
create table if not exists properties (
  id            uuid primary key default uuid_generate_v4(),
  source        text not null,          -- 'crexi' | 'brevitas'
  external_id   text not null,          -- listing id from the source site
  url           text not null,
  address       text not null,
  lat           double precision,
  lng           double precision,
  price         numeric,
  sqft          numeric,
  property_type text,
  listing_type  text,                   -- 'sale' | 'lease'
  broker_name   text,
  broker_phone  text,
  value_score   integer not null default 50,
  content_hash  text not null,          -- sha256 of key fields for dedup
  scraped_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (source, external_id)
);

create index if not exists properties_value_score_idx on properties (value_score desc);
create index if not exists properties_source_idx      on properties (source);

-- ── scan_history ──────────────────────────────────────────────────────────────
create table if not exists scan_history (
  id          uuid primary key default uuid_generate_v4(),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  source      text,
  inserted    integer default 0,
  updated     integer default 0,
  errors      integer default 0,
  status      text default 'running'   -- 'running' | 'done' | 'failed'
);

-- ── upsert_property() RPC ─────────────────────────────────────────────────────
create or replace function upsert_property(
  p_source        text,
  p_external_id   text,
  p_url           text,
  p_address       text,
  p_lat           double precision,
  p_lng           double precision,
  p_price         numeric,
  p_sqft          numeric,
  p_property_type text,
  p_listing_type  text,
  p_broker_name   text,
  p_broker_phone  text,
  p_value_score   integer,
  p_content_hash  text
) returns json language plpgsql security definer as $$
declare
  existing_hash text;
  result        json;
begin
  select content_hash into existing_hash
  from properties
  where source = p_source and external_id = p_external_id;

  if not found then
    insert into properties (
      source, external_id, url, address, lat, lng,
      price, sqft, property_type, listing_type,
      broker_name, broker_phone, value_score, content_hash
    ) values (
      p_source, p_external_id, p_url, p_address, p_lat, p_lng,
      p_price, p_sqft, p_property_type, p_listing_type,
      p_broker_name, p_broker_phone, p_value_score, p_content_hash
    );
    result := '{"action":"inserted"}'::json;
  elsif existing_hash != p_content_hash then
    update properties set
      url           = p_url,
      address       = p_address,
      lat           = p_lat,
      lng           = p_lng,
      price         = p_price,
      sqft          = p_sqft,
      property_type = p_property_type,
      listing_type  = p_listing_type,
      broker_name   = p_broker_name,
      broker_phone  = p_broker_phone,
      value_score   = p_value_score,
      content_hash  = p_content_hash,
      scraped_at    = now(),
      updated_at    = now()
    where source = p_source and external_id = p_external_id;
    result := '{"action":"updated"}'::json;
  else
    result := '{"action":"skipped"}'::json;
  end if;

  return result;
end;
$$;

-- Allow anon to read, service_role to write (RLS off for simplicity on single-user app)
alter table properties    enable row level security;
alter table scan_history  enable row level security;

create policy "public read" on properties   for select using (true);
create policy "public read" on scan_history for select using (true);

-- ── AI analysis columns (migration — safe to re-run) ──────────────────────────
alter table properties add column if not exists ai_rationale text;
alter table properties add column if not exists ai_flags     text[] default '{}';
