import { supabase } from './supabase'
import { generateUniqueSlug } from './slug'
import type { Competition, CompetitionConfig, Player, Constraint, Snapshot, Gender, ConstraintType, Criterion } from '../domain/types'

// ---------- helpers camelCase <-> snake_case ----------

function toComp(row: Record<string, unknown>): Competition {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    numTeams: row.num_teams as number,
    targetMen: row.target_men as number,
    targetWomen: row.target_women as number,
    levelMin: row.level_min as number,
    levelMax: row.level_max as number,
    beginnerCap: row.beginner_cap as number,
    priority: row.priority as Criterion[],
  }
}

function toPlayer(row: Record<string, unknown>): Player {
  return {
    id: row.id as string,
    competitionId: row.competition_id as string,
    name: row.name as string,
    gender: row.gender as Gender,
    declaredLevel: row.declared_level as number,
    level: row.level as number,
    isCaptain: row.is_captain as boolean,
    team: row.team as number | null,
  }
}

function toConstraint(row: Record<string, unknown>): Constraint {
  return {
    id: row.id as string,
    competitionId: row.competition_id as string,
    player1Id: row.player1_id as string,
    player2Id: row.player2_id as string,
    type: row.type as ConstraintType,
  }
}

function toSnapshot(row: Record<string, unknown>): Snapshot {
  return {
    id: row.id as string,
    competitionId: row.competition_id as string,
    label: row.label as string,
    playerCount: row.player_count as number,
    createdAt: row.created_at as string,
    data: row.data as Snapshot['data'],
  }
}

function defaultConfig(): Omit<CompetitionConfig, never> {
  return {
    numTeams: 6,
    targetMen: 6,
    targetWomen: 5,
    levelMin: 1,
    levelMax: 10,
    beginnerCap: 2,
    priority: ['gender', 'beginner', 'level', 'friends'],
  }
}

// ---------- competitions ----------

export async function createCompetition(name: string, cfg?: Partial<CompetitionConfig>): Promise<Competition> {
  const slug = await generateUniqueSlug()
  const merged = { ...defaultConfig(), ...cfg }
  const { data, error } = await supabase.from('competitions').insert({
    slug,
    name,
    num_teams: merged.numTeams,
    target_men: merged.targetMen,
    target_women: merged.targetWomen,
    level_min: merged.levelMin,
    level_max: merged.levelMax,
    beginner_cap: merged.beginnerCap,
    priority: merged.priority,
  }).select().single()
  if (error) throw error
  return toComp(data)
}

export async function getCompetitionBySlug(slug: string): Promise<Competition | null> {
  const { data, error } = await supabase.from('competitions').select('*').eq('slug', slug).maybeSingle()
  if (error) throw error
  return data ? toComp(data) : null
}

export async function updateCompetitionConfig(slug: string, cfg: CompetitionConfig): Promise<Competition> {
  const { data, error } = await supabase.from('competitions').update({
    num_teams: cfg.numTeams,
    target_men: cfg.targetMen,
    target_women: cfg.targetWomen,
    level_min: cfg.levelMin,
    level_max: cfg.levelMax,
    beginner_cap: cfg.beginnerCap,
    priority: cfg.priority,
  }).eq('slug', slug).select().single()
  if (error) throw error
  return toComp(data)
}

// ---------- players ----------

export async function listPlayers(competitionId: string): Promise<Player[]> {
  const { data, error } = await supabase.from('players').select('*').eq('competition_id', competitionId).order('created_at')
  if (error) throw error
  return (data ?? []).map(toPlayer)
}

export async function bulkCreatePlayers(
  competitionId: string,
  inputs: Omit<Player, 'id' | 'competitionId'>[],
): Promise<Player[]> {
  if (!inputs.length) return []
  const rows = inputs.map(p => ({
    competition_id: competitionId,
    name: p.name,
    gender: p.gender,
    declared_level: p.declaredLevel,
    level: p.level,
    is_captain: p.isCaptain,
    team: p.team,
  }))
  const { data, error } = await supabase.from('players').insert(rows).select()
  if (error) throw error
  return (data ?? []).map(toPlayer)
}

export async function updatePlayer(playerId: string, patch: Partial<Player>): Promise<Player> {
  const update: Record<string, unknown> = {}
  if (patch.name !== undefined)         update.name = patch.name
  if (patch.gender !== undefined)       update.gender = patch.gender
  if (patch.declaredLevel !== undefined) update.declared_level = patch.declaredLevel
  if (patch.level !== undefined)        update.level = patch.level
  if (patch.isCaptain !== undefined)    update.is_captain = patch.isCaptain
  if ('team' in patch)                  update.team = patch.team
  const { data, error } = await supabase.from('players').update(update).eq('id', playerId).select().single()
  if (error) throw error
  return toPlayer(data)
}

export async function deleteAllPlayersConstraintsSnapshots(competitionId: string): Promise<void> {
  // constraints and snapshots cascade on player delete, but we also delete snapshots explicitly
  const { error: e1 } = await supabase.from('snapshots').delete().eq('competition_id', competitionId)
  if (e1) throw e1
  const { error: e2 } = await supabase.from('constraints').delete().eq('competition_id', competitionId)
  if (e2) throw e2
  const { error: e3 } = await supabase.from('players').delete().eq('competition_id', competitionId)
  if (e3) throw e3
}

// ---------- constraints ----------

export async function listConstraints(competitionId: string): Promise<Constraint[]> {
  const { data, error } = await supabase.from('constraints').select('*').eq('competition_id', competitionId).order('created_at')
  if (error) throw error
  return (data ?? []).map(toConstraint)
}

export async function createConstraint(
  competitionId: string,
  input: Omit<Constraint, 'id' | 'competitionId'>,
): Promise<Constraint> {
  const { data, error } = await supabase.from('constraints').insert({
    competition_id: competitionId,
    player1_id: input.player1Id,
    player2_id: input.player2Id,
    type: input.type,
  }).select().single()
  if (error) throw error
  return toConstraint(data)
}

export async function deleteConstraint(id: string): Promise<void> {
  const { error } = await supabase.from('constraints').delete().eq('id', id)
  if (error) throw error
}

// ---------- snapshots ----------

export async function listSnapshots(competitionId: string): Promise<Snapshot[]> {
  const { data, error } = await supabase.from('snapshots').select('*').eq('competition_id', competitionId).order('created_at')
  if (error) throw error
  return (data ?? []).map(toSnapshot)
}

export async function createSnapshot(
  competitionId: string,
  label: string,
  data: Snapshot['data'],
): Promise<Snapshot> {
  const { data: row, error } = await supabase.from('snapshots').insert({
    competition_id: competitionId,
    label,
    player_count: data.players.length,
    data,
  }).select().single()
  if (error) throw error
  return toSnapshot(row)
}
