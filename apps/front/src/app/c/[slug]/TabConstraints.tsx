'use client'

import { useState } from 'react'
import type { Player, Constraint, ConstraintType } from '@/lib/types'
import { RELATION_LABELS, RELATION_KIND } from './helpers'
import { api } from '@/lib/api'

type Props = {
  slug: string
  players: Player[]
  constraints: Constraint[]
  onUpdated: () => void
}

export default function TabConstraints({ slug, players, constraints, onUpdated }: Props) {
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [type, setType] = useState<ConstraintType>('doit')
  const [adding, setAdding] = useState(false)

  async function add() {
    if (!p1 || !p2 || p1 === p2) return
    setAdding(true)
    try {
      await api.addConstraint(slug, { player1Id: p1, player2Id: p2, type })
      setP1(''); setP2('')
      onUpdated()
    } finally {
      setAdding(false)
    }
  }

  async function remove(id: string) {
    await api.deleteConstraint(id)
    onUpdated()
  }

  if (players.length < 2) {
    return (
      <div className="text-center py-16" style={{ color: 'var(--text-2)' }}>
        <h3 className="font-semibold mb-1" style={{ color: 'var(--text)' }}>Pas encore assez de joueurs</h3>
        <p className="text-sm">Importez au moins deux joueurs pour créer des contraintes.</p>
      </div>
    )
  }

  const selectStyle = { borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }
  const options = players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>Ajouter une contrainte</p>
        <div className="flex flex-wrap items-center gap-2">
          <select value={p1} onChange={e => setP1(e.target.value)} className="rounded-lg border px-2 py-2 text-sm" style={selectStyle}>
            <option value="">Joueur 1</option>{options}
          </select>
          <select value={type} onChange={e => setType(e.target.value as ConstraintType)} className="rounded-lg border px-2 py-2 text-sm" style={selectStyle}>
            {(Object.entries(RELATION_LABELS) as [ConstraintType, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select value={p2} onChange={e => setP2(e.target.value)} className="rounded-lg border px-2 py-2 text-sm" style={selectStyle}>
            <option value="">Joueur 2</option>{options}
          </select>
          <button onClick={add} disabled={!p1 || !p2 || p1 === p2 || adding}
            className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--accent)' }}>
            Ajouter
          </button>
        </div>
      </div>

      <div className="rounded-xl border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Contraintes existantes</p>
        {constraints.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Aucune contrainte définie.</p>
        )}
        {constraints.map((c, i) => {
          const q1 = players.find(p => p.id === c.player1Id)
          const q2 = players.find(p => p.id === c.player2Id)
          if (!q1 || !q2) return null
          const kind = RELATION_KIND[c.type]
          const sign = c.type.startsWith('ne') ? -1 : 1
          const badgeStyle = kind === 'hard'
            ? (sign > 0 ? { background: 'var(--accent-tint)', color: 'var(--accent-dark)' } : { background: 'var(--danger-tint)', color: 'var(--danger)' })
            : { background: 'var(--warn-tint)', color: 'var(--warn)' }
          return (
            <div key={c.id} className="flex items-center justify-between py-3 gap-3"
              style={{ borderBottom: i < constraints.length - 1 ? '1px solid var(--border)' : undefined }}>
              <span className="text-sm">
                {q1.name}{' '}
                <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-md" style={badgeStyle}>{RELATION_LABELS[c.type]}</span>
                {' '}{q2.name}
              </span>
              <button onClick={() => remove(c.id)}
                className="rounded-lg border px-3 py-1 text-xs" style={selectStyle}>
                Retirer
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
