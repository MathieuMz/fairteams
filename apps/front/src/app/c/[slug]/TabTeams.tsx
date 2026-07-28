"use client";

import { useState } from "react";
import type { Player, Competition } from "@/lib/types";
import { computeTeamStats } from "./helpers";
import { api } from "@/lib/api";

type Props = {
  players: Player[];
  competition: Competition;
  onRebalance: () => void;
  onUpdated: () => void;
};

export default function TabTeams({
  players,
  competition,
  onRebalance,
  onUpdated,
}: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggleExpand(t: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  }

  async function assignCaptain(playerId: string, team: number) {
    await api.updatePlayer(playerId, { team });
    onUpdated();
  }

  if (!players.length) {
    return (
      <div className="text-center py-16">
        <h3 className="font-semibold mb-1">Aucun joueur pour l&apos;instant</h3>
        <p className="text-sm mb-4" style={{ color: "var(--text-2)" }}>
          Importez un fichier CSV pour commencer, ou testez avec des données
          fictives.
        </p>
      </div>
    );
  }

  const unassignedCaptains = players.filter(
    (p) => p.isCaptain && p.team === null,
  );
  const c = competition;

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={onRebalance}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: "var(--accent)" }}
        >
          Proposer un rééquilibrage
        </button>
      </div>

      {unassignedCaptains.length > 0 && (
        <div
          className="rounded-xl border p-5 mb-4"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: "var(--text-muted)" }}
          >
            Capitaines à assigner
          </p>
          {unassignedCaptains.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between py-2 gap-3"
            >
              <span className="text-sm">
                {p.firstName} {p.lastName}{" "}
                <span
                  className="text-xs font-mono"
                  style={{ color: "var(--text-2)" }}
                >
                  · niveau {p.level}
                </span>
              </span>
              <select
                onChange={(e) =>
                  e.target.value &&
                  assignCaptain(p.id, parseInt(e.target.value))
                }
                className="rounded-lg border px-2 py-1 text-sm"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--surface)",
                  color: "var(--text)",
                }}
              >
                <option value="">Assigner à…</option>
                {Array.from({ length: c.numTeams }, (_, i) => (
                  <option key={i} value={String(i)}>
                    Équipe {i + 1}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: c.numTeams }, (_, t) => {
          const stats = computeTeamStats(t, c, players);
          const over =
            stats.beginners > c.beginnerCap ||
            stats.men > c.targetMen ||
            stats.women > c.targetWomen;
          const isExpanded = expanded.has(t);

          return (
            <div
              key={t}
              className="rounded-xl border p-4"
              style={{
                background: "var(--surface)",
                borderColor: over ? "var(--danger)" : "var(--border)",
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-base">Équipe {t + 1}</h3>
                <div className="flex items-center gap-2">
                  {stats.captain && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-md font-medium"
                      style={{
                        background: "var(--accent-tint)",
                        color: "var(--accent-dark)",
                      }}
                    >
                      ★ {stats.captain.firstName}
                    </span>
                  )}
                  <span
                    className="text-lg font-semibold px-2 py-0.5 rounded-md"
                    style={{ background: "var(--surface-2)" }}
                  >
                    {stats.avg.toFixed()}
                  </span>
                </div>
              </div>

              <p className="text-xs mb-0.5" style={{ color: "var(--text-2)" }}>
                {stats.members.length} joueurs · {stats.men}H {stats.women}F
              </p>
              <p
                className="text-xs mb-2"
                style={{
                  color:
                    stats.beginners > c.beginnerCap
                      ? "var(--danger)"
                      : "var(--accent-dark)",
                }}
              >
                {stats.beginners} débutant{stats.beginners > 1 ? "s" : ""} /{" "}
                {c.beginnerCap}
              </p>

              {/* Barres H/F */}
              {[
                { label: "Hommes", cur: stats.men, target: c.targetMen },
                { label: "Femmes", cur: stats.women, target: c.targetWomen },
              ].map(({ label, cur, target }) => (
                <div key={label} className="mb-2">
                  <div
                    className="flex justify-between text-xs mb-0.5"
                    style={{ color: "var(--text-2)" }}
                  >
                    <span>{label}</span>
                    <span>
                      {cur} / {target}
                    </span>
                  </div>
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ background: "var(--surface-2)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${target ? Math.min(100, (cur / target) * 100) : 0}%`,
                        background:
                          cur > target ? "var(--warn)" : "var(--accent)",
                      }}
                    />
                  </div>
                </div>
              ))}

              <button
                onClick={() => toggleExpand(t)}
                className="w-full mt-2 rounded-lg border px-3 py-1.5 text-xs"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--surface)",
                  color: "var(--text)",
                }}
              >
                {isExpanded ? "Masquer les joueurs" : "Voir les joueurs"}
              </button>

              {isExpanded && (
                <div
                  className="mt-3 pt-3"
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  {(["H", "F"] as const).map((g) => {
                    const group = stats.members
                      .filter((p) => p.gender === g)
                      .sort((a, b) => b.level - a.level);
                    if (!group.length) return null;
                    return (
                      <div key={g}>
                        <p
                          className="text-xs font-medium mb-1 mt-2"
                          style={{ color: "var(--text-2)" }}
                        >
                          {g === "H" ? "Hommes" : "Femmes"}
                        </p>
                        {group.map((p) => (
                          <div
                            key={p.id}
                            className="flex justify-between text-xs py-0.5"
                          >
                            <span>
                              {p.firstName} {p.lastName}
                              {p.isCaptain ? " ★" : ""}
                            </span>
                            <span
                              className="font-mono"
                              style={{ color: "var(--text-2)" }}
                            >
                              {p.level}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
