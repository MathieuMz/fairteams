"use client";

import { useState } from "react";
import type { Player, Competition, Constraint, Gender } from "@/lib/types";
import { api } from "@/lib/api";
import { RELATION_LABELS, RELATION_KIND } from "./helpers";

type Props = {
  players: Player[];
  competition: Competition;
  constraints: Constraint[];
  onUpdated: () => void;
};

type Patch = { level?: number; isCaptain?: boolean; team?: number | null };

const emptyNewPlayer = { firstName: "", lastName: "", gender: "H" as Gender, level: 50 };

export default function TabRoster({ players, competition, constraints, onUpdated }: Props) {
  const [search, setSearch] = useState("");
  const [patches, setPatches] = useState<Record<string, Patch>>({});
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [newPlayer, setNewPlayer] = useState(emptyNewPlayer);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const dirty = Object.keys(patches).length > 0;

  const filtered = players
    .filter((p) =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "fr"),
    );

  function patch(id: string, update: Patch) {
    setPatches((prev) => ({ ...prev, [id]: { ...prev[id], ...update } }));
  }

  async function applyChanges() {
    setSaving(true);
    try {
      await Promise.all(
        Object.entries(patches).map(([id, p]) => api.updatePlayer(id, p)),
      );
      setPatches({});
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur lors de l'application des modifications");
    } finally {
      setSaving(false);
    }
  }

  async function removePlayer(id: string) {
    setRemovingId(id);
    try {
      await api.deletePlayer(id);
      setPatches((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erreur lors de la suppression du joueur");
    } finally {
      setRemovingId(null);
    }
  }

  async function addPlayer() {
    const firstName = newPlayer.firstName.trim();
    const lastName = newPlayer.lastName.trim();
    if (!firstName || !lastName) {
      setAddError("Prénom et nom sont requis.");
      return;
    }
    if (newPlayer.level < 1 || newPlayer.level > 100) {
      setAddError("Le niveau doit être entre 1 et 100.");
      return;
    }
    setAddError(null);
    setAdding(true);
    try {
      await api.addPlayers(competition.slug, [
        { ...newPlayer, firstName, lastName, isCaptain: false, team: null },
      ]);
      setNewPlayer(emptyNewPlayer);
      onUpdated();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Erreur lors de l'ajout du joueur");
    } finally {
      setAdding(false);
    }
  }

  const inputStyle = {
    borderColor: "var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
  };

  return (
    <div>
      {dirty && (
        <div className="fixed bottom-4 inset-x-0 z-50 flex justify-center px-4">
          <div
            className="flex items-center gap-3 p-3 rounded-xl text-sm shadow-lg border w-full max-w-4xl"
            style={{ background: "var(--warn-tint)", color: "var(--warn)", borderColor: "var(--border)" }}
          >
            <span className="flex-1">
              Des modifications ne sont pas encore appliquées.
            </span>
            <button
              onClick={applyChanges}
              disabled={saving}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {saving ? "Application…" : "Appliquer"}
            </button>
          </div>
        </div>
      )}
      <div
        className="rounded-xl border p-4 mb-3"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <p
          className="text-xs font-semibold uppercase tracking-wider mb-3"
          style={{ color: "var(--text-muted)" }}
        >
          Ajouter un joueur
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Prénom"
            value={newPlayer.firstName}
            onChange={(e) => setNewPlayer((p) => ({ ...p, firstName: e.target.value }))}
            className="rounded-lg border px-3 py-1.5 text-sm outline-none flex-1 min-w-[120px]"
            style={inputStyle}
          />
          <input
            type="text"
            placeholder="Nom"
            value={newPlayer.lastName}
            onChange={(e) => setNewPlayer((p) => ({ ...p, lastName: e.target.value }))}
            className="rounded-lg border px-3 py-1.5 text-sm outline-none flex-1 min-w-[120px]"
            style={inputStyle}
          />
          <input
            type="number"
            min={1}
            max={100}
            placeholder="Niveau"
            value={newPlayer.level}
            onChange={(e) =>
              setNewPlayer((p) => ({ ...p, level: parseInt(e.target.value) || 0 }))
            }
            className="w-20 rounded-lg border px-3 py-1.5 text-sm outline-none"
            style={inputStyle}
          />
          <select
            value={newPlayer.gender}
            onChange={(e) => setNewPlayer((p) => ({ ...p, gender: e.target.value as Gender }))}
            className="rounded-lg border px-2 py-1.5 text-sm"
            style={inputStyle}
          >
            <option value="H">Homme</option>
            <option value="F">Femme</option>
          </select>
          <button
            onClick={addPlayer}
            disabled={adding}
            className="rounded-lg px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {adding ? "Ajout…" : "Ajouter"}
          </button>
        </div>
        {addError && (
          <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>
            {addError}
          </p>
        )}
      </div>
      <input
        type="text"
        placeholder="Rechercher un joueur"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg border px-3 py-2 text-sm mb-3 outline-none"
        style={inputStyle}
      />
      <div
        className="rounded-xl border"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        {filtered.map((p, i) => {
          const cur = patches[p.id] ?? {};
          const level = cur.level ?? p.level;
          const isCaptain = cur.isCaptain ?? p.isCaptain;
          const team = "team" in cur ? cur.team : p.team;

          const ownConstraints = constraints.filter(
            (c) => c.player1Id === p.id || c.player2Id === p.id,
          );
          const isExpanded = expanded.has(p.id);

          return (
            <div
              key={p.id}
              style={{
                borderBottom:
                  i < filtered.length - 1
                    ? `1px solid var(--border)`
                    : undefined,
              }}
            >
              <div className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className="flex-1 font-medium flex items-center gap-2">
                  {p.firstName} {p.lastName}
                  {ownConstraints.length > 0 && (
                    <button
                      onClick={() => toggleExpand(p.id)}
                      className="rounded-lg border px-2 py-0.5 text-xs flex-shrink-0 font-normal"
                      style={inputStyle}
                    >
                      {isExpanded ? "▲" : "▼"} {ownConstraints.length}
                    </button>
                  )}
                </span>
                <span
                  className="flex items-center gap-1 text-xs"
                  style={{ color: "var(--text-2)" }}
                >
                  niv.
                  <input
                    type="number"
                    step={1}
                    min={1}
                    max={100}
                    value={level}
                    className="w-16 rounded border px-2 py-0.5 text-xs"
                    style={inputStyle}
                    onChange={(e) =>
                      patch(p.id, { level: parseInt(e.target.value) || 0 })
                    }
                  />
                </span>
                <label
                  className="flex items-center gap-1.5 text-xs cursor-pointer"
                  style={{ color: "var(--text-2)" }}
                >
                  <input
                    type="checkbox"
                    checked={isCaptain}
                    onChange={(e) => patch(p.id, { isCaptain: e.target.checked })}
                  />
                  capitaine
                </label>
                <select
                  value={team === null || team === undefined ? "" : String(team)}
                  className="rounded-lg border px-2 py-1 text-xs"
                  style={inputStyle}
                  onChange={(e) =>
                    patch(p.id, {
                      team:
                        e.target.value === "" ? null : parseInt(e.target.value),
                    })
                  }
                >
                  <option value="">Non assigné</option>
                  {Array.from({ length: competition.numTeams }, (_, i) => (
                    <option key={i} value={String(i)}>
                      Équipe {i + 1}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => removePlayer(p.id)}
                  disabled={removingId === p.id}
                  className="rounded-lg border px-2 py-1 text-xs flex-shrink-0 disabled:opacity-50"
                  style={{ borderColor: "var(--border)", color: "var(--danger)" }}
                  title="Retirer ce joueur"
                >
                  {removingId === p.id ? "…" : "Retirer"}
                </button>
              </div>

              {isExpanded && ownConstraints.length > 0 && (
                <div
                  className="px-4 pb-3 -mt-1"
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  {ownConstraints.map((c) => {
                    const isSource = c.player1Id === p.id;
                    const otherId = isSource ? c.player2Id : c.player1Id;
                    const other = players.find((x) => x.id === otherId);
                    if (!other) return null;

                    const bothAssigned = p.team !== null && other.team !== null;
                    const sameTeam = bothAssigned && p.team === other.team;
                    const wantSame = c.type === "doit" || c.type === "veut";
                    const satisfied = !bothAssigned ? null : wantSame ? sameTeam : !sameTeam;
                    const kind = RELATION_KIND[c.type];
                    const otherName = `${other.firstName} ${other.lastName}`;

                    return (
                      <div
                        key={c.id}
                        className="flex items-center gap-2 py-1.5 text-xs"
                      >
                        {satisfied === null ? (
                          <span style={{ color: "var(--text-muted)" }} title="Joueur non assigné">•</span>
                        ) : satisfied ? (
                          <span title="Respectée" style={{ color: "var(--accent)" }}>✓</span>
                        ) : (
                          <span title="Non respectée" style={{ color: "var(--danger)" }}>✗</span>
                        )}
                        {isSource ? (
                          <>
                            <span
                              className="px-1.5 py-0.5 rounded font-medium"
                              style={
                                kind === "hard"
                                  ? { background: "var(--accent-tint)", color: "var(--accent-dark)" }
                                  : { background: "var(--warn-tint)", color: "var(--warn)" }
                              }
                            >
                              {RELATION_LABELS[c.type]}
                            </span>
                            <span>{otherName}</span>
                          </>
                        ) : (
                          <>
                            <span>{otherName}</span>
                            <span
                              className="px-1.5 py-0.5 rounded font-medium"
                              style={
                                kind === "hard"
                                  ? { background: "var(--accent-tint)", color: "var(--accent-dark)" }
                                  : { background: "var(--warn-tint)", color: "var(--warn)" }
                              }
                            >
                              {RELATION_LABELS[c.type]}
                            </span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p
            className="text-sm text-center py-8"
            style={{ color: "var(--text-2)" }}
          >
            Aucun joueur trouvé
          </p>
        )}
      </div>
    </div>
  );
}
