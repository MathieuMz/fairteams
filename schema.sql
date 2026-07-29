-- Schéma Supabase pour FairTeams
-- Toutes les tables sont dans le schéma PostgreSQL "fairteams" (configuré dans apps/api/src/lib/supabase.ts).
-- Un seul utilisateur pour l'instant : pas de RLS strict, juste des policies permissives.
-- Si un jour plusieurs organisateurs partagent l'accès, ajouter l'auth Supabase et scoper les policies par user_id.

-- Migration depuis l'ancienne version (à appliquer dans l'éditeur SQL Supabase) :
--   ALTER TABLE fairteams.competitions DROP COLUMN IF EXISTS level_min;
--   ALTER TABLE fairteams.competitions DROP COLUMN IF EXISTS level_max;
--   ALTER TABLE fairteams.competitions ADD COLUMN IF NOT EXISTS beginner_threshold int NOT NULL DEFAULT 20 CHECK (beginner_threshold BETWEEN 1 AND 100);
--   ALTER TABLE fairteams.competitions ADD COLUMN IF NOT EXISTS level_labels jsonb NOT NULL DEFAULT '[]';
--   ALTER TABLE fairteams.players DROP COLUMN IF EXISTS declared_level;
--   ALTER TABLE fairteams.competitions ADD COLUMN IF NOT EXISTS weights jsonb NOT NULL DEFAULT '{"beginner":5,"level":5,"friends":5}';
--   ALTER TABLE fairteams.competitions DROP COLUMN IF EXISTS priority;

create schema if not exists fairteams;
set search_path = fairteams;

create table competitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  num_teams int not null default 6,
  target_men int not null default 6,
  target_women int not null default 5,
  beginner_threshold int not null default 20 check (beginner_threshold between 1 and 100),
  beginner_cap int not null default 2,
  level_labels jsonb not null default '[]',
  weights jsonb not null default '{"beginner":5,"level":5,"friends":5}',
  created_at timestamptz not null default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  gender text not null check (gender in ('H','F')),
  level int not null check (level between 1 and 100),
  is_captain boolean not null default false,
  team int, -- null = non assigné, sinon index 0-based de l'équipe
  created_at timestamptz not null default now()
);

create table constraints (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  player1_id uuid not null references players(id) on delete cascade,
  player2_id uuid not null references players(id) on delete cascade,
  type text not null check (type in ('doit','veut','ne_veut_pas','ne_doit_pas')),
  created_at timestamptz not null default now()
);

create table snapshots (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  label text not null,
  player_count int not null,
  data jsonb not null, -- copie complète de players + config au moment du snapshot
  created_at timestamptz not null default now()
);

create index on players (competition_id);
create index on constraints (competition_id);
create index on snapshots (competition_id);

-- Policies permissives (pas d'auth pour l'instant) — à resserrer si l'app devient multi-utilisateur
alter table competitions enable row level security;
alter table players enable row level security;
alter table constraints enable row level security;
alter table snapshots enable row level security;

create policy "allow all - competitions" on competitions for all using (true) with check (true);
create policy "allow all - players" on players for all using (true) with check (true);
create policy "allow all - constraints" on constraints for all using (true) with check (true);
create policy "allow all - snapshots" on snapshots for all using (true) with check (true);
