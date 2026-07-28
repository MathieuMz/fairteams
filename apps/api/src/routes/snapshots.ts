import type { FastifyInstance } from 'fastify'
import * as repo from '../lib/repo'

export async function register(app: FastifyInstance) {
  // POST /competitions/:slug/snapshots
  app.post('/competitions/:slug/snapshots', async (req, reply) => {
    const { slug } = req.params as { slug: string }
    const competition = await repo.getCompetitionBySlug(slug)
    if (!competition) return reply.status(404).send({ error: 'competition not found' })
    const { label } = req.body as { label?: string }
    const [players] = await Promise.all([repo.listPlayers(competition.id)])
    const snapshotLabel = label?.trim() || `Snapshot du ${new Date().toLocaleDateString('fr-FR')}`
    const snapshot = await repo.createSnapshot(competition.id, snapshotLabel, {
      players,
      config: {
        numTeams: competition.numTeams,
        targetMen: competition.targetMen,
        targetWomen: competition.targetWomen,
        beginnerThreshold: competition.beginnerThreshold,
        beginnerCap: competition.beginnerCap,
        levelLabels: competition.levelLabels,
        priority: competition.priority,
      },
    })
    return reply.status(201).send(snapshot)
  })

  // POST /competitions/:slug/snapshots/:id/restore
  app.post('/competitions/:slug/snapshots/:id/restore', async (req, reply) => {
    const { slug, id } = req.params as { slug: string; id: string }
    const competition = await repo.getCompetitionBySlug(slug)
    if (!competition) return reply.status(404).send({ error: 'competition not found' })

    const snapshots = await repo.listSnapshots(competition.id)
    const snap = snapshots.find(s => s.id === id)
    if (!snap) return reply.status(404).send({ error: 'snapshot not found' })

    // Effacer les joueurs et contraintes actuels, puis recréer depuis le snapshot
    await repo.deleteAllPlayersConstraintsSnapshots(competition.id)
    const updatedComp = await repo.updateCompetitionConfig(slug, snap.data.config)
    const players = await repo.bulkCreatePlayers(competition.id, snap.data.players.map(p => ({
      firstName: p.firstName,
      lastName: p.lastName,
      gender: p.gender,
      level: p.level,
      isCaptain: p.isCaptain,
      team: p.team,
    })))

    return { competition: updatedComp, players }
  })
}
