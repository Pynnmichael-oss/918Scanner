# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev        # Dev server at localhost:3000
npm run build      # Static export to out/ directory
npm run lint       # ESLint

# Run scraper locally (requires env vars)
node scripts/scraper.mjs

# Dry-run scraper (writes 5 fake Tulsa listings, no live scraping)
DRY_RUN=true node scripts/scraper.mjs
```

No test runner is configured. Playwright is a scraping dependency, not a test framework here.

## Environment Variables

**Frontend** (`.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Scraper** (GitHub Secrets or local shell):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`

## Architecture

918Scanner is a commercial real estate investment scanner for Tulsa, OK. It runs as a static Next.js site (GitHub Pages) backed by Supabase, with a daily GitHub Actions scrape job.

### Data Flow

1. **GitHub Actions** (`scrape.yml`) triggers daily at 8 AM CDT
2. **`scripts/scraper.mjs`** scrapes three sources: CIMLS (fetch + HTML regex), Crexi (Playwright + API interception), Brevitas (Playwright + API interception)
3. Listings are geocoded via OpenStreetMap Nominatim, scored by price/sqft vs. Tulsa benchmarks (0–100 `value_score`), and upserted to Supabase via the `upsert_property` RPC
4. New listings without `ai_rationale` get enriched via Claude API (`claude-sonnet-4-0`) — structured JSON response parsed into rationale + investment flags
5. **Frontend** (`src/app/page.tsx`) fetches all properties via SWR + Supabase anon client, renders a dual-pane layout: sidebar (filters + listing cards) + Leaflet map
6. `deploy.yml` builds and deploys to GitHub Pages on every push to `main`

### Key Source Files

| File | Role |
|------|------|
| `src/app/page.tsx` | Main dashboard — filters, listing cards, AI detail panel, layout |
| `src/components/Map.tsx` | React-Leaflet map with value-score-colored circle markers |
| `scripts/scraper.mjs` | Scraping orchestrator + AI enrichment pipeline |
| `supabase/schema.sql` | DB schema, RLS policies, `upsert_property` RPC |
| `src/types/property.ts` | `Property` and `Filters` TypeScript interfaces |
| `src/lib/colors.ts` | `value_score` → color mapping |

### Database (Supabase/PostgreSQL)

Two tables:
- **`properties`** — listings with `value_score`, `ai_rationale`, `ai_flags[]`, geocoords, broker info
- **`scan_history`** — per-run audit trail (source, counts, status)

RLS: public read, anon delete (user-side removal), all writes via service role through the scraper.

### Investment Logic

The app targets two strategies:
- **Income Play**: office, retail, multifamily, industrial
- **Redevelopment**: land, mixed-use, distressed

Only sale listings with known property types and asking prices are stored. The `value_score` formula is a step function on price/sqft vs. Tulsa market benchmarks (defined in `scraper.mjs`).

### Deployment

- Frontend: static export (`output: "export"`) deployed to GitHub Pages at `/918Scanner` base path
- `next.config.ts` sets `basePath`, `trailingSlash: true`, and `images.unoptimized: true` for static compatibility
- Tailwind CSS 4 is used via PostCSS plugin (not the legacy `tailwind.config.js` approach)
