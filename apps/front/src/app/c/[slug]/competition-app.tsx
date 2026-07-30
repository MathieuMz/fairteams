'use client'

import { useState, useCallback } from 'react'
import type { CompetitionData, RebalanceProposal } from '@/lib/types'
import { api } from '@/lib/api'
import TabTeams from './TabTeams'
import TabConfig from './TabConfig'
import TabImport from './TabImport'
import TabRoster from './TabRoster'
import TabConstraints from './TabConstraints'
import RebalancePreview from './RebalancePreview'

type Tab = 'teams' | 'config' | 'import' | 'roster' | 'constraints'

const TABS: { id: Tab; label: string }[] = [
  { id: 'teams', label: 'Équipes' },
  { id: 'roster', label: 'Effectifs' },
  { id: 'constraints', label: 'Contraintes' },
  { id: 'config', label: 'Configuration' },
  { id: 'import', label: 'Import CSV' },
]

type Props = {
  slug: string
  initialData: CompetitionData
}

export default function CompetitionApp({ slug, initialData }: Props) {
  const [data, setData] = useState<CompetitionData>(initialData)
  const [activeTab, setActiveTab] = useState<Tab>('teams')
  const [rebalanceProposals, setRebalanceProposals] = useState<RebalanceProposal[] | null>(null)
  const [rebalanceLoading, setRebalanceLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const { competition, players, constraints } = data

  const refresh = useCallback(async () => {
    const fresh = await api.getCompetition(slug)
    setData(fresh)
  }, [slug])

  async function requestRebalance() {
    setRebalanceLoading(true)
    try {
      const proposals = await api.rebalanceProposals(slug)
      setRebalanceProposals(proposals)
      setActiveTab('teams')
    } finally {
      setRebalanceLoading(false)
    }
  }

  async function confirmRebalance(proposals: RebalanceProposal[]) {
    setConfirming(true)
    try {
      await api.applyProposals(slug, proposals)
      setRebalanceProposals(null)
      await refresh()
    } finally {
      setConfirming(false)
    }
  }

  async function handleUpdated() {
    await refresh()
  }

  function handleUpdatedAndSwitchTeams() {
    refresh().then(() => setActiveTab('teams'))
  }

  const surfaceStyle = { background: 'var(--surface)', borderColor: 'var(--border)' }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <a href="/" className="w-8 h-8 rounded-full flex-shrink-0 relative" style={{ background: 'var(--accent)' }}>
            <div className="absolute inset-[7px] rounded-full" style={{ background: 'var(--bg)' }} />
          </a>
          <div>
            <h1 className="text-lg font-semibold leading-tight">{competition.name}</h1>
            <p className="text-xs font-mono" style={{ color: 'var(--text-2)' }}>
              {players.length} joueur{players.length > 1 ? 's' : ''} · {competition.numTeams} équipes · clé: {slug}
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <div className="flex gap-1 p-1 rounded-xl mb-6 flex-wrap" style={{ background: 'var(--surface-2)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setRebalanceProposals(null); setActiveTab(t.id) }}
            className="flex-1 min-w-[90px] rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            style={activeTab === t.id
              ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
              : { background: 'transparent', color: 'var(--text-2)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {rebalanceProposals !== null ? (
        <RebalancePreview
          proposals={rebalanceProposals}
          players={players}
          onConfirm={confirmRebalance}
          onCancel={() => setRebalanceProposals(null)}
          confirming={confirming}
        />
      ) : activeTab === 'teams' ? (
        <TabTeams
          players={players}
          competition={competition}
          onRebalance={requestRebalance}
          onUpdated={handleUpdated}
        />
      ) : activeTab === 'config' ? (
        <TabConfig
          competition={competition}
          onUpdated={handleUpdated}
        />
      ) : activeTab === 'import' ? (
        <TabImport
          slug={slug}
          competition={competition}
          players={players}
          onUpdated={handleUpdatedAndSwitchTeams}
        />
      ) : activeTab === 'roster' ? (
        <TabRoster
          players={players}
          competition={competition}
          onUpdated={handleUpdated}
        />
      ) : (
        <TabConstraints
          slug={slug}
          players={players}
          constraints={constraints}
          onUpdated={handleUpdated}
        />
      )}

      {rebalanceLoading && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="rounded-xl px-6 py-4 text-sm font-medium shadow-lg" style={surfaceStyle}>
            Calcul du rééquilibrage…
          </div>
        </div>
      )}
    </div>
  )
}
