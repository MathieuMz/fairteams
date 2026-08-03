import type {
  Competition,
  CompetitionConfig,
  CompetitionData,
  Player,
  Constraint,
  ConstraintType,
  Gender,
  RebalanceProposal,
} from './types'

const API_URL = process.env.NEXT_PUBLIC_API_URL!

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const { headers: extraHeaders, ...rest } = init ?? {}
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: { ...(rest.body != null ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? 'API error')
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export type NewPlayer = {
  firstName: string
  lastName: string
  gender: Gender
  level: number
  isCaptain: boolean
  team: number | null
}

export type NewConstraint = {
  player1Id: string
  player2Id: string
  type: ConstraintType
}

export const api = {
  createCompetition: (name: string) =>
    json<Competition>('/competitions', { method: 'POST', body: JSON.stringify({ name }) }),

  getCompetition: (slug: string) =>
    json<CompetitionData>(`/competitions/${slug}`),

  updateConfig: (slug: string, cfg: CompetitionConfig) =>
    json<Competition>(`/competitions/${slug}/config`, { method: 'PATCH', body: JSON.stringify(cfg) }),

  addPlayers: (slug: string, players: NewPlayer[]) =>
    json<Player[]>(`/competitions/${slug}/players`, { method: 'POST', body: JSON.stringify({ players }) }),

  updatePlayer: (id: string, patch: Partial<Player>) =>
    json<Player>(`/players/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  resetData: (slug: string) =>
    json<void>(`/competitions/${slug}/reset`, { method: 'POST' }),

  addConstraint: (slug: string, c: NewConstraint) =>
    json<Constraint>(`/competitions/${slug}/constraints`, { method: 'POST', body: JSON.stringify(c) }),

  updateConstraint: (id: string, type: ConstraintType) =>
    json<Constraint>(`/constraints/${id}`, { method: 'PATCH', body: JSON.stringify({ type }) }),

  deleteConstraint: (id: string) =>
    json<void>(`/constraints/${id}`, { method: 'DELETE' }),

  rebalanceProposals: (slug: string) =>
    json<RebalanceProposal[]>(`/competitions/${slug}/rebalance-proposals`, { method: 'POST' }),

  reshuffleProposals: (slug: string) =>
    json<RebalanceProposal[]>(`/competitions/${slug}/reshuffle-proposals`, { method: 'POST' }),

  applyProposals: (slug: string, proposals: RebalanceProposal[]) =>
    json<Player[]>(`/competitions/${slug}/apply-proposals`, { method: 'POST', body: JSON.stringify({ proposals }) }),
}
