import type { FastifyInstance } from 'fastify'
import * as repo from '../lib/repo'
import type { Player } from '../domain/types'
import { bestTeamForPlayer } from '../domain/balancing'

export async function register(app: FastifyInstance) {
  // POST /competitions/:slug/players  (bulk import)
  app.post('/competitions/:slug/players', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const competition = await repo.getCompetitionBySlug(slug)
    if (!competition) return reply.status(404).send({ error: 'competition not found' })

    const { players: inputs } = req.body as { players: Omit<Player, 'id' | 'competitionId'>[] }
    if (!Array.isArray(inputs) || !inputs.length) return reply.status(400).send({ error: 'players array required' })

    // Assigner automatiquement une équipe via l'algo si team est null
    const existing = await repo.listPlayers(competition.id)
    const constraints = await repo.listConstraints(competition.id)

    const toInsert = inputs.map(p => {
      if (p.team !== null && p.team !== undefined) return p
      const all = [...existing]
      const team = bestTeamForPlayer({ ...p, id: '', competitionId: competition.id }, competition, all, constraints)
      const inserted = { ...p, team }
      existing.push({ ...inserted, id: '', competitionId: competition.id })
      return inserted
    })

    const created = await repo.bulkCreatePlayers(competition.id, toInsert)
    return reply.status(201).send(created)
  })

  // PATCH /players/:id
  app.patch('/players/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const patch = req.body as Partial<Player>
    const updated = await repo.updatePlayer(id, patch)
    return updated
  })

  // POST /competitions/:slug/reset  — efface joueurs + contraintes + snapshots
  app.post('/competitions/:slug/reset', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const competition = await repo.getCompetitionBySlug(slug)
    if (!competition) return reply.status(404).send({ error: 'competition not found' })
    await repo.deleteAllPlayersConstraintsSnapshots(competition.id)
    return reply.status(204).send()
  })
}
