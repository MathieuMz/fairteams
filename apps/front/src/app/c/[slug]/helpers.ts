import type { Player, CompetitionConfig, Constraint } from '@/lib/types'

export const RELATION_LABELS: Record<string, string> = {
  doit: 'doit jouer avec',
  veut: 'veut jouer avec',
  ne_veut_pas: 'ne veut pas jouer avec',
  ne_doit_pas: 'ne doit pas jouer avec',
}

export const RELATION_KIND: Record<string, 'hard' | 'soft'> = {
  doit: 'hard',
  veut: 'soft',
  ne_veut_pas: 'soft',
  ne_doit_pas: 'hard',
}

export const CRITERIA_LABELS: Record<string, string> = {
  gender: 'Composition hommes / femmes',
  beginner: 'Plafond débutants',
  level: 'Équilibre du niveau moyen',
  friends: 'Relations entre joueurs (contraintes)',
}

export function isBeginner(p: Player, cfg: CompetitionConfig): boolean {
  return p.level <= cfg.levelMin
}

export function computeTeamStats(teamIndex: number, cfg: CompetitionConfig, players: Player[]) {
  const members = players.filter(p => p.team === teamIndex)
  const men = members.filter(p => p.gender === 'H').length
  const women = members.filter(p => p.gender === 'F').length
  const levels = members.map(p => p.level).sort((a, b) => a - b)
  const avg = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 0
  const beginners = members.filter(p => isBeginner(p, cfg)).length
  const captain = members.find(p => p.isCaptain)
  return { members, men, women, avg, beginners, captain }
}

export function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export const DEMO_MALE = ['Julien','Marc','Antoine','Karim','Nicolas','Simon','Louis','Étienne','Vincent','Mathieu','Olivier','Samuel','Gabriel','Félix','Alexandre','Thomas','David','Maxime','Benoît','Hugo']
export const DEMO_FEMALE = ['Léa','Sofia','Camille','Ana','Emma','Chloé','Laurence','Justine','Sarah','Rosalie','Marie','Alice','Juliette','Charlotte','Élise','Noémie','Florence','Zoé','Béatrice','Amélie']
export const DEMO_SURNAMES = ['Tremblay','Gagné','Roy','Côté','Lavoie','Fortin','Simard','Bouchard','Petit','Doré','Girard','Morin','Pelletier','Bergeron','Leblanc','Gagnon','Boucher','Fournier']

export function buildDemoPlayers(startIdx: number, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const idx = startIdx + i
    const gender = idx % 2 === 0 ? 'H' as const : 'F' as const
    const first = gender === 'H' ? DEMO_MALE[idx % DEMO_MALE.length] : DEMO_FEMALE[idx % DEMO_FEMALE.length]
    const surname = DEMO_SURNAMES[(idx * 7) % DEMO_SURNAMES.length]
    const level = Math.max(1, Math.min(10, Math.round(3 + Math.random() * 7)))
    return { name: `${first} ${surname}`, gender, declaredLevel: level, level, isCaptain: false, team: null as number | null }
  })
}

export function bestTeamForPlayerFront(
  player: { gender: string; level: number; id?: string },
  cfg: CompetitionConfig,
  existingPlayers: Player[],
  constraints: Constraint[],
): number {
  // Simple scoring: prefer team with gender need and closest average level
  let best = 0
  let bestScore = -Infinity
  for (let t = 0; t < cfg.numTeams; t++) {
    const stats = computeTeamStats(t, cfg, existingPlayers)
    const target = player.gender === 'H' ? cfg.targetMen : cfg.targetWomen
    const current = player.gender === 'H' ? stats.men : stats.women
    const gScore = target > 0 ? (target - current) / target : -50
    const avgDiff = stats.members.length > 0 ? Math.abs(stats.avg - player.level) : 0
    const score = gScore * 3 - avgDiff
    if (score > bestScore) { bestScore = score; best = t }
  }
  return best
}
