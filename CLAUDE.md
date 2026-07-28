# FairTeams — context for Claude

## What this is

Multicriteria team-balancing app, ported from `fairteams.html` (vanilla HTML/JS prototype) into a production monorepo. All source files are complete and both apps pass `tsc --noEmit`.

## Stack

- **Monorepo:** pnpm workspaces (`pnpm-workspace.yaml`), `apps/api` + `apps/front`
- **API:** Fastify 5 + TypeScript (CommonJS), `ts-node-dev` in dev, compiled to `dist/`
- **DB:** Supabase via `@supabase/supabase-js` service-role client (env: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`)
- **Frontend:** Next.js 16.2.1 App Router + React 19 + Tailwind 4
- **Deploy:** Render (`render.yaml`) — both services `runtime: node`

## Running locally

```bash
# 1. Apply schema to Supabase (once):
#    Run schema.sql in the Supabase SQL editor, or if tables already exist:
#    ALTER TABLE competitions ADD COLUMN IF NOT EXISTS slug text NOT NULL UNIQUE;

# 2. Set env vars in apps/api/.env:
#    SUPABASE_URL=...
#    SUPABASE_SERVICE_KEY=...
#    FRONTEND_URL=http://localhost:3000   (for CORS)

# 3. Install + run:
pnpm install
npm run dev   # api on :3001, front on :3000
```

## Key architecture decisions

- **Algorithm lives in the API only** — `apps/api/src/domain/balancing.ts`. Not duplicated to frontend.
- **`GET /competitions/:slug`** returns `{competition, players, constraints, snapshots}` in one call — frontend never cascades.
- **Types are duplicated** between `apps/api/src/domain/types.ts` and `apps/front/src/lib/types.ts` intentionally (no shared package).
- **No auth** — usage is solo/trusted. Supabase RLS is permissive.
- **Snapshot restore** deletes all data first (same as HTML prototype), so no snapshots remain after restore.
- **Color system:** CSS custom properties — `--bg`, `--surface`, `--surface-2`, `--border`, `--text`, `--text-2`, `--text-muted`, `--accent`, `--accent-dark`, `--accent-tint`, `--warn`, `--warn-tint`, `--danger`, `--danger-tint`, `--radius`. Use these everywhere, no hard-coded colors.

## Next.js 16 breaking changes (relevant to this project)

- `params` in page components is `Promise<{slug:string}>` — must `await params`
- Type helper `PageProps<'/c/[slug]'>` is globally generated (no import needed)
- See `apps/front/AGENTS.md` for more

## File map

```
apps/api/src/
  index.ts                     Fastify server + CORS + route registration
  domain/types.ts              Canonical domain types
  domain/balancing.ts          Multicriteria balancing algorithm
  lib/supabase.ts              Service-role Supabase client
  lib/slug.ts                  6-char base32 slug generator
  lib/repo.ts                  All Supabase CRUD (snake_case ↔ camelCase)
  routes/competitions.ts       POST /competitions, GET /:slug, PATCH /:slug/config
  routes/players.ts            POST /:slug/players, PATCH /players/:id, POST /:slug/reset
  routes/constraints.ts        POST /:slug/constraints, DELETE /constraints/:id
  routes/snapshots.ts          POST /:slug/snapshots, POST /:slug/snapshots/:id/restore
  routes/rebalance.ts          POST /:slug/rebalance-proposals, POST /:slug/apply-proposals

apps/front/src/
  app/layout.tsx               Root layout, title "FairTeams"
  app/globals.css              CSS custom properties color system
  app/page.tsx                 Home: create competition + join by key
  app/c/[slug]/page.tsx        Server component — awaits params, fetches data
  app/c/[slug]/competition-app.tsx  Main client component, tab state, rebalance flow
  app/c/[slug]/helpers.ts      Labels, isBeginner, computeTeamStats (display), demo data
  app/c/[slug]/TabTeams.tsx    Team grid cards
  app/c/[slug]/TabConfig.tsx   Config form + priority reordering
  app/c/[slug]/TabImport.tsx   CSV import (papaparse) + demo loaders + reset
  app/c/[slug]/TabRoster.tsx   Manual player editing
  app/c/[slug]/TabConstraints.tsx  Constraint CRUD
  app/c/[slug]/TabSnapshots.tsx    Snapshot create/restore
  app/c/[slug]/RebalancePreview.tsx  Editable proposals before confirm
  lib/types.ts                 Same types as API + CompetitionData
  lib/api.ts                   Typed API client (api.createCompetition, etc.)
```

## Style guidance

- Port the balancing algorithm faithfully — no redesign without discussion
- No Zod on API routes for now (add when validation becomes noisy)
- No `apps/shared` package unless a third consumer appears
- `fairteams.html` is the reference prototype — read it when the algorithm behavior is unclear
