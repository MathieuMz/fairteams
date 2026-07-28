'use client'

import { useState } from 'react'
import type { Competition, CompetitionConfig, Criterion } from '@/lib/types'
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
    levelMin: competition.levelMin,
    levelMax: competition.levelMax,
    beginnerCap: competition.beginnerCap,
    priority: [...competition.priority],
  })
  const [saving, setSaving] = useState(false)

  function n(val: string, fallback = 0) { return parseInt(val) || fallback }

  function movePriority(idx: number, dir: -1 | 1) {
    const j = idx + dir
    if (j < 0 || j >= cfg.priority.length) return
    const arr = [...cfg.priority]
    ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
    setCfg(c => ({ ...c, priority: arr }))
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
          <label className="text-sm">Échelle de niveau</label>
          <div className="flex items-center gap-2 text-sm">
            <input type="number" className={input} style={style} value={cfg.levelMin}
              onChange={e => setCfg(c => ({ ...c, levelMin: n(e.target.value, 1) }))} /> à
            <input type="number" className={input} style={style} value={cfg.levelMax}
              onChange={e => setCfg(c => ({ ...c, levelMax: n(e.target.value, 10) }))} />
          </div>
        </div>
        <div className="flex items-center justify-between py-3 gap-3">
          <label className="text-sm">
            Plafond débutants / équipe <span className="text-xs" style={{ color: 'var(--text-muted)' }}>(niveau {cfg.levelMin})</span>
          </label>
          <input type="number" className={input} style={style} value={cfg.beginnerCap} min={0}
            onChange={e => setCfg(c => ({ ...c, beginnerCap: n(e.target.value) }))} />
        </div>
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
