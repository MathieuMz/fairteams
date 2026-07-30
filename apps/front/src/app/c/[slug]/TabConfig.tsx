'use client'

import { useState } from 'react'
import type { Competition, CompetitionConfig, Criterion } from '@/lib/types'
import { CRITERIA_LABELS } from './helpers'
import { api } from '@/lib/api'

const CRITERIA_DISPLAY_ORDER: Criterion[] = ['friends', 'beginner', 'level']

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
    weights: { ...competition.weights },
  })
  const [saving, setSaving] = useState(false)

  function n(val: string, fallback = 0) { return parseInt(val) || fallback }

  function updateWeight(crit: Criterion, value: number) {
    setCfg(c => ({ ...c, weights: { ...c.weights, [crit]: value } }))
  }

  async function save() {
    setSaving(true)
    try {
      await api.updateConfig(competition.slug, cfg)
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
        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Poids des critères</p>
        <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
          0 = ignoré, 10 = priorité maximale. Un poids plus élevé rapproche davantage ce critère de son objectif, au besoin au détriment des autres.
        </p>
        {CRITERIA_DISPLAY_ORDER.map((crit) => (
          <div key={crit} className="flex items-center gap-3 p-3 rounded-lg border mb-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <span className="flex-1 text-sm">{CRITERIA_LABELS[crit]}</span>
            <input type="range" min={0} max={10} step={1} value={cfg.weights[crit] ?? 0}
              onChange={e => updateWeight(crit, n(e.target.value))}
              className="w-32" />
            <span className="text-xs font-mono w-4 text-right" style={{ color: 'var(--text-muted)' }}>{cfg.weights[crit] ?? 0}</span>
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
