import type {
  Player,
  CompetitionConfig,
  Constraint,
  RebalanceProposal,
} from "./types";

const RELATION_TYPES = {
  doit: { kind: "hard" as const, sign: 1 },
  veut: { kind: "soft" as const, sign: 1 },
  ne_veut_pas: { kind: "soft" as const, sign: -1 },
  ne_doit_pas: { kind: "hard" as const, sign: -1 },
};

export function isBeginner(p: Player, cfg: CompetitionConfig): boolean {
  return p.level <= cfg.beginnerThreshold;
}

export function computeTeamStats(
  teamIndex: number,
  cfg: CompetitionConfig,
  players: Player[],
) {
  const members = players.filter((p) => p.team === teamIndex);
  const men = members.filter((p) => p.gender === "H").length;
  const women = members.filter((p) => p.gender === "F").length;
  const levels = members.map((p) => p.level).sort((a, b) => a - b);
  const avg = levels.length
    ? levels.reduce((a, b) => a + b, 0) / levels.length
    : 0;
  let median = 0;
  if (levels.length) {
    const mid = Math.floor(levels.length / 2);
    median =
      levels.length % 2 ? levels[mid] : (levels[mid - 1] + levels[mid]) / 2;
  }
  const beginners = members.filter((p) => isBeginner(p, cfg)).length;
  const captain = members.find((p) => p.isCaptain);
  return { members, men, women, avg, median, beginners, captain };
}

export function overallAverageLevel(players: Player[]): number {
  if (!players.length) return 0;
  return players.reduce((a, p) => a + p.level, 0) / players.length;
}

export function scoreTeamForPlayer(
  teamIndex: number,
  player: Player,
  cfg: CompetitionConfig,
  players: Player[],
  constraints: Constraint[],
): number {
  const stats = computeTeamStats(teamIndex, cfg, players);

  // Gender: prefer teams where this gender is underrepresented vs average
  const menCounts = Array.from({ length: cfg.numTeams }, (_, t) =>
    players.filter((p) => p.team === t && p.gender === "H").length,
  );
  const avgMen = menCounts.reduce((a, b) => a + b, 0) / cfg.numTeams;
  const genderScore =
    player.gender === "H"
      ? avgMen - stats.men
      : stats.men - avgMen; // fewer men = more F needed

  // Size: prefer smaller teams
  const avgSize = players.length / cfg.numTeams;
  const sizeScore = (avgSize - stats.members.length) * 0.5;

  // Level: prefer teams close to overall mean
  const overallMean = overallAverageLevel([...players, player]) || player.level;
  const predictedAvg =
    (stats.avg * stats.members.length + player.level) /
    (stats.members.length + 1);
  const levelScore = -Math.abs(predictedAvg - overallMean);

  // Beginner cap
  let beginnerScore = 0;
  if (isBeginner(player, cfg)) {
    const capacityLeft = cfg.beginnerCap - stats.beginners;
    beginnerScore = capacityLeft > 0 ? capacityLeft : -20;
  }

  // Relations
  let relationScore = 0;
  constraints
    .filter((c) => c.player1Id === player.id || c.player2Id === player.id)
    .forEach((c) => {
      const otherId = c.player1Id === player.id ? c.player2Id : c.player1Id;
      const other = players.find((p) => p.id === otherId);
      if (!other || other.team !== teamIndex) return;
      const rel = RELATION_TYPES[c.type];
      relationScore += rel.kind === "soft" ? rel.sign * 10 : rel.sign * 1000;
    });

  return genderScore * 4 + sizeScore + levelScore + beginnerScore + relationScore;
}

export function bestTeamForPlayer(
  player: Player,
  cfg: CompetitionConfig,
  players: Player[],
  constraints: Constraint[],
): number | null {
  const relevant = constraints.filter(
    (c) => c.player1Id === player.id || c.player2Id === player.id,
  );
  const otherOf = (c: Constraint) =>
    c.player1Id === player.id ? c.player2Id : c.player1Id;

  for (const c of relevant) {
    if (c.type === "doit") {
      const other = players.find((p) => p.id === otherOf(c));
      if (other && other.team !== null) return other.team;
    }
  }

  const forbidden = new Set<number>();
  relevant.forEach((c) => {
    if (c.type === "ne_doit_pas") {
      const other = players.find((p) => p.id === otherOf(c));
      if (other && other.team !== null) forbidden.add(other.team);
    }
  });

  let best: number | null = null;
  let bestScore = -Infinity;
  for (let t = 0; t < cfg.numTeams; t++) {
    if (forbidden.has(t)) continue;
    const s = scoreTeamForPlayer(t, player, cfg, players, constraints);
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }
  if (best === null) {
    for (let t = 0; t < cfg.numTeams; t++) {
      const s = scoreTeamForPlayer(t, player, cfg, players, constraints);
      if (s > bestScore) {
        bestScore = s;
        best = t;
      }
    }
  }
  return best;
}

export function canMovePlayer(
  p: Player,
  players: Player[],
  constraints: Constraint[],
): boolean {
  if (p.isCaptain) return false;
  const doitLinks = constraints.filter(
    (c) => c.type === "doit" && (c.player1Id === p.id || c.player2Id === p.id),
  );
  for (const c of doitLinks) {
    const otherId = c.player1Id === p.id ? c.player2Id : c.player1Id;
    const other = players.find((x) => x.id === otherId);
    if (other && other.team === p.team) return false;
  }
  return true;
}

// Sum of soft constraint violations (lower = better)
function softRelationViolations(
  players: Player[],
  constraints: Constraint[],
): number {
  let score = 0;
  constraints.forEach((c) => {
    if (c.type !== "veut" && c.type !== "ne_veut_pas") return;
    const p1 = players.find((x) => x.id === c.player1Id);
    const p2 = players.find((x) => x.id === c.player2Id);
    if (!p1 || !p2 || p1.team === null || p2.team === null) return;
    const same = p1.team === p2.team;
    if (c.type === "veut" && !same) score += 1;
    if (c.type === "ne_veut_pas" && same) score += 1;
  });
  return score;
}

// Total excess beginners over cap (lower = better)
function totalBeginnerExcess(
  players: Player[],
  cfg: CompetitionConfig,
  numTeams: number,
): number {
  let total = 0;
  for (let t = 0; t < numTeams; t++) {
    const members = players.filter((p) => p.team === t);
    const beginners = members.filter((p) => isBeginner(p, cfg)).length;
    total += Math.max(0, beginners - cfg.beginnerCap);
  }
  return total;
}

// Sum of absolute deviations of team averages from global mean (lower = better)
function levelSpread(players: Player[], numTeams: number): number {
  const avgs = Array.from({ length: numTeams }, (_, t) => {
    const members = players.filter((p) => p.team === t);
    if (!members.length) return 0;
    return members.reduce((a, p) => a + p.level, 0) / members.length;
  });
  const mean = avgs.reduce((a, b) => a + b, 0) / avgs.length;
  return avgs.reduce((a, v) => a + Math.abs(v - mean), 0);
}

export function computeImbalanceScore(
  players: Player[],
  cfg: CompetitionConfig,
  constraints: Constraint[],
): number {
  const weights: Record<string, number> = {};
  cfg.priority.forEach((crit, idx) => {
    weights[crit] = cfg.priority.length - idx;
  });

  const teamStats = Array.from({ length: cfg.numTeams }, (_, t) =>
    computeTeamStats(t, cfg, players),
  );

  // Gender: max-min H count (fixed rule, heavy weight)
  const menCounts = teamStats.map((s) => s.men);
  const genderDev = Math.max(...menCounts) - Math.min(...menCounts);

  // Size: max-min team size (fixed rule)
  const sizes = teamStats.map((s) => s.members.length);
  const sizeDev = Math.max(...sizes) - Math.min(...sizes);

  // Configurable criteria
  let beginnerDev = 0;
  teamStats.forEach((s) => {
    beginnerDev += Math.max(0, s.beginners - cfg.beginnerCap);
  });

  const overallMean = overallAverageLevel(players);
  let levelDev = 0;
  teamStats.forEach((s) => {
    levelDev += Math.abs(s.avg - overallMean);
  });

  let relDev = 0;
  constraints.forEach((c) => {
    const p1 = players.find((x) => x.id === c.player1Id);
    const p2 = players.find((x) => x.id === c.player2Id);
    if (!p1 || !p2 || p1.team === null || p2.team === null) return;
    const same = p1.team === p2.team;
    if (c.type === "doit" && !same) relDev += 1000;
    if (c.type === "ne_doit_pas" && same) relDev += 1000;
    if (c.type === "veut" && !same) relDev += 10;
    if (c.type === "ne_veut_pas" && same) relDev += 10;
  });

  return (
    genderDev * 100 +
    sizeDev * 10 +
    relDev * (weights.friends ?? 1) +
    beginnerDev * (weights.beginner ?? 1) * 10 +
    levelDev * (weights.level ?? 1)
  );
}

export function generateRebalanceProposals(
  players: Player[],
  cfg: CompetitionConfig,
  constraints: Constraint[],
): RebalanceProposal[] {
  const working = players.map((p) => ({ ...p }));
  const proposals: Array<{
    playerId: string;
    from: number;
    to: number;
    reason: string;
  }> = [];
  const movedIds = new Set<string>();

  const st = (t: number) => computeTeamStats(t, cfg, working);

  const push = (playerId: string, from: number, to: number, reason: string) => {
    proposals.push({ playerId, from, to, reason });
    movedIds.add(playerId);
  };

  // ── Phase 0 : contraintes fortes (doit / ne_doit_pas) ──────────────────────
  // Toujours appliquées, peuvent déséquilibrer temporairement taille et genre.
  // Les phases 1 et 2 corrigeront le déséquilibre.
  constraints.forEach((c) => {
    if (c.type !== "doit" && c.type !== "ne_doit_pas") return;
    const p1 = working.find((x) => x.id === c.player1Id);
    const p2 = working.find((x) => x.id === c.player2Id);
    if (!p1 || !p2 || p1.team === null || p2.team === null) return;

    if (c.type === "doit" && p1.team !== p2.team) {
      const mover = canMovePlayer(p2, working, constraints)
        ? p2
        : canMovePlayer(p1, working, constraints)
          ? p1
          : null;
      if (mover) {
        const target = mover === p2 ? p1 : p2;
        const from = mover.team!;
        mover.team = target.team;
        push(mover.id, from, target.team!, `Doit jouer avec ${target.firstName} ${target.lastName}`);
      }
    }

    if (c.type === "ne_doit_pas" && p1.team === p2.team) {
      const mover = canMovePlayer(p2, working, constraints)
        ? p2
        : canMovePlayer(p1, working, constraints)
          ? p1
          : null;
      if (mover) {
        const other = mover === p2 ? p1 : p2;
        let bestT: number | null = null;
        let bestScore = -Infinity;
        for (let t2 = 0; t2 < cfg.numTeams; t2++) {
          if (t2 === mover.team) continue;
          const sc = scoreTeamForPlayer(t2, mover, cfg, working, constraints);
          if (sc > bestScore) { bestScore = sc; bestT = t2; }
        }
        if (bestT !== null) {
          const from = mover.team!;
          mover.team = bestT;
          push(mover.id, from, bestT, `Ne doit pas jouer avec ${other.firstName} ${other.lastName}`);
        }
      }
    }
  });

  // ── Phase 1 : taille (règle fixe — max - min ≤ 1) ─────────────────────────
  // Déplace un joueur de l'équipe la plus grande vers la plus petite.
  // Préférence de genre : on choisit le genre dont l'équipe cible a le plus besoin
  // (pour aider la phase 2), mais c'est secondaire.
  let sizeIter = 0;
  while (sizeIter < 100) {
    sizeIter++;
    const sizes = Array.from({ length: cfg.numTeams }, (_, t) => st(t).members.length);
    const maxT = sizes.indexOf(Math.max(...sizes));
    const minT = sizes.indexOf(Math.min(...sizes));
    if (sizes[maxT] - sizes[minT] <= 1) break;

    const movable = st(maxT).members.filter((p) =>
      canMovePlayer(p, working, constraints),
    );
    if (!movable.length) break;

    // Préférer le genre sous-représenté dans minT
    const minMen = st(minT).men;
    const minWomen = st(minT).women;
    const preferH = minMen <= minWomen;
    const sorted = movable.slice().sort((a) =>
      (a.gender === "H") === preferH ? -1 : 1,
    );
    const candidate = sorted[0];
    const from = candidate.team!;
    candidate.team = minT;
    push(candidate.id, from, minT, "Rééquilibrage de la taille des équipes");
  }

  // ── Phase 2 : équilibre H/F (règle fixe — max(H) - min(H) ≤ 1) ───────────
  // Échanges H↔F entre l'équipe avec le plus de H et celle avec le moins.
  // Préserve les tailles (un H part, un F arrive, et vice-versa).
  let genderIter = 0;
  while (genderIter < 100) {
    genderIter++;
    const menCounts = Array.from({ length: cfg.numTeams }, (_, t) => st(t).men);
    const maxHt = menCounts.indexOf(Math.max(...menCounts));
    const minHt = menCounts.indexOf(Math.min(...menCounts));
    if (menCounts[maxHt] - menCounts[minHt] <= 1) break;

    const candidateH = st(maxHt).members.find(
      (p) => p.gender === "H" && canMovePlayer(p, working, constraints),
    );
    const candidateF = st(minHt).members.find(
      (p) => p.gender === "F" && canMovePlayer(p, working, constraints),
    );
    if (!candidateH || !candidateF) break;

    const tH = candidateH.team!;
    const tF = candidateF.team!;
    candidateH.team = tF;
    candidateF.team = tH;
    push(candidateH.id, tH, tF, "Rééquilibrage hommes / femmes");
    push(candidateF.id, tF, tH, "Rééquilibrage hommes / femmes");
  }

  // ── Phase 3 : critères configurables dans l'ordre de priorité ──────────────
  // Uniquement via échanges de même genre → préserve taille et ratio H/F.

  for (const criterion of cfg.priority) {

    // ── friends : préférences souples (veut / ne_veut_pas) ──────────────────
    if (criterion === "friends") {
      constraints.forEach((c) => {
        if (c.type !== "veut" && c.type !== "ne_veut_pas") return;
        const p1 = working.find((x) => x.id === c.player1Id);
        const p2 = working.find((x) => x.id === c.player2Id);
        if (!p1 || !p2 || p1.team === null || p2.team === null) return;

        if (c.type === "veut" && p1.team !== p2.team) {
          // Move p1 (or p2) onto the other's team via same-gender swap
          const mover = canMovePlayer(p1, working, constraints)
            ? p1
            : canMovePlayer(p2, working, constraints)
              ? p2
              : null;
          if (!mover) return;
          const target = mover === p1 ? p2 : p1;
          // Find a same-gender partner on target's team
          const partner = st(target.team!).members.find(
            (p) =>
              p.id !== target.id &&
              p.gender === mover.gender &&
              canMovePlayer(p, working, constraints),
          );
          if (!partner) return;
          const moverOrig = mover.team!;
          const partnerOrig = partner.team!;
          const before = softRelationViolations(working, constraints);
          mover.team = partnerOrig;
          partner.team = moverOrig;
          if (softRelationViolations(working, constraints) < before) {
            push(mover.id, moverOrig, partnerOrig, `Préférence : veut jouer avec ${target.firstName} ${target.lastName}`);
            push(partner.id, partnerOrig, moverOrig, "Échange pour préférence joueur");
          } else {
            mover.team = moverOrig;
            partner.team = partnerOrig;
          }
        }

        if (c.type === "ne_veut_pas" && p1.team === p2.team) {
          const mover = canMovePlayer(p1, working, constraints)
            ? p1
            : canMovePlayer(p2, working, constraints)
              ? p2
              : null;
          if (!mover) return;
          const other = mover === p1 ? p2 : p1;

          // Find the best same-gender swap on another team that reduces violations
          let bestPartner: Player | null = null;
          let bestViolations = softRelationViolations(working, constraints);

          for (let t2 = 0; t2 < cfg.numTeams; t2++) {
            if (t2 === mover.team) continue;
            const candidates = st(t2).members.filter(
              (p) =>
                p.gender === mover.gender &&
                canMovePlayer(p, working, constraints),
            );
            for (const partner of candidates) {
              const moverOrig = mover.team!;
              const partnerOrig = partner.team!;
              mover.team = partnerOrig;
              partner.team = moverOrig;
              const v = softRelationViolations(working, constraints);
              if (v < bestViolations) {
                bestViolations = v;
                bestPartner = partner;
              }
              mover.team = moverOrig;
              partner.team = partnerOrig;
            }
          }

          if (bestPartner) {
            const moverOrig = mover.team!;
            const partnerOrig = bestPartner.team!;
            mover.team = partnerOrig;
            bestPartner.team = moverOrig;
            push(mover.id, moverOrig, partnerOrig, `Préférence : ne veut pas jouer avec ${other.firstName} ${other.lastName}`);
            push(bestPartner.id, partnerOrig, moverOrig, "Échange pour préférence joueur");
          }
        }
      });
    }

    // ── beginner : plafond débutants (via échange même genre) ───────────────
    if (criterion === "beginner") {
      let beginnerIter = 0;
      while (beginnerIter < 50) {
        beginnerIter++;

        // Find team with most excess beginners
        let worstT = -1;
        let worstExcess = 0;
        for (let t = 0; t < cfg.numTeams; t++) {
          const excess = st(t).beginners - cfg.beginnerCap;
          if (excess > worstExcess) { worstExcess = excess; worstT = t; }
        }
        if (worstT === -1) break;

        // Find the best same-gender swap: beginner from worstT ↔ non-beginner on another team
        let bestSwap: { beg: Player; nb: Player } | null = null;
        let bestExcess = totalBeginnerExcess(working, cfg, cfg.numTeams);

        const beginnerCandidates = st(worstT).members.filter(
          (p) => isBeginner(p, cfg) && canMovePlayer(p, working, constraints),
        );

        for (const beg of beginnerCandidates) {
          for (let t2 = 0; t2 < cfg.numTeams; t2++) {
            if (t2 === worstT) continue;
            const nonBeginners = st(t2).members.filter(
              (p) =>
                !isBeginner(p, cfg) &&
                p.gender === beg.gender &&
                canMovePlayer(p, working, constraints),
            );
            for (const nb of nonBeginners) {
              const begOrig = beg.team!;
              const nbOrig = nb.team!;
              beg.team = nbOrig;
              nb.team = begOrig;
              const after = totalBeginnerExcess(working, cfg, cfg.numTeams);
              if (after < bestExcess) {
                bestExcess = after;
                bestSwap = { beg, nb };
              }
              beg.team = begOrig;
              nb.team = nbOrig;
            }
          }
        }

        if (!bestSwap) break;
        const begOrig = bestSwap.beg.team!;
        const nbOrig = bestSwap.nb.team!;
        bestSwap.beg.team = nbOrig;
        bestSwap.nb.team = begOrig;
        push(bestSwap.beg.id, begOrig, nbOrig, "Plafond débutants dépassé");
        push(bestSwap.nb.id, nbOrig, begOrig, "Échange pour rééquilibrage débutants");
      }
    }

    // ── level : équilibre du niveau moyen (échange même genre) ──────────────
    if (criterion === "level") {
      let levelIter = 0;
      while (levelIter < 50) {
        levelIter++;
        const avgs = Array.from({ length: cfg.numTeams }, (_, t) => st(t).avg);
        const maxT = avgs.indexOf(Math.max(...avgs));
        const minT = avgs.indexOf(Math.min(...avgs));
        // On 1-100 scale, < 5 points is close enough
        if (avgs[maxT] - avgs[minT] < 5) break;

        const highMembers = st(maxT).members.filter((p) =>
          canMovePlayer(p, working, constraints),
        );
        const lowMembers = st(minT).members.filter((p) =>
          canMovePlayer(p, working, constraints),
        );

        let bestSwap: { hp: Player; lp: Player } | null = null;
        let bestSpread = levelSpread(working, cfg.numTeams);

        highMembers.forEach((hp) => {
          lowMembers.forEach((lp) => {
            if (hp.gender !== lp.gender) return; // same gender only
            if (hp.level <= lp.level) return; // swap must close the gap
            const t1 = hp.team!;
            const t2 = lp.team!;
            hp.team = t2;
            lp.team = t1;
            const after = levelSpread(working, cfg.numTeams);
            if (after < bestSpread) {
              bestSpread = after;
              bestSwap = { hp, lp };
            }
            hp.team = t1;
            lp.team = t2;
          });
        });

        if (!bestSwap) break;
        const swap = bestSwap as { hp: Player; lp: Player };
        const t1 = swap.hp.team!;
        const t2 = swap.lp.team!;
        swap.hp.team = t2;
        swap.lp.team = t1;
        push(swap.hp.id, t1, t2, "Rééquilibrage du niveau moyen");
        push(swap.lp.id, t2, t1, "Rééquilibrage du niveau moyen");
      }
    }
  }

  // ── Fusion : plusieurs déplacements du même joueur → un seul changement net
  const byPlayer: Record<
    string,
    { playerId: string; from: number; to: number; reasons: string[] }
  > = {};
  proposals.forEach((p) => {
    if (!byPlayer[p.playerId]) {
      byPlayer[p.playerId] = {
        playerId: p.playerId,
        from: p.from,
        to: p.to,
        reasons: [p.reason],
      };
    } else {
      byPlayer[p.playerId].to = p.to;
      byPlayer[p.playerId].reasons.push(p.reason);
    }
  });
  return Object.values(byPlayer)
    .filter((p) => p.from !== p.to)
    .map((p) => ({
      playerId: p.playerId,
      from: p.from,
      to: p.to,
      reason: [...new Set(p.reasons)].join(" · "),
    }));
}
