import type { Player, CompetitionConfig, Constraint, RebalanceProposal } from './types'

const RELATION_TYPES = {
  doit:         { kind: 'hard' as const, sign:  1 },
  veut:         { kind: 'soft' as const, sign:  1 },
  ne_veut_pas:  { kind: 'soft' as const, sign: -1 },
  ne_doit_pas:  { kind: 'hard' as const, sign: -1 },
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
  let median = 0
  if (levels.length) {
    const mid = Math.floor(levels.length / 2)
    median = levels.length % 2 ? levels[mid] : (levels[mid - 1] + levels[mid]) / 2
  }
  const beginners = members.filter(p => isBeginner(p, cfg)).length
  const captain = members.find(p => p.isCaptain)
  return { members, men, women, avg, median, beginners, captain }
}

export function overallAverageLevel(players: Player[]): number {
  if (!players.length) return 0
  return players.reduce((a, p) => a + p.level, 0) / players.length
}

export function scoreTeamForPlayer(
  teamIndex: number,
  player: Player,
  cfg: CompetitionConfig,
  players: Player[],
  constraints: Constraint[],
): number {
  const stats = computeTeamStats(teamIndex, cfg, players)
  const weights: Record<string, number> = {}
  cfg.priority.forEach((crit, idx) => { weights[crit] = cfg.priority.length - idx })

  let genderScore = 0
  const target = player.gender === 'H' ? cfg.targetMen : cfg.targetWomen
  const current = player.gender === 'H' ? stats.men : stats.women
  if (target <= 0) {
    genderScore = -50
  } else {
    genderScore = (target - current) / target
  }

  let beginnerScore = 0
  if (isBeginner(player, cfg)) {
    const capacityLeft = cfg.beginnerCap - stats.beginners
    beginnerScore = capacityLeft > 0 ? capacityLeft : -20
  }

  const overallMean = overallAverageLevel([...players, player]) || player.level
  const predictedAvg = (stats.avg * stats.members.length + player.level) / (stats.members.length + 1)
  const levelScore = -Math.abs(predictedAvg - overallMean)

  let relationScore = 0
  constraints
    .filter(c => c.player1Id === player.id || c.player2Id === player.id)
    .forEach(c => {
      const otherId = c.player1Id === player.id ? c.player2Id : c.player1Id
      const other = players.find(p => p.id === otherId)
      if (!other || other.team !== teamIndex) return
      const rel = RELATION_TYPES[c.type]
      relationScore += rel.kind === 'soft' ? rel.sign * 10 : rel.sign * 1000
    })

  return (
    genderScore * weights.gender +
    beginnerScore * weights.beginner +
    levelScore * weights.level +
    relationScore * weights.friends
  )
}

export function bestTeamForPlayer(
  player: Player,
  cfg: CompetitionConfig,
  players: Player[],
  constraints: Constraint[],
): number | null {
  const relevant = constraints.filter(c => c.player1Id === player.id || c.player2Id === player.id)
  const otherOf = (c: Constraint) => c.player1Id === player.id ? c.player2Id : c.player1Id

  for (const c of relevant) {
    if (c.type === 'doit') {
      const other = players.find(p => p.id === otherOf(c))
      if (other && other.team !== null) return other.team
    }
  }

  const forbidden = new Set<number>()
  relevant.forEach(c => {
    if (c.type === 'ne_doit_pas') {
      const other = players.find(p => p.id === otherOf(c))
      if (other && other.team !== null) forbidden.add(other.team)
    }
  })

  let best: number | null = null
  let bestScore = -Infinity
  for (let t = 0; t < cfg.numTeams; t++) {
    if (forbidden.has(t)) continue
    const s = scoreTeamForPlayer(t, player, cfg, players, constraints)
    if (s > bestScore) { bestScore = s; best = t }
  }
  if (best === null) {
    for (let t = 0; t < cfg.numTeams; t++) {
      const s = scoreTeamForPlayer(t, player, cfg, players, constraints)
      if (s > bestScore) { bestScore = s; best = t }
    }
  }
  return best
}

export function canMovePlayer(p: Player, players: Player[], constraints: Constraint[]): boolean {
  if (p.isCaptain) return false
  const doitLinks = constraints.filter(
    c => c.type === 'doit' && (c.player1Id === p.id || c.player2Id === p.id)
  )
  for (const c of doitLinks) {
    const otherId = c.player1Id === p.id ? c.player2Id : c.player1Id
    const other = players.find(x => x.id === otherId)
    if (other && other.team === p.team) return false
  }
  return true
}

export function computeImbalanceScore(
  players: Player[],
  cfg: CompetitionConfig,
  constraints: Constraint[],
): number {
  const weights: Record<string, number> = {}
  cfg.priority.forEach((crit, idx) => { weights[crit] = cfg.priority.length - idx })

  const teamStats = Array.from({ length: cfg.numTeams }, (_, t) => computeTeamStats(t, cfg, players))
  const overallMean = overallAverageLevel(players)

  let genderDev = 0
  teamStats.forEach(s => {
    genderDev += Math.abs(s.men - cfg.targetMen) + Math.abs(s.women - cfg.targetWomen)
  })

  let beginnerDev = 0
  teamStats.forEach(s => { beginnerDev += Math.max(0, s.beginners - cfg.beginnerCap) })

  let levelDev = 0
  teamStats.forEach(s => { levelDev += Math.abs(s.avg - overallMean) })

  let relationDev = 0
  constraints.forEach(c => {
    const p1 = players.find(x => x.id === c.player1Id)
    const p2 = players.find(x => x.id === c.player2Id)
    if (!p1 || !p2 || p1.team === null || p2.team === null) return
    const same = p1.team === p2.team
    if (c.type === 'doit' && !same)       relationDev += 1000
    if (c.type === 'ne_doit_pas' && same) relationDev += 1000
    if (c.type === 'veut' && !same)       relationDev += 10
    if (c.type === 'ne_veut_pas' && same) relationDev += 10
  })

  const sizes = teamStats.map(s => s.members.length)
  const sizeDev = Math.max(...sizes) - Math.min(...sizes)

  return (
    genderDev * weights.gender +
    beginnerDev * weights.beginner +
    levelDev * weights.level +
    relationDev * weights.friends +
    sizeDev
  )
}

export function generateRebalanceProposals(
  players: Player[],
  cfg: CompetitionConfig,
  constraints: Constraint[],
): RebalanceProposal[] {
  const working = players.map(p => ({ ...p }))
  const proposals: Array<{ playerId: string; from: number; to: number; reason: string }> = []
  const movedIds = new Set<string>()

  const st = (t: number) => computeTeamStats(t, cfg, working)
  const globalScore = () => computeImbalanceScore(working, cfg, constraints)

  // 0. Corriger les contraintes fortes violées (doit / ne doit pas) — toujours appliqué, non négociable
  constraints.forEach(c => {
    if (c.type !== 'doit' && c.type !== 'ne_doit_pas') return
    const p1 = working.find(x => x.id === c.player1Id)
    const p2 = working.find(x => x.id === c.player2Id)
    if (!p1 || !p2 || p1.team === null || p2.team === null) return

    if (c.type === 'doit' && p1.team !== p2.team) {
      const mover = canMovePlayer(p2, working, constraints) ? p2 : (canMovePlayer(p1, working, constraints) ? p1 : null)
      if (mover) {
        const target = mover === p2 ? p1 : p2
        proposals.push({ playerId: mover.id, from: mover.team!, to: target.team!, reason: `Doit jouer avec ${target.name}` })
        mover.team = target.team
        movedIds.add(mover.id)
      }
    }
    if (c.type === 'ne_doit_pas' && p1.team === p2.team) {
      const mover = canMovePlayer(p2, working, constraints) ? p2 : (canMovePlayer(p1, working, constraints) ? p1 : null)
      if (mover) {
        const other = mover === p2 ? p1 : p2
        let bestT: number | null = null
        let bestScore = -Infinity
        for (let t2 = 0; t2 < cfg.numTeams; t2++) {
          if (t2 === mover.team) continue
          const sc = scoreTeamForPlayer(t2, mover, cfg, working, constraints)
          if (sc > bestScore) { bestScore = sc; bestT = t2 }
        }
        if (bestT !== null) {
          proposals.push({ playerId: mover.id, from: mover.team!, to: bestT, reason: `Ne doit pas jouer avec ${other.name}` })
          mover.team = bestT
          movedIds.add(mover.id)
        }
      }
    }
  })

  // 0bis. Préférences souples (veut / ne veut pas) — appliqué seulement si ça améliore le score global
  constraints.forEach(c => {
    if (c.type !== 'veut' && c.type !== 'ne_veut_pas') return
    const p1 = working.find(x => x.id === c.player1Id)
    const p2 = working.find(x => x.id === c.player2Id)
    if (!p1 || !p2 || p1.team === null || p2.team === null) return

    if (c.type === 'veut' && p1.team !== p2.team) {
      const mover = canMovePlayer(p2, working, constraints) ? p2 : (canMovePlayer(p1, working, constraints) ? p1 : null)
      if (mover) {
        const target = mover === p2 ? p1 : p2
        const before = globalScore()
        const originalTeam = mover.team!
        mover.team = target.team
        if (globalScore() < before - 1e-9) {
          proposals.push({ playerId: mover.id, from: originalTeam, to: target.team!, reason: `Préférence : veut jouer avec ${target.name}` })
          movedIds.add(mover.id)
        } else {
          mover.team = originalTeam
        }
      }
    }
    if (c.type === 'ne_veut_pas' && p1.team === p2.team) {
      const mover = canMovePlayer(p2, working, constraints) ? p2 : (canMovePlayer(p1, working, constraints) ? p1 : null)
      if (mover) {
        const other = mover === p2 ? p1 : p2
        let bestT: number | null = null
        let bestScore = -Infinity
        for (let t2 = 0; t2 < cfg.numTeams; t2++) {
          if (t2 === mover.team) continue
          const sc = scoreTeamForPlayer(t2, mover, cfg, working, constraints)
          if (sc > bestScore) { bestScore = sc; bestT = t2 }
        }
        if (bestT !== null) {
          const before = globalScore()
          const originalTeam = mover.team!
          mover.team = bestT
          if (globalScore() < before - 1e-9) {
            proposals.push({ playerId: mover.id, from: originalTeam, to: bestT, reason: `Préférence : ne veut pas jouer avec ${other.name}` })
            movedIds.add(mover.id)
          } else {
            mover.team = originalTeam
          }
        }
      }
    }
  })

  // 1. Plafond débutants — appliqué seulement si ça améliore le score global
  for (let t = 0; t < cfg.numTeams; t++) {
    const excess = st(t).beginners - cfg.beginnerCap
    if (excess <= 0) continue
    const movable = st(t).members.filter(p => isBeginner(p, cfg) && canMovePlayer(p, working, constraints))
    for (let i = 0; i < Math.min(excess, movable.length); i++) {
      const p = movable[i]
      let bestT: number | null = null
      let bestScore = -Infinity
      for (let t2 = 0; t2 < cfg.numTeams; t2++) {
        if (t2 === t || st(t2).beginners >= cfg.beginnerCap) continue
        const sc = scoreTeamForPlayer(t2, p, cfg, working, constraints)
        if (sc > bestScore) { bestScore = sc; bestT = t2 }
      }
      if (bestT !== null) {
        const before = globalScore()
        const originalTeam = p.team!
        p.team = bestT
        if (globalScore() < before - 1e-9) {
          proposals.push({ playerId: p.id, from: originalTeam, to: bestT, reason: 'Plafond débutants dépassé' })
          movedIds.add(p.id)
        } else {
          p.team = originalTeam
        }
      }
    }
  }

  // 2. Composition hommes / femmes — appliqué seulement si ça améliore le score global
  ;(['H', 'F'] as const).forEach(gender => {
    for (let t = 0; t < cfg.numTeams; t++) {
      const target = gender === 'H' ? cfg.targetMen : cfg.targetWomen
      const current = gender === 'H' ? st(t).men : st(t).women
      const excess = current - target
      if (excess <= 0) continue
      const movable = st(t).members.filter(p => p.gender === gender && canMovePlayer(p, working, constraints))
      for (let i = 0; i < Math.min(excess, movable.length); i++) {
        const p = movable[i]
        let bestT: number | null = null
        let bestScore = -Infinity
        for (let t2 = 0; t2 < cfg.numTeams; t2++) {
          if (t2 === t) continue
          const tgt2 = gender === 'H' ? cfg.targetMen : cfg.targetWomen
          const cur2 = gender === 'H' ? st(t2).men : st(t2).women
          if (cur2 >= tgt2) continue
          const sc = scoreTeamForPlayer(t2, p, cfg, working, constraints)
          if (sc > bestScore) { bestScore = sc; bestT = t2 }
        }
        if (bestT !== null) {
          const before = globalScore()
          const originalTeam = p.team!
          p.team = bestT
          if (globalScore() < before - 1e-9) {
            proposals.push({ playerId: p.id, from: originalTeam, to: bestT, reason: gender === 'H' ? "Trop d'hommes dans cette équipe" : 'Trop de femmes dans cette équipe' })
            movedIds.add(p.id)
          } else {
            p.team = originalTeam
          }
        }
      }
    }
  })

  // 3. Niveau moyen (échange de joueurs de même sexe) — appliqué seulement si ça améliore le score global
  let levelIterations = 0
  while (levelIterations < 30) {
    levelIterations++
    const avgs = Array.from({ length: cfg.numTeams }, (_, t) => st(t).avg)
    const maxT = avgs.indexOf(Math.max(...avgs))
    const minT = avgs.indexOf(Math.min(...avgs))
    if (avgs[maxT] - avgs[minT] < 0.5) break
    const highMembers = st(maxT).members.filter(p => canMovePlayer(p, working, constraints))
    const lowMembers = st(minT).members.filter(p => canMovePlayer(p, working, constraints))
    let bestSwap: { hp: Player; lp: Player } | null = null
    let bestScoreAfter = Infinity
    const before = globalScore()
    highMembers.forEach(hp => {
      lowMembers.forEach(lp => {
        if (hp.gender !== lp.gender || hp.level <= lp.level) return
        const t1 = hp.team!
        const t2 = lp.team!
        hp.team = t2; lp.team = t1
        const after = globalScore()
        if (after < bestScoreAfter) { bestScoreAfter = after; bestSwap = { hp, lp } }
        hp.team = t1; lp.team = t2
      })
    })
    if (!bestSwap || bestScoreAfter >= before - 1e-9) break
    const swap = bestSwap as { hp: Player; lp: Player }
    const t1 = swap.hp.team!
    const t2 = swap.lp.team!
    proposals.push({ playerId: swap.hp.id, from: t1, to: t2, reason: 'Rééquilibrage du niveau moyen' })
    proposals.push({ playerId: swap.lp.id, from: t2, to: t1, reason: 'Rééquilibrage du niveau moyen' })
    swap.hp.team = t2
    swap.lp.team = t1
    movedIds.add(swap.hp.id)
    movedIds.add(swap.lp.id)
  }

  // 4. Taille totale des équipes — appliqué seulement si ça améliore le score global
  let sizeIterations = 0
  while (sizeIterations < 30) {
    sizeIterations++
    const sizes = Array.from({ length: cfg.numTeams }, (_, t) => st(t).members.length)
    const maxT = sizes.indexOf(Math.max(...sizes))
    const minT = sizes.indexOf(Math.min(...sizes))
    if (sizes[maxT] - sizes[minT] <= 1) break
    const movable = st(maxT).members.filter(p => canMovePlayer(p, working, constraints))
    if (!movable.length) break
    const untouched = movable.filter(p => !movedIds.has(p.id))
    const pool = untouched.length ? untouched : movable
    const sorted = pool.slice().sort((a, b) => {
      const needA = (a.gender === 'H' ? cfg.targetMen : cfg.targetWomen) - (a.gender === 'H' ? st(minT).men : st(minT).women)
      const needB = (b.gender === 'H' ? cfg.targetMen : cfg.targetWomen) - (b.gender === 'H' ? st(minT).men : st(minT).women)
      return needB - needA
    })
    const before = globalScore()
    let applied = false
    for (const candidate of sorted) {
      const originalTeam = candidate.team!
      candidate.team = minT
      if (globalScore() < before - 1e-9) {
        proposals.push({ playerId: candidate.id, from: originalTeam, to: minT, reason: 'Rééquilibrage de la taille totale des équipes' })
        movedIds.add(candidate.id)
        applied = true
        break
      }
      candidate.team = originalTeam
    }
    if (!applied) break
  }

  // Fusionner les propositions successives d'un même joueur en un seul changement net
  const byPlayer: Record<string, { playerId: string; from: number; to: number; reasons: string[] }> = {}
  proposals.forEach(p => {
    if (!byPlayer[p.playerId]) {
      byPlayer[p.playerId] = { playerId: p.playerId, from: p.from, to: p.to, reasons: [p.reason] }
    } else {
      byPlayer[p.playerId].to = p.to
      byPlayer[p.playerId].reasons.push(p.reason)
    }
  })
  return Object.values(byPlayer)
    .filter(p => p.from !== p.to)
    .map(p => ({ playerId: p.playerId, from: p.from, to: p.to, reason: p.reasons.join(' · ') }))
}
