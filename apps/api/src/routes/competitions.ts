import type { FastifyInstance } from 'fastify'
import * as repo from '../lib/repo'
import type { CompetitionConfig } from '../domain/types'

export async function register(app: FastifyInstance) {
  // POST /competitions
  app.post('/competitions', async (req, reply) => {
    const { name } = req.body as { name?: string }
    if (!name?.trim()) return reply.status(400).send({ error: 'name required' })
    const competition = await repo.createCompetition(name.trim())
    return reply.status(201).send(competition)
  })

  // GET /competitions/:slug — retourne competition + players + constraints
  app.get('/competitions/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const competition = await repo.getCompetitionBySlug(slug)
    if (!competition) return reply.status(404).send({ error: 'competition not found' })
    const [players, constraints] = await Promise.all([
      repo.listPlayers(competition.id),
      repo.listConstraints(competition.id),
    ])
    return { competition, players, constraints }
  })

  // PATCH /competitions/:slug/config
  app.patch('/competitions/:slug/config', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const competition = await repo.getCompetitionBySlug(slug)
    if (!competition) return reply.status(404).send({ error: 'competition not found' })
    const cfg = req.body as CompetitionConfig
    const updated = await repo.updateCompetitionConfig(slug, cfg)
    return updated
  })
}
