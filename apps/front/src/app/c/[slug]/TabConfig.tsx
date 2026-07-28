'use client'

import { useState } from 'react'
import type { Competition, CompetitionConfig, Criterion, LevelLabel } from '@/lib/types'
import { CRITERIA_LABELS } from './helpers'
import { api } from '@/lib/api'

type Props = {
  competition: Competition
  onUpdated: () => void
}

export default function TabConfig({ competition, onUpdated }: Props) {
  const [cfg, setCfg] = useState<CompetitionConfig>({
    numTeams: competition.numTeams,
    targetMen: competition.targetMen,
    targetWomen: competition.targetWomen,
    beginnerThreshold: competition.beginnerThreshold,
    beginnerCap: competition.beginnerCap,
    levelLabels: competition.levelLabels.map(l => ({ ...l })),
    priority: [...competition.priority],
  })
  const [saving, setSaving] = useState(false)
  const [labelError, setLabelError] = useState<string | null>(null)

  function n(val: string, fallback = 0) { return parseInt(val) || fallback }

  function movePriority(idx: number, dir: -1 | 1) {
    const j = idx + dir
    if (j < 0 || j >= cfg.priority.length) return
    const arr = [...cfg.priority]
    ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
    setCfg(c => ({ ...c, priority: arr }))
  }

  function addLabel() {
    setCfg(c => ({ ...c, levelLabels: [...c.levelLabels, { label: '', level: 50 }] }))
  }

  function updateLabel(idx: number, patch: Partial<LevelLabel>) {
    setCfg(c => ({
      ...c,
      levelLabels: c.levelLabels.map((l, i) => i === idx ? { ...l, ...patch } : l),
    }))
  }

  function removeLabel(idx: number) {
    setCfg(c => ({ ...c, levelLabels: c.levelLabels.filter((_, i) => i !== idx) }))
  }

  function validate(): string | null {
    const labels = cfg.levelLabels.map(l => l.label.trim())
    if (labels.some(l => !l)) return 'Chaque correspondance doit avoir une étiquette non vide.'
    const seen = new Set<string>()
    for (const l of labels) {
      if (seen.has(l)) return `L'étiquette « ${l} » est définie plusieurs fois.`
      seen.add(l)
    }
    if (cfg.levelLabels.some(l => l.level < 1 || l.level > 100)) return 'Les niveaux doivent être entre 1 et 100.'
    return null
  }

  async function save() {
    const err = validate()
    if (err) { setLabelError(err); return }
    setLabelError(null)
    setSaving(true)
    try {
      await api.updateConfig(competition.slug, {
        ...cfg,
        levelLabels: cfg.levelLabels.map(l => ({ ...l, label: l.label.trim() })),
      })
      onUpdated()
    } finally {
      setSaving(false)
    }
  }

  const row = 'flex items-center justify-between py-3 border-b gap-3'
  const input = 'rounded-lg border px-3 py-1.5 text-sm w-16 outline-none'
  const style = { borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border p-5" style={style}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Structure</p>
        <div className={row} style={{ borderColor: 'var(--border)' }}>
          <label className="text-sm">Nombre d&apos;équipes</label>
          <input type="number" className={input} style={style} value={cfg.numTeams} min={2} max={20}
            onChange={e => setCfg(c => ({ ...c, numTeams: n(e.target.value, 2) }))} />
        </div>
        <div className={row} style={{ borderColor: 'var(--border)' }}>
          <label className="text-sm">Composition cible par équipe</label>
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1">
              ♂ <input type="number" className={input} style={style} value={cfg.targetMen} min={0}
                onChange={e => setCfg(c => ({ ...c, targetMen: n(e.target.value) }))} /> hommes
            </span>
            <span className="flex items-center gap-1">
              ♀ <input type="number" className={input} style={style} value={cfg.targetWomen} min={0}
                onChange={e => setCfg(c => ({ ...c, targetWomen: n(e.target.value) }))} /> femmes
            </span>
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>= {cfg.targetMen + cfg.targetWomen} / équipe</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border p-5" style={style}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Niveau</p>
        <div className={row} style={{ borderColor: 'var(--border)' }}>
          <label className="text-sm">
            Seuil débutant <span className="text-xs" style={{ color: 'var(--text-muted)' }}>(niveau ≤ X / 100)</span>
          </label>
          <input type="number" className={input} style={style} value={cfg.beginnerThreshold} min={1} max={100}
            onChange={e => setCfg(c => ({ ...c, beginnerThreshold: n(e.target.value, 1) }))} />
        </div>
        <div className="flex items-center justify-between py-3 gap-3">
          <label className="text-sm">
            Plafond débutants / équipe <span className="text-xs" style={{ color: 'var(--text-muted)' }}>(niveau ≤ {cfg.beginnerThreshold})</span>
          </label>
          <input type="number" className={input} style={style} value={cfg.beginnerCap} min={0}
            onChange={e => setCfg(c => ({ ...c, beginnerCap: n(e.target.value) }))} />
        </div>
      </div>

      <div className="rounded-xl border p-5" style={style}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Correspondances CSV → niveau (1–100)</p>
        <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
          Associe chaque étiquette attendue dans la colonne <code className="font-mono text-xs">level</code> du CSV à un niveau numérique.
        </p>
        {cfg.levelLabels.length === 0 && (
          <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>Aucune correspondance définie. L&apos;import CSV sera bloqué tant que la liste est vide.</p>
        )}
        {cfg.levelLabels.map((l, idx) => (
          <div key={idx} className="flex items-center gap-2 mb-2">
            <input
              type="text"
              placeholder="Étiquette CSV (ex : A)"
              value={l.label}
              onChange={e => updateLabel(idx, { label: e.target.value })}
              className="rounded-lg border px-3 py-1.5 text-sm flex-1 outline-none"
              style={style}
            />
            <span className="text-sm" style={{ color: 'var(--text-2)' }}>→</span>
            <input
              type="number"
              min={1}
              max={100}
              value={l.level}
              onChange={e => updateLabel(idx, { level: n(e.target.value, 1) })}
              className="rounded-lg border px-3 py-1.5 text-sm w-20 outline-none font-mono"
              style={style}
            />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>/100</span>
            <button onClick={() => removeLabel(idx)}
              className="w-7 h-7 rounded border text-sm flex items-center justify-center"
              style={{ borderColor: 'var(--border)', color: 'var(--danger)' }}>×</button>
          </div>
        ))}
        <button onClick={addLabel}
          className="mt-1 rounded-lg border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--accent-dark)' }}>
          + Ajouter une correspondance
        </button>
        {labelError && (
          <p className="mt-2 text-sm" style={{ color: 'var(--danger)' }}>{labelError}</p>
        )}
      </div>

      <div className="rounded-xl border p-5" style={style}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Priorité des critères</p>
        {cfg.priority.map((crit, idx) => (
          <div key={crit} className="flex items-center gap-3 p-3 rounded-lg border mb-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <span className="text-xs font-mono w-4" style={{ color: 'var(--text-muted)' }}>{idx + 1}</span>
            <span className="flex-1 text-sm">{CRITERIA_LABELS[crit]}</span>
            <button onClick={() => movePriority(idx, -1)} disabled={idx === 0}
              className="w-7 h-7 rounded border text-sm disabled:opacity-30" style={{ borderColor: 'var(--border)' }}>↑</button>
            <button onClick={() => movePriority(idx, 1)} disabled={idx === cfg.priority.length - 1}
              className="w-7 h-7 rounded border text-sm disabled:opacity-30" style={{ borderColor: 'var(--border)' }}>↓</button>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
          className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: 'var(--accent)' }}>
          {saving ? 'Enregistrement…' : 'Enregistrer la configuration'}
        </button>
      </div>
    </div>
  )
}
