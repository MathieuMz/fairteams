import { supabase } from "./supabase";
import { generateUniqueSlug } from "./slug";
import type {
  Competition,
  CompetitionConfig,
  Player,
  Constraint,
  Gender,
  ConstraintType,
  Criterion,
  LevelLabel,
} from "../domain/types";

// ---------- helpers camelCase <-> snake_case ----------

function toComp(row: Record<string, unknown>): Competition {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    numTeams: row.num_teams as number,
    targetMen: row.target_men as number,
    targetWomen: row.target_women as number,
    beginnerThreshold: row.beginner_threshold as number,
    beginnerCap: row.beginner_cap as number,
    levelLabels: row.level_labels as LevelLabel[],
    weights: row.weights as Record<Criterion, number>,
  };
}

function toPlayer(row: Record<string, unknown>): Player {
  return {
    id: row.id as string,
    competitionId: row.competition_id as string,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    gender: row.gender as Gender,
    level: row.level as number,
    isCaptain: row.is_captain as boolean,
    team: row.team as number | null,
  };
}

function toConstraint(row: Record<string, unknown>): Constraint {
  return {
    id: row.id as string,
    competitionId: row.competition_id as string,
    player1Id: row.player1_id as string,
    player2Id: row.player2_id as string,
    type: row.type as ConstraintType,
  };
}

function defaultConfig(): Omit<CompetitionConfig, never> {
  return {
    numTeams: 6,
    targetMen: 6,
    targetWomen: 5,
    beginnerThreshold: 20,
    beginnerCap: 2,
    levelLabels: [],
    weights: { beginner: 5, level: 5, friends: 5 },
  };
}

// ---------- competitions ----------

export async function createCompetition(
  name: string,
  cfg?: Partial<CompetitionConfig>,
): Promise<Competition> {
  const slug = await generateUniqueSlug();
  const merged = { ...defaultConfig(), ...cfg };
  const { data, error } = await supabase
    .from("competitions")
    .insert({
      slug,
      name,
      num_teams: merged.numTeams,
      target_men: merged.targetMen,
      target_women: merged.targetWomen,
      beginner_threshold: merged.beginnerThreshold,
      beginner_cap: merged.beginnerCap,
      level_labels: merged.levelLabels,
      weights: merged.weights,
    })
    .select()
    .single();
  if (error) throw error;
  return toComp(data);
}

export async function getCompetitionBySlug(
  slug: string,
): Promise<Competition | null> {
  const { data, error } = await supabase
    .from("competitions")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data ? toComp(data) : null;
}

export async function updateCompetitionConfig(
  slug: string,
  cfg: CompetitionConfig,
): Promise<Competition> {
  const { data, error } = await supabase
    .from("competitions")
    .update({
      num_teams: cfg.numTeams,
      target_men: cfg.targetMen,
      target_women: cfg.targetWomen,
      beginner_threshold: cfg.beginnerThreshold,
      beginner_cap: cfg.beginnerCap,
      level_labels: cfg.levelLabels,
      weights: cfg.weights,
    })
    .eq("slug", slug)
    .select()
    .single();
  if (error) throw error;
  return toComp(data);
}

// ---------- players ----------

export async function listPlayers(competitionId: string): Promise<Player[]> {
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("competition_id", competitionId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map(toPlayer);
}

export async function bulkCreatePlayers(
  competitionId: string,
  inputs: Omit<Player, "id" | "competitionId">[],
): Promise<Player[]> {
  if (!inputs.length) return [];
  const rows = inputs.map((p) => ({
    competition_id: competitionId,
    first_name: p.firstName,
    last_name: p.lastName,
    gender: p.gender,
    level: p.level,
    is_captain: p.isCaptain,
    team: p.team,
  }));
  const { data, error } = await supabase.from("players").insert(rows).select();
  if (error) throw error;
  return (data ?? []).map(toPlayer);
}

export async function updatePlayer(
  playerId: string,
  patch: Partial<Player>,
): Promise<Player> {
  const update: Record<string, unknown> = {};
  if (patch.firstName !== undefined) update.first_name = patch.firstName;
  if (patch.lastName !== undefined) update.last_name = patch.lastName;
  if (patch.gender !== undefined) update.gender = patch.gender;
  if (patch.level !== undefined) update.level = patch.level;
  if (patch.isCaptain !== undefined) update.is_captain = patch.isCaptain;
  if ("team" in patch) update.team = patch.team;
  const { data, error } = await supabase
    .from("players")
    .update(update)
    .eq("id", playerId)
    .select()
    .single();
  if (error) throw error;
  return toPlayer(data);
}

export async function deleteAllPlayersAndConstraints(
  competitionId: string,
): Promise<void> {
  // constraints cascade on player delete, but we also delete them explicitly
  const { error: e1 } = await supabase
    .from("constraints")
    .delete()
    .eq("competition_id", competitionId);
  if (e1) throw e1;
  const { error: e2 } = await supabase
    .from("players")
    .delete()
    .eq("competition_id", competitionId);
  if (e2) throw e2;
}

// ---------- constraints ----------

export async function listConstraints(
  competitionId: string,
): Promise<Constraint[]> {
  const { data, error } = await supabase
    .from("constraints")
    .select("*")
    .eq("competition_id", competitionId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map(toConstraint);
}

export async function createConstraint(
  competitionId: string,
  input: Omit<Constraint, "id" | "competitionId">,
): Promise<Constraint> {
  const { data, error } = await supabase
    .from("constraints")
    .insert({
      competition_id: competitionId,
      player1_id: input.player1Id,
      player2_id: input.player2Id,
      type: input.type,
    })
    .select()
    .single();
  if (error) throw error;
  return toConstraint(data);
}

export async function updateConstraint(
  id: string,
  type: ConstraintType,
): Promise<Constraint> {
  const { data, error } = await supabase
    .from("constraints")
    .update({ type })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return toConstraint(data);
}

export async function deleteConstraint(id: string): Promise<void> {
  const { error } = await supabase.from("constraints").delete().eq("id", id);
  if (error) throw error;
}
