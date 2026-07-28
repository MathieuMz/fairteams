-- Schéma Supabase pour FairTeams
-- Un seul utilisateur pour l'instant : pas de RLS strict, juste des policies permissives.
-- Si un jour plusieurs organisateurs partagent l'accès, ajouter l'auth Supabase et scoper les policies par user_id.

create table competitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  num_teams int not null default 6,
  target_men int not null default 6,
  target_women int not null default 5,
  level_min int not null default 1,
  level_max int not null default 10,
  beginner_cap int not null default 2,
  priority jsonb not null default '["gender","beginner","level","friends"]',
  created_at timestamptz not null default now()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  name text not null,
  gender text not null check (gender in ('H','F')),
  declared_level int not null,
  level int not null,
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
