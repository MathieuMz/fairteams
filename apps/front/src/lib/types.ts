// si un troisième client consomme les mêmes types, extraire dans apps/shared

export type Gender = 'H' | 'F'
export type ConstraintType = 'doit' | 'veut' | 'ne_veut_pas' | 'ne_doit_pas'
export type Criterion = 'gender' | 'beginner' | 'level' | 'friends'

export type CompetitionConfig = {
  numTeams: number
  targetMen: number
  targetWomen: number
  levelMin: number
  levelMax: number
  beginnerCap: number
  priority: Criterion[]
}

export type Competition = {
  id: string
  slug: string
  name: string
} & CompetitionConfig

export type Player = {
  id: string
  competitionId: string
  name: string
  gender: Gender
  declaredLevel: number
  level: number
  isCaptain: boolean
  team: number | null
}

export type Constraint = {
  id: string
  competitionId: string
  player1Id: string
  player2Id: string
  type: ConstraintType
}

export type Snapshot = {
  id: string
  competitionId: string
  label: string
  playerCount: number
  createdAt: string
  data: { players: Player[]; config: CompetitionConfig }
}

export type RebalanceProposal = {
  playerId: string
  from: number
  to: number
  reason: string
}

export type CompetitionData = {
  competition: Competition
  players: Player[]
  constraints: Constraint[]
  snapshots: Snapshot[]
}
