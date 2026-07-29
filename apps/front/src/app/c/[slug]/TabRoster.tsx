"use client";

import { useState } from "react";
import type { Player, Competition } from "@/lib/types";
import { api } from "@/lib/api";

type Props = {
  players: Player[];
  competition: Competition;
  onUpdated: () => void;
};

type Patch = { level?: number; isCaptain?: boolean; team?: number | null };

export default function TabRoster({ players, competition, onUpdated }: Props) {
  const [search, setSearch] = useState("");
  const [patches, setPatches] = useState<Record<string, Patch>>({});
  const [saving, setSaving] = useState(false);

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
    } finally {
      setSaving(false);
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
        <div
          className="flex items-center gap-3 p-3 rounded-xl mb-3 text-sm"
          style={{ background: "var(--warn-tint)", color: "var(--warn)" }}
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
      )}
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

          return (
            <div
              key={p.id}
              className="flex items-center gap-3 px-4 py-3 text-sm"
              style={{
                borderBottom:
                  i < filtered.length - 1
                    ? `1px solid var(--border)`
                    : undefined,
              }}
            >
              <span className="flex-1 font-medium">
                {p.firstName} {p.lastName}
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
                  className="w-24 rounded border px-2 py-0.5 text-xs"
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
