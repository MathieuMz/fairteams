import { notFound } from 'next/navigation'
import CompetitionApp from './competition-app'
import type { CompetitionData } from '@/lib/types'

async function fetchCompetition(slug: string): Promise<CompetitionData | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL
  try {
    const res = await fetch(`${apiUrl}/competitions/${slug}`, { cache: 'no-store' })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export default async function CompetitionPage(props: PageProps<'/c/[slug]'>) {
  const { slug } = await props.params
  const data = await fetchCompetition(slug)
  if (!data) notFound()
  return <CompetitionApp slug={slug} initialData={data} />
}
