# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev       # Start Next.js dev server
npm run build     # Static export to out/
npm run lint      # ESLint

# Run the scraper manually (requires env vars below)
node scripts/scraper.mjs

# Scraper env vars
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=...        # optional — skips AI enrichment if absent
DRY_RUN=true                 # optional — inserts fake test listings instead of scraping
```

No test suite exists; CI validates via build + lint only.

## Architecture

**918Scanner** scans Tulsa commercial real estate listings daily, scores them for investment value, enriches them with AI analysis, and displays results on an interactive map deployed to GitHub Pages.

### Data flow

```
GitHub Actions (scrape.yml, daily 8 AM CDT)
  → scripts/scraper.mjs
      → Scrape: CIMLS (fetch/HTML), Crexi (Playwright), Brevitas (Playwright)
      → Geocode: OpenStreetMap Nominatim
      → Score: calcValueScore(price, sqft) → 0-100
      → Upsert: Supabase RPC upsert_property() (content-hash dedup)
      → Enrich: Anthropic claude-sonnet-4-0 (buy-hold + redevelopment prompts)
  → triggers deploy.yml → npm run build → GitHub Pages (/918Scanner)
```

### Frontend (`src/`)

- **`app/page.tsx`** — entire UI: filter bar (strategy, type, price), sidebar listing cards, AI analysis detail panel. Fetches all active properties from Supabase on load; all filtering is client-side.
- **`components/Map.tsx`** — React-Leaflet map with OpenStreetMap tiles. Markers are color-coded by `value_score` (green ≥80, yellow 50–79, red <50) via `src/lib/colors.ts`. Fly-to animation on sidebar selection.
- **`lib/supabase.ts`** — single Supabase client (anon key; service role key only used in scraper via env).
- **`types/property.ts`** — `Property` and `Filters` interfaces shared across frontend and scraper.

### Scraper (`scripts/scraper.mjs`)

Key functions:
- `calcValueScore(price, sqft)` — price-per-sqft thresholds map to 0–100 score.
- `normalizeType(raw)` — maps raw scraped strings to the 6 canonical types: `office | retail | industrial | land | multifamily | mixed-use`.
- `isValidListing()` — filters to FOR SALE only, recognized types, non-null price.
- `enrichWithAI(listings)` — batches Claude API calls with 600 ms throttle; writes `ai_rationale` (structured text) and `ai_flags` array.

### Database (`supabase/schema.sql`)

Two tables: **`properties`** (main, public read + anon delete RLS) and **`scan_history`** (audit log per scraper run). The `upsert_property()` PL/pgSQL RPC handles insert/update/skip logic via `content_hash`; the scraper never does raw INSERT/UPDATE.

### Deployment

- **`next.config.ts`**: `output: 'export'`, `basePath: '/918Scanner'`, `images.unoptimized: true` — required for GitHub Pages static hosting.
- All asset paths must account for the `/918Scanner` base path.
