'use client'

import { useState } from 'react'
import type { Player, RebalanceProposal } from '@/lib/types'

type Props = {
  proposals: RebalanceProposal[]
  players: Player[]
  onConfirm: (proposals: RebalanceProposal[]) => void
  onCancel: () => void
  confirming: boolean
}

export default function RebalancePreview({ proposals, players, onConfirm, onCancel, confirming }: Props) {
  const [local, setLocal] = useState<RebalanceProposal[]>(proposals)

  function updateTo(playerId: string, to: number) {
    setLocal(prev => prev.map(p => p.playerId === playerId ? { ...p, to } : p))
  }

  const cardStyle = { background: 'var(--surface)', borderColor: 'var(--border)' }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border p-5" style={cardStyle}>
        {local.length === 0 ? (
          <p className="text-sm mb-4">Aucun déséquilibre détecté par rapport à la configuration actuelle.</p>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Changements proposés</p>
            <p className="text-xs mb-4" style={{ color: 'var(--text-2)' }}>
              {local.length} joueur{local.length > 1 ? 's' : ''} déplacé{local.length > 1 ? 's' : ''} · destination modifiable avant confirmation
            </p>
            {local.map(p => {
              const player = players.find(x => x.id === p.playerId)
              if (!player) return null
              return (
                <div key={p.playerId} className="flex items-center justify-between py-3 gap-3"
                  style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{player.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-2)' }}>{p.reason}</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-mono" style={{ color: 'var(--text-2)' }}>
                    <span>Équipe {p.from + 1} →</span>
                    <select value={String(p.to)}
                      onChange={e => updateTo(p.playerId, parseInt(e.target.value))}
                      className="rounded-lg border px-2 py-1 text-xs"
                      style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
                      {Array.from({ length: 20 }, (_, i) => i).map(i => (
                        <option key={i} value={String(i)}>Équipe {i + 1}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )
            })}
          </>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm" style={cardStyle}>Annuler</button>
          {local.length > 0 && (
            <button onClick={() => onConfirm(local)} disabled={confirming}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}>
              {confirming ? 'Application…' : 'Confirmer les changements'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
