import type {
  Player,
  CompetitionConfig,
  Constraint,
  Criterion,
  RebalanceProposal,
} from "./types";

// Ordre fixe utilisé pour départager les critères à poids égal.
const CRITERIA_ORDER: Criterion[] = ["friends", "beginner", "level"];

// Convertit un poids de curseur (0-10) en multiplicateur d'influence pour un
// critère configurable (friends / beginner / level) : 0 = critère totalement
// ignoré, 5 (défaut) = multiplicateur neutre (1×), 10 = critère quasi
// exclusif (32× plus déterminant que les autres critères au réglage par
// défaut). Échelle exponentielle centrée sur 5 pour que chaque cran du
// curseur ait un effet perceptible, y compris en bas de l'échelle (1 = pris
// en compte mais très peu prioritaire).
function weightMultiplier(weight: number): number {
  const w = Math.min(10, Math.max(0, weight));
  if (w === 0) return 0;
  return Math.pow(2, w - 5);
}

// Écart de niveau moyen (sur 100) toléré entre équipes avant d'arrêter le
// rééquilibrage : plus le poids est élevé, plus la tolérance est resserrée
// (rééquilibrage plus agressif). Poids 5 (défaut) ≈ tolérance historique de 5.
function levelToleranceForWeight(weight: number): number {
  const w = Math.min(10, Math.max(1, weight));
  return Math.max(1, 11 - w);
}

// Combien de points d'écart de niveau moyen (levelSpread) on accepte de
// sacrifier pour satisfaire une préférence "friends" : dépend de l'importance
// relative de "friends" par rapport à "level". Si "level" est à 0, le niveau
// n'a aucune importance : aucun budget ne doit brider les préférences
// (budget infini). Si "friends" est à 0, le critère est de toute façon
// désactivé en amont (voir orderedCriteria). Sinon, le budget est le ratio
// des deux multiplicateurs de poids, calibré pour redonner 7.5 quand les
// deux critères sont à leur valeur par défaut (5).
function friendsLevelBudget(friendsWeight: number, levelWeight: number): number {
  if (levelWeight === 0) return Infinity;
  const friendsMult = weightMultiplier(friendsWeight);
  const levelMult = weightMultiplier(levelWeight);
  if (friendsMult === 0) return 0;
  return (friendsMult / levelMult) * 7.5;
}

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

  // Level: prefer teams close to overall mean — influence scaled by weight
  const overallMean = overallAverageLevel([...players, player]) || player.level;
  const predictedAvg =
    (stats.avg * stats.members.length + player.level) /
    (stats.members.length + 1);
  const levelScore =
    -Math.abs(predictedAvg - overallMean) * weightMultiplier(cfg.weights.level ?? 5);

  // Beginner cap — influence scaled by weight
  let beginnerScore = 0;
  if (isBeginner(player, cfg)) {
    const capacityLeft = cfg.beginnerCap - stats.beginners;
    beginnerScore =
      (capacityLeft > 0 ? capacityLeft : -20) * weightMultiplier(cfg.weights.beginner ?? 5);
  }

  // Relations : les contraintes fortes (doit / ne_doit_pas) restent toujours
  // prioritaires, quel que soit le poids "friends" (ce ne sont pas des
  // préférences mais des règles). Seules les préférences souples
  // (veut / ne_veut_pas) sont modulées par le poids "friends".
  let relationScoreHard = 0;
  let relationScoreSoft = 0;
  constraints
    .filter((c) => c.player1Id === player.id || c.player2Id === player.id)
    .forEach((c) => {
      const otherId = c.player1Id === player.id ? c.player2Id : c.player1Id;
      const other = players.find((p) => p.id === otherId);
      if (!other || other.team !== teamIndex) return;
      const rel = RELATION_TYPES[c.type];
      if (rel.kind === "soft") relationScoreSoft += rel.sign * 10;
      else relationScoreHard += rel.sign * 1000;
    });
  const relationScore =
    relationScoreHard + relationScoreSoft * weightMultiplier(cfg.weights.friends ?? 5);

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

// Sum of soft constraint violations (lower = better). Takes a player-id
// lookup map (not the raw array) because this is called extremely often by
// the cycle search below — O(1) lookups instead of O(n) `.find()` matter a
// lot there.
function softRelationViolations(
  constraints: Constraint[],
  byId: Map<string, Player>,
): number {
  let score = 0;
  constraints.forEach((c) => {
    if (c.type !== "veut" && c.type !== "ne_veut_pas") return;
    const p1 = byId.get(c.player1Id);
    const p2 = byId.get(c.player2Id);
    if (!p1 || !p2 || p1.team === null || p2.team === null) return;
    const same = p1.team === p2.team;
    if (c.type === "veut" && !same) score += 1;
    if (c.type === "ne_veut_pas" && same) score += 1;
  });
  return score;
}

// Recherche un cycle bénéfique de relocations de même genre à travers
// plusieurs équipes : équipe A envoie un joueur à B, B en envoie un à C, ...,
// jusqu'à revenir à A. Généralise un simple échange à deux (qui est le cas
// particulier d'un cycle de longueur 2) à des chaînes de N joueurs / N
// équipes. Un cycle préserve exactement la taille et la répartition H/F de
// chaque équipe impliquée (chacune perd puis reçoit un joueur du même
// genre), donc les règles fixes (genre, taille) ne sont jamais affectées,
// quelle que soit la longueur du cycle.
//
// Détection via Bellman-Ford (cycle de poids négatif) sur un graphe où
// l'arête équipe A → équipe B est pondérée par le meilleur gain (delta de
// violations, mesuré en isolant ce déplacement, les autres joueurs restant
// figés) atteignable en y déplaçant un joueur du genre donné. Les
// déplacements neutres (delta 0, ex. un joueur sans contrainte qui accepte
// de "faire le pont") sont acceptés comme arêtes — nécessaire pour compléter
// un cycle où seuls certains maillons sont directement bénéficiaires — mais
// Bellman-Ford ne déclenche que sur un total strictement négatif, donc un
// cycle entièrement neutre n'est jamais proposé.
//
// C'est une heuristique : la somme de deltas mesurés indépendamment peut
// être optimiste quand deux membres du cycle sont mutuellement liés par une
// contrainte (ex. A veut rejoindre B alors que B "part" vers A dans le même
// cycle — les deux se contentent d'échanger leurs places, sans jamais se
// retrouver ensemble). `excluded` permet à l'appelant d'exclure des
// couples (équipe source → équipe cible : joueur) déjà tentés et invalidés
// par la vérification réelle, pour forcer une combinaison différente au
// prochain appel plutôt que de retomber sur le même cycle non valide.
function findBeneficialCycle(
  working: Player[],
  byId: Map<string, Player>,
  cfg: CompetitionConfig,
  constraints: Constraint[],
  gender: "H" | "F",
  excluded: Set<string>,
): Array<{ from: number; to: number; player: Player }> | null {
  const n = cfg.numTeams;
  const baseline = softRelationViolations(constraints, byId);

  type Edge = { player: Player; delta: number };
  const edge: (Edge | undefined)[][] = Array.from({ length: n }, () =>
    new Array<Edge | undefined>(n).fill(undefined),
  );

  for (let a = 0; a < n; a++) {
    const movable = working.filter(
      (p) => p.team === a && p.gender === gender && canMovePlayer(p, working, constraints),
    );
    if (!movable.length) continue;
    for (let b = 0; b < n; b++) {
      if (b === a) continue;
      let best: Edge | null = null;
      for (const p of movable) {
        if (excluded.has(`${a}->${b}:${p.id}`)) continue;
        const orig: number = p.team!;
        p.team = b;
        const delta = softRelationViolations(constraints, byId) - baseline;
        p.team = orig;
        if (delta <= 0 && (!best || delta < best.delta)) best = { player: p, delta };
      }
      if (best) edge[a][b] = best;
    }
  }

  // Bellman-Ford multi-source (toutes les distances démarrent à 0) pour
  // détecter n'importe quel cycle de poids total négatif, où qu'il soit.
  const dist: number[] = new Array(n).fill(0);
  const predTeam: number[] = new Array(n).fill(-1);
  const predPlayer: (Player | null)[] = new Array(n).fill(null);

  let lastRelaxed = -1;
  for (let iter = 0; iter < n; iter++) {
    lastRelaxed = -1;
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const e = edge[a][b];
        if (!e) continue;
        if (dist[a] + e.delta < dist[b] - 1e-9) {
          dist[b] = dist[a] + e.delta;
          predTeam[b] = a;
          predPlayer[b] = e.player;
          lastRelaxed = b;
        }
      }
    }
  }
  if (lastRelaxed === -1) return null;

  // Recule de n pas pour garantir qu'on atterrit bien dans le cycle (et pas
  // seulement sur un chemin qui y mène) — technique standard d'extraction
  // de cycle négatif après Bellman-Ford.
  let v = lastRelaxed;
  for (let i = 0; i < n; i++) v = predTeam[v];

  const cycle: Array<{ from: number; to: number; player: Player }> = [];
  let cur = v;
  do {
    const from = predTeam[cur];
    cycle.push({ from, to: cur, player: predPlayer[cur]! });
    cur = from;
  } while (cur !== v);

  return cycle.reverse();
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
  const weights = cfg.weights;

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

  // Contraintes fortes : toujours pénalisées au maximum, indépendamment du
  // poids "friends" (ce sont des règles, pas des préférences).
  let relDevHard = 0;
  // Préférences souples : modulées par le poids "friends".
  let relDevSoft = 0;
  constraints.forEach((c) => {
    const p1 = players.find((x) => x.id === c.player1Id);
    const p2 = players.find((x) => x.id === c.player2Id);
    if (!p1 || !p2 || p1.team === null || p2.team === null) return;
    const same = p1.team === p2.team;
    if (c.type === "doit" && !same) relDevHard += 1000;
    if (c.type === "ne_doit_pas" && same) relDevHard += 1000;
    if (c.type === "veut" && !same) relDevSoft += 10;
    if (c.type === "ne_veut_pas" && same) relDevSoft += 10;
  });

  return (
    genderDev * 100 +
    sizeDev * 10 +
    relDevHard +
    relDevSoft * weightMultiplier(weights.friends ?? 5) +
    beginnerDev * weightMultiplier(weights.beginner ?? 5) +
    levelDev * weightMultiplier(weights.level ?? 5)
  );
}

export function generateRebalanceProposals(
  players: Player[],
  cfg: CompetitionConfig,
  constraints: Constraint[],
  // État de départ des phases ci-dessous, s'il diffère de `players` (utilisé
  // par generateReshuffleProposals pour repartir d'une affectation déjà
  // mélangée). Les propositions renvoyées restent toujours le diff par
  // rapport à `players`, jamais par rapport à cet état intermédiaire.
  startingState?: Player[],
): RebalanceProposal[] {
  const working = (startingState ?? players).map((p) => ({ ...p }));
  const proposals: Array<{
    playerId: string;
    from: number;
    to: number;
    reason: string;
  }> = [];

  const st = (t: number) => computeTeamStats(t, cfg, working);

  const push = (playerId: string, from: number, to: number, reason: string) => {
    proposals.push({ playerId, from, to, reason });
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

  // ── Phase 3 : critères configurables, du poids le plus élevé au plus faible ──
  // Uniquement via échanges de même genre → préserve taille et ratio H/F.
  // Un poids à 0 désactive complètement le rééquilibrage pour ce critère.

  const orderedCriteria = CRITERIA_ORDER
    .filter((c) => (cfg.weights[c] ?? 0) > 0)
    .sort((a, b) => (cfg.weights[b] ?? 0) - (cfg.weights[a] ?? 0));

  for (const criterion of orderedCriteria) {

    // ── friends : préférences souples (veut / ne_veut_pas) ──────────────────
    if (criterion === "friends") {
      const budget = friendsLevelBudget(cfg.weights.friends ?? 5, cfg.weights.level ?? 5);
      const byId = new Map(working.map((p) => [p.id, p]));

      // Phase 3a — échanges directs (2 joueurs, 2 équipes), recherche
      // exhaustive avec évaluation exacte (mutation jointe puis mesure
      // réelle, pas d'approximation) jusqu'à convergence.
      let pairIter = 0;
      while (pairIter < 200) {
        pairIter++;
        const beforeViolations = softRelationViolations(constraints, byId);
        if (beforeViolations === 0) break;
        const beforeSpread = levelSpread(working, cfg.numTeams);

        let best: { a: Player; b: Player; violations: number; spreadDelta: number } | null = null;

        for (let i = 0; i < working.length; i++) {
          const a = working[i];
          if (a.team === null || !canMovePlayer(a, working, constraints)) continue;
          for (let j = i + 1; j < working.length; j++) {
            const b = working[j];
            if (b.team === null || b.team === a.team) continue;
            if (b.gender !== a.gender) continue;
            if (!canMovePlayer(b, working, constraints)) continue;

            const t1: number = a.team;
            const t2: number = b.team;
            a.team = t2;
            b.team = t1;
            const violations = softRelationViolations(constraints, byId);
            const spreadDelta = levelSpread(working, cfg.numTeams) - beforeSpread;
            if (
              violations < beforeViolations &&
              spreadDelta <= budget &&
              (!best ||
                violations < best.violations ||
                (violations === best.violations && spreadDelta < best.spreadDelta))
            ) {
              best = { a, b, violations, spreadDelta };
            }
            a.team = t1;
            b.team = t2;
          }
        }

        if (!best) break;
        const t1 = best.a.team!;
        const t2 = best.b.team!;
        best.a.team = t2;
        best.b.team = t1;
        push(best.a.id, t1, t2, "Rééquilibrage des préférences entre joueurs");
        push(best.b.id, t2, t1, "Échange pour préférence entre joueurs");
      }

      // Phase 3b — rotations à N joueurs / N équipes (findBeneficialCycle),
      // pour les préférences qu'aucun échange à deux ne peut satisfaire
      // (ex. A veut rejoindre B, mais B n'a personne qui veuille aller vers
      // A — un détour par une équipe C débloque la situation). Chaque cycle
      // candidat n'est qu'une heuristique : on l'applique puis on mesure
      // l'effet RÉEL avant de le garder ; sinon on l'annule et on exclut
      // les couples équipe→équipe:joueur impliqués pour forcer une
      // combinaison différente au prochain essai.
      for (const gender of ["H", "F"] as const) {
        const excluded = new Set<string>();
        let cycleIter = 0;
        while (cycleIter < 100) {
          cycleIter++;
          const beforeViolations = softRelationViolations(constraints, byId);
          if (beforeViolations === 0) break;

          const cycle = findBeneficialCycle(working, byId, cfg, constraints, gender, excluded);
          if (!cycle) break;

          const originalTeams = cycle.map((m) => m.from);
          const beforeSpread = levelSpread(working, cfg.numTeams);
          cycle.forEach((m) => { m.player.team = m.to; });
          const afterViolations = softRelationViolations(constraints, byId);
          const spreadDelta = levelSpread(working, cfg.numTeams) - beforeSpread;

          if (afterViolations < beforeViolations && spreadDelta <= budget) {
            const label =
              cycle.length > 2
                ? `Rotation de préférences entre ${cycle.length} joueurs`
                : "Rééquilibrage des préférences entre joueurs";
            cycle.forEach((m) => push(m.player.id, m.from, m.to, label));
            continue;
          }

          // Ne tient pas ses promesses une fois vérifié (ou dépasse le
          // budget) : on annule et on exclut cette combinaison précise pour
          // que le prochain essai explore une alternative.
          cycle.forEach((m, i) => { m.player.team = originalTeams[i]; });
          cycle.forEach((m) => excluded.add(`${m.from}->${m.to}:${m.player.id}`));
        }
      }
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
      const tolerance = levelToleranceForWeight(cfg.weights.level ?? 5);
      let levelIter = 0;
      while (levelIter < 50) {
        levelIter++;
        const avgs = Array.from({ length: cfg.numTeams }, (_, t) => st(t).avg);
        const maxT = avgs.indexOf(Math.max(...avgs));
        const minT = avgs.indexOf(Math.min(...avgs));
        if (avgs[maxT] - avgs[minT] < tolerance) break;

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

  // ── Fusion : le diff final est calculé entre `players` (état d'origine) et
  // `working` (état après toutes les phases), pas seulement entre les
  // événements `push()` — un joueur déjà déplacé avant l'appel (ex.
  // `startingState` fourni par generateReshuffleProposals) doit apparaître
  // dans le résultat même si aucune phase ne l'a retouché ensuite.
  const reasonsByPlayer: Record<string, string[]> = {};
  proposals.forEach((p) => {
    (reasonsByPlayer[p.playerId] ??= []).push(p.reason);
  });

  return working
    .filter((p) => {
      const original = players.find((x) => x.id === p.id);
      return (
        original != null &&
        original.team !== null &&
        p.team !== null &&
        original.team !== p.team
      );
    })
    .map((p) => {
      const original = players.find((x) => x.id === p.id)!;
      const reasons = reasonsByPlayer[p.id];
      return {
        playerId: p.id,
        from: original.team as number,
        to: p.team as number,
        reason: reasons
          ? [...new Set(reasons)].join(" · ")
          : "Nouvelle répartition proposée",
      };
    });
}

export function generateReshuffleProposals(
  players: Player[],
  cfg: CompetitionConfig,
  constraints: Constraint[],
): RebalanceProposal[] {
  // Repart de zéro : tous les joueurs non-capitaines sont désassignés, puis
  // replacés un par un dans un ordre aléatoire avec le même algorithme
  // glouton que l'import initial (bestTeamForPlayer, sensible aux poids et
  // aux contraintes). Les capitaines restent ancrés à leur équipe (ils ne
  // sont de toute façon jamais déplaçables, cf. canMovePlayer). Le résultat
  // est ensuite affiné par les mêmes passes de rééquilibrage (taille, genre,
  // critères pondérés) que generateRebalanceProposals.
  const seed = players.map((p) => ({ ...p }));
  seed.forEach((p) => {
    if (!p.isCaptain) p.team = null;
  });

  const order = seed.filter((p) => !p.isCaptain).map((p) => p.id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  for (const id of order) {
    const player = seed.find((p) => p.id === id)!;
    player.team = bestTeamForPlayer(player, cfg, seed, constraints);
  }

  return generateRebalanceProposals(players, cfg, constraints, seed);
}
