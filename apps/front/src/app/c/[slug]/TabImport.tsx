'use client'

import { useRef, useState } from 'react'
import Papa from 'papaparse'
import type { Competition, Player } from '@/lib/types'
import { api } from '@/lib/api'
import { buildDemoPlayers } from './helpers'

type Props = {
  slug: string
  competition: Competition
  players: Player[]
  onUpdated: () => void
}

type PendingRow = {
  firstName: string
  lastName: string
  gender: 'H' | 'F'
  rawLabel: string
  level: number | null  // null = étiquette inconnue
}

export default function TabImport({ slug, competition, players, onUpdated }: Props) {
  const [pending, setPending] = useState<PendingRow[]>([])
  const [knownCount, setKnownCount] = useState(0)
  const [totalRead, setTotalRead] = useState(0)
  const [importing, setImporting] = useState(false)
  const [addingDemo, setAddingDemo] = useState(false)
  const [loadingFullDemo, setLoadingFullDemo] = useState(false)
  const [confirmFullDemo, setConfirmFullDemo] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const mappable = pending.filter(r => r.level !== null)
  const unmappable = pending.filter(r => r.level === null)

  function parseCSV(text: string) {
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
    const existingIds = new Set(players.map(p => p.id))
    const rows = parsed.data.map(r => {
      const key = Object.fromEntries(Object.keys(r).map(k => [k.trim().toLowerCase(), r[k]]))
      const firstName = (key.first_name || key.firstname || '').trim()
      const lastName = (key.last_name || key.lastname || '').trim()
      const fallbackName = (key.name || '').trim()
      const resolvedFirst = firstName || (fallbackName ? fallbackName.split(' ')[0] : '')
      const resolvedLast = lastName || (fallbackName ? fallbackName.split(' ').slice(1).join(' ') : '')
      const rawLabel = (key.level || '').trim()
      const mapped = competition.levelLabels.find(l => l.label === rawLabel)
      return {
        id: (key.id || '').trim(),
        firstName: resolvedFirst,
        lastName: resolvedLast,
        gender: ((key.gender || '').trim().toUpperCase().startsWith('F') ? 'F' : 'H') as 'H' | 'F',
        rawLabel,
        level: mapped ? mapped.level : null,
      }
    }).filter(r => r.firstName)
    const newRows = rows.filter(r => !r.id || !existingIds.has(r.id))
    setTotalRead(rows.length)
    setKnownCount(rows.length - newRows.length)
    setPending(newRows.map(r => ({ firstName: r.firstName, lastName: r.lastName, gender: r.gender, rawLabel: r.rawLabel, level: r.level })))
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // Essai UTF-8, puis relecture en Latin-1 si des caractères de remplacement (U+FFFD) sont détectés
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target!.result as string
      if (text.includes('�')) {
        const reader2 = new FileReader()
        reader2.onload = (ev2) => parseCSV(ev2.target!.result as string)
        reader2.readAsText(file, 'ISO-8859-1')
      } else {
        parseCSV(text)
      }
    }
    reader.readAsText(file)
  }

  async function confirmImport() {
    if (!mappable.length) return
    setImporting(true)
    try {
      await api.addPlayers(slug, mappable.map(r => ({
        firstName: r.firstName,
        lastName: r.lastName,
        gender: r.gender,
        level: r.level!,
        isCaptain: false,
        team: null,
      })))
      setPending([])
      setTotalRead(0)
      setKnownCount(0)
      if (fileRef.current) fileRef.current.value = ''
      onUpdated()
    } finally {
      setImporting(false)
    }
  }

  async function addDemoPlayers() {
    setAddingDemo(true)
    try {
      const demo = buildDemoPlayers(players.length, 5)
      await api.addPlayers(slug, demo)
      onUpdated()
    } finally {
      setAddingDemo(false)
    }
  }

  async function loadFullDemo() {
    if (players.length > 0 && !confirmFullDemo) { setConfirmFullDemo(true); return }
    setLoadingFullDemo(true)
    setConfirmFullDemo(false)
    try {
      const demo = buildDemoPlayers(players.length, 68)
      const created = await api.addPlayers(slug, demo)
      const byTeam: Record<number, typeof created[0]> = {}
      created.forEach(p => {
        if (p.team === null) return
        if (!byTeam[p.team] || p.level > byTeam[p.team].level) byTeam[p.team] = p
      })
      await Promise.all(Object.values(byTeam).map(p => api.updatePlayer(p.id, { isCaptain: true })))
      onUpdated()
    } finally {
      setLoadingFullDemo(false)
    }
  }

  async function resetData() {
    await api.resetData(slug)
    setConfirmReset(false)
    onUpdated()
  }

  const cardStyle = { background: 'var(--surface)', borderColor: 'var(--border)' }
  const inputStyle = { borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }
  const noMapping = competition.levelLabels.length === 0

  return (
    <div className="flex flex-col gap-4">
      {/* Confirm modals */}
      {confirmFullDemo && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(28,43,34,0.45)' }}>
          <div className="rounded-xl p-6 max-w-sm w-[90%]" style={{ background: 'var(--surface)' }}>
            <h3 className="font-semibold mb-2">Ajouter des joueurs fictifs ?</h3>
            <p className="text-sm mb-5" style={{ color: 'var(--text-2)' }}>68 joueurs de démonstration seront ajoutés aux {players.length} joueurs déjà présents.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmFullDemo(false)} className="rounded-lg border px-4 py-2 text-sm" style={inputStyle}>Annuler</button>
              <button onClick={loadFullDemo} className="rounded-lg px-4 py-2 text-sm text-white" style={{ background: 'var(--accent)' }}>Ajouter quand même</button>
            </div>
          </div>
        </div>
      )}
      {confirmReset && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(28,43,34,0.45)' }}>
          <div className="rounded-xl p-6 max-w-sm w-[90%]" style={{ background: 'var(--surface)' }}>
            <h3 className="font-semibold mb-2">Réinitialiser toutes les données ?</h3>
            <p className="text-sm mb-5" style={{ color: 'var(--text-2)' }}>Tous les joueurs ({players.length}), contraintes et snapshots seront effacés définitivement. La configuration est conservée.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmReset(false)} className="rounded-lg border px-4 py-2 text-sm" style={inputStyle}>Annuler</button>
              <button onClick={resetData} className="rounded-lg px-4 py-2 text-sm text-white" style={{ background: 'var(--danger)' }}>Réinitialiser quand même</button>
            </div>
          </div>
        </div>
      )}

      {/* CSV import */}
      <div className="rounded-xl border p-5" style={cardStyle}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Importer un fichier CSV</p>
        <p className="text-sm mb-1" style={{ color: 'var(--text-2)' }}>
          Colonnes attendues : <code className="font-mono text-xs">id, first_name, last_name, gender (H/F), level</code>
        </p>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          La colonne <code className="font-mono">level</code> doit contenir des étiquettes configurées dans l&apos;onglet Configuration
          ({competition.levelLabels.length > 0
            ? competition.levelLabels.map(l => `${l.label}→${l.level}`).join(', ')
            : 'aucune correspondance définie'}).
        </p>

        {noMapping && (
          <div className="rounded-lg p-3 mb-3 text-sm" style={{ background: 'var(--warn-tint)', color: 'var(--warn)' }}>
            Aucune correspondance de niveau n&apos;est configurée. Allez dans l&apos;onglet <strong>Configuration</strong> pour en ajouter avant d&apos;importer.
          </div>
        )}

        <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="text-sm" disabled={noMapping} />

        {totalRead > 0 && (
          <div className="mt-4">
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div className="rounded-lg border p-3 text-center" style={cardStyle}>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Lignes lues</p>
                <p className="text-xl font-semibold">{totalRead}</p>
              </div>
              <div className="rounded-lg border p-3 text-center" style={{ background: 'var(--accent-tint)', borderColor: 'var(--border)' }}>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Déjà connues</p>
                <p className="text-xl font-semibold">{knownCount}</p>
              </div>
              <div className="rounded-lg border p-3 text-center" style={{ background: 'var(--warn-tint)', borderColor: 'var(--border)' }}>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>À importer</p>
                <p className="text-xl font-semibold">{mappable.length}</p>
              </div>
              <div className="rounded-lg border p-3 text-center" style={{ background: 'var(--danger-tint)', borderColor: 'var(--border)' }}>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Ignorées</p>
                <p className="text-xl font-semibold">{unmappable.length}</p>
              </div>
            </div>

            {unmappable.length > 0 && (
              <div className="rounded-lg p-3 mb-3 text-sm" style={{ background: 'var(--danger-tint)', color: 'var(--danger)' }}>
                {unmappable.length} ligne{unmappable.length > 1 ? 's' : ''} ignorée{unmappable.length > 1 ? 's' : ''} — étiquette inconnue :{' '}
                {[...new Set(unmappable.map(r => `« ${r.rawLabel} »`))].join(', ')}.
                Ajoutez ces correspondances dans la Configuration.
              </div>
            )}

            {mappable.length > 0 && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th className="text-left p-2">Nom</th>
                        <th className="text-left p-2">Sexe</th>
                        <th className="text-left p-2">Étiquette CSV</th>
                        <th className="text-left p-2">Niveau (1–100)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappable.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td className="p-2">{r.firstName} {r.lastName}</td>
                          <td className="p-2">{r.gender}</td>
                          <td className="p-2 font-mono">{r.rawLabel}</td>
                          <td className="p-2 font-mono">{r.level}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end mt-3">
                  <button onClick={confirmImport} disabled={importing}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    style={{ background: 'var(--accent)' }}>
                    {importing ? 'Ajout…' : `Ajouter et placer les ${mappable.length} joueurs`}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Ajouter 5 demo */}
      <div className="rounded-xl border p-5" style={cardStyle}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Ajouter des joueurs</p>
        <p className="text-sm mb-3" style={{ color: 'var(--text-2)' }}>Ajoute 5 joueurs fictifs — utile pour simuler des inscriptions tardives.</p>
        <button onClick={addDemoPlayers} disabled={addingDemo}
          className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50" style={inputStyle}>
          {addingDemo ? 'Ajout…' : 'Ajouter 5 joueurs de démo'}
        </button>
      </div>

      {/* Charger 68 demo */}
      <div className="rounded-xl border p-5" style={cardStyle}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Données fictives</p>
        <p className="text-sm mb-3" style={{ color: 'var(--text-2)' }}>Génère ~68 joueurs fictifs avec un capitaine par équipe, déjà placés par l&apos;algorithme.</p>
        <button onClick={loadFullDemo} disabled={loadingFullDemo}
          className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50" style={inputStyle}>
          {loadingFullDemo ? 'Chargement…' : 'Charger des données de démonstration'}
        </button>
      </div>

      {/* Reset */}
      <div className="rounded-xl border p-5" style={{ background: 'var(--surface)', borderColor: 'var(--danger)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--danger)' }}>Zone de réinitialisation</p>
        <p className="text-sm mb-3" style={{ color: 'var(--text-2)' }}>Efface tous les joueurs, contraintes et snapshots. La configuration est conservée.</p>
        <button onClick={() => setConfirmReset(true)}
          className="rounded-lg px-4 py-2 text-sm text-white" style={{ background: 'var(--danger)' }}>
          Réinitialiser toutes les données
        </button>
      </div>
    </div>
  )
}
