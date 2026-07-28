import type { FastifyInstance } from 'fastify'
import * as repo from '../lib/repo'
import { generateRebalanceProposals } from '../domain/balancing'
import type { RebalanceProposal } from '../domain/types'

export async function register(app: FastifyInstance) {
  // POST /competitions/:slug/rebalance-proposals  — calcule sans muter la DB
  app.post('/competitions/:slug/rebalance-proposals', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const competition = await repo.getCompetitionBySlug(slug)
    if (!competition) return reply.status(404).send({ error: 'competition not found' })

    const [players, constraints] = await Promise.all([
      repo.listPlayers(competition.id),
      repo.listConstraints(competition.id),
    ])

    const proposals = generateRebalanceProposals(players, competition, constraints)
    return proposals
  })

  // POST /competitions/:slug/apply-proposals  — applique les propositions confirmées par le front
  app.post('/competitions/:slug/apply-proposals', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const competition = await repo.getCompetitionBySlug(slug)
    if (!competition) return reply.status(404).send({ error: 'competition not found' })

    const { proposals } = req.body as { proposals: RebalanceProposal[] }
    if (!Array.isArray(proposals)) return reply.status(400).send({ error: 'proposals array required' })

    const updated = await Promise.all(
      proposals.map(p => repo.updatePlayer(p.playerId, { team: p.to }))
    )
    return updated
  })
}
