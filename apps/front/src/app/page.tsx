'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

export default function HomePage() {
  const router = useRouter()
  const [createName, setCreateName] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')

  const [joinSlug, setJoinSlug] = useState('')
  const [joinLoading, setJoinLoading] = useState(false)
  const [joinError, setJoinError] = useState('')

  async function handleCreate(e: { preventDefault(): void }) {
    e.preventDefault()
    if (!createName.trim()) return
    setCreateLoading(true)
    setCreateError('')
    try {
      const comp = await api.createCompetition(createName.trim())
      router.push(`/c/${comp.slug}`)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Erreur')
      setCreateLoading(false)
    }
  }

  async function handleJoin(e: { preventDefault(): void }) {
    e.preventDefault()
    const slug = joinSlug.trim().toLowerCase()
    if (!slug) return
    setJoinLoading(true)
    setJoinError('')
    try {
      await api.getCompetition(slug)
      router.push(`/c/${slug}`)
    } catch {
      setJoinError('Compétition introuvable. Vérifiez la clé.')
      setJoinLoading(false)
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-8 h-8 rounded-full flex-shrink-0 relative" style={{ background: 'var(--accent)' }}>
            <div className="absolute inset-[7px] rounded-full" style={{ background: 'var(--bg)' }} />
          </div>
          <div>
            <h1 className="text-xl font-semibold" style={{ fontFamily: 'var(--font-geist-sans)' }}>FairTeams</h1>
            <p className="text-sm" style={{ color: 'var(--text-2)' }}>Équilibrage d&apos;équipes multicritère</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Créer */}
          <div className="rounded-xl border p-6" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <h2 className="text-base font-semibold mb-1">Nouvelle compétition</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>Créez une session, obtenez une clé à partager.</p>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="Nom de la compétition"
                value={createName}
                onChange={e => setCreateName(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)', '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
              />
              {createError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{createError}</p>}
              <button
                type="submit"
                disabled={createLoading || !createName.trim()}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-colors"
                style={{ background: 'var(--accent)' }}
              >
                {createLoading ? 'Création…' : 'Créer'}
              </button>
            </form>
          </div>

          {/* Rejoindre */}
          <div className="rounded-xl border p-6" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
            <h2 className="text-base font-semibold mb-1">Rejoindre par clé</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>Entrez la clé courte de la compétition.</p>
            <form onSubmit={handleJoin} className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="ex. f4k2r9"
                value={joinSlug}
                onChange={e => setJoinSlug(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm font-mono outline-none focus:ring-2"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)', '--tw-ring-color': 'var(--accent)' } as React.CSSProperties}
              />
              {joinError && <p className="text-xs" style={{ color: 'var(--danger)' }}>{joinError}</p>}
              <button
                type="submit"
                disabled={joinLoading || !joinSlug.trim()}
                className="rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors"
                style={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
              >
                {joinLoading ? 'Recherche…' : 'Rejoindre'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  )
}
