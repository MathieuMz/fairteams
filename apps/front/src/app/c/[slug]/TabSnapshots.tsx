'use client'

import { useState } from 'react'
import type { Snapshot } from '@/lib/types'
import { api } from '@/lib/api'

type Props = {
  slug: string
  snapshots: Snapshot[]
  onUpdated: () => void
}

export default function TabSnapshots({ slug, snapshots, onUpdated }: Props) {
  const [label, setLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  async function createSnapshot() {
    setCreating(true)
    try {
      await api.createSnapshot(slug, label)
      setLabel('')
      onUpdated()
    } finally {
      setCreating(false)
    }
  }

  async function restore(id: string) {
    setRestoring(id)
    setConfirmId(null)
    try {
      await api.restoreSnapshot(slug, id)
      onUpdated()
    } finally {
      setRestoring(null)
    }
  }

  const inputStyle = { borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }

  return (
    <div className="flex flex-col gap-4">
      {confirmId && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(28,43,34,0.45)' }}>
          <div className="rounded-xl p-6 max-w-sm w-[90%]" style={{ background: 'var(--surface)' }}>
            <h3 className="font-semibold mb-2">Restaurer ce snapshot ?</h3>
            <p className="text-sm mb-5" style={{ color: 'var(--text-2)' }}>
              Tous les changements depuis ce snapshot seront perdus.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmId(null)} className="rounded-lg border px-4 py-2 text-sm" style={inputStyle}>Annuler</button>
              <button onClick={() => restore(confirmId)} disabled={!!restoring}
                className="rounded-lg px-4 py-2 text-sm text-white disabled:opacity-50"
                style={{ background: 'var(--danger)' }}>
                Restaurer quand même
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Snapshots</p>
          <div className="flex gap-2">
            <input type="text" placeholder="Nom du snapshot (optionnel)" value={label}
              onChange={e => setLabel(e.target.value)}
              className="rounded-lg border px-3 py-1.5 text-sm outline-none" style={inputStyle} />
            <button onClick={createSnapshot} disabled={creating}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}>
              {creating ? 'Création…' : 'Créer un snapshot'}
            </button>
          </div>
        </div>

        {snapshots.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Aucun snapshot pour l&apos;instant.</p>
        )}
        {[...snapshots].reverse().map((s, i, arr) => (
          <div key={s.id} className="flex items-center justify-between py-3 gap-3"
            style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : undefined }}>
            <div>
              <p className="text-sm font-medium">{s.label}</p>
              <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                {s.playerCount} joueurs · {new Date(s.createdAt).toLocaleString('fr-FR')}
              </p>
            </div>
            <button onClick={() => setConfirmId(s.id)} disabled={!!restoring}
              className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50" style={inputStyle}>
              {restoring === s.id ? 'Restauration…' : 'Restaurer'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
