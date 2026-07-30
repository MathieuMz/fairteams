import type { FastifyInstance } from 'fastify'
import * as repo from '../lib/repo'
import type { Constraint, ConstraintType } from '../domain/types'

export async function register(app: FastifyInstance) {
  // POST /competitions/:slug/constraints
  app.post('/competitions/:slug/constraints', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const competition = await repo.getCompetitionBySlug(slug)
    if (!competition) return reply.status(404).send({ error: 'competition not found' })
    const { player1Id, player2Id, type } = req.body as Pick<Constraint, 'player1Id' | 'player2Id' | 'type'>
    if (!player1Id || !player2Id || !type) return reply.status(400).send({ error: 'player1Id, player2Id, type required' })
    if (player1Id === player2Id) return reply.status(400).send({ error: 'player1Id and player2Id must differ' })
    const created = await repo.createConstraint(competition.id, { player1Id, player2Id, type })
    return reply.status(201).send(created)
  })

  // PATCH /constraints/:id
  app.patch('/constraints/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { type } = req.body as { type?: ConstraintType }
    if (!type) return reply.status(400).send({ error: 'type required' })
    const updated = await repo.updateConstraint(id, type)
    return updated
  })

  // DELETE /constraints/:id
  app.delete('/constraints/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    await repo.deleteConstraint(id)
    return reply.status(204).send()
  })
}
