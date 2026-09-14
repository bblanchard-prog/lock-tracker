-- Run this in the Supabase SQL editor:
-- https://supabase.com/dashboard/project/qvzeufyoucfcfvyszlak/sql/new

-- Current week picks (submitted via ThisWeek form)
create table if not exists picks (
  id bigint generated always as identity primary key,
  week text not null,           -- e.g. "2026-NFL-W01"
  player text not null,
  sport text,
  game text,
  lock text not null,
  odds integer,
  submitted_at timestamptz default now(),
  unique(week, player)
);

-- Historical pick overrides (pencil edits in SeasonView)
create table if not exists overrides (
  id bigint generated always as identity primary key,
  key text not null unique,     -- "<year>-<weekNum>-<PLAYER>"
  game text,
  lock text,
  odds integer,
  result text,
  sport text,
  outcome text,
  updated_at timestamptz default now()
);

-- Web push subscriptions
create table if not exists push_subscriptions (
  id bigint generated always as identity primary key,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

-- Enable RLS but allow anon read/write (app uses anon key on client)
alter table picks enable row level security;
alter table overrides enable row level security;
alter table push_subscriptions enable row level security;

create policy "allow all picks" on picks for all using (true) with check (true);
create policy "allow all overrides" on overrides for all using (true) with check (true);
create policy "allow all subscriptions" on push_subscriptions for all using (true) with check (true);
