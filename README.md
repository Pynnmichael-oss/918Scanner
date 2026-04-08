# 918Scanner

Tulsa commercial real estate aggregator and map viewer. Scrapes listings from CIMLS and Crexi, scores them by investment value, generates AI analysis with Claude, and displays them on an interactive map.

## Features

- Interactive Leaflet map with markers colored by value score (green/yellow/red)
- Sidebar with filters (type, listing/sale, price range) and sortable listings panel
- AI investment analysis per property (opportunity, risks, verdict) powered by Claude
- Daily automated scraping via GitHub Actions (8 AM CDT)
- Deployed to GitHub Pages as a static Next.js export

## Tech Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Map**: React-Leaflet / Leaflet
- **Database**: Supabase (PostgreSQL)
- **Scraping**: Playwright (Crexi), fetch (CIMLS)
- **AI**: Anthropic Claude (`claude-sonnet-4-0`)
- **CI/CD**: GitHub Actions → GitHub Pages

## GitHub Secrets Required

Add these in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (write access) |
| `ANTHROPIC_API_KEY` | Anthropic API key for AI investment analysis |

## Database Setup

Run `supabase/schema.sql` once in the Supabase SQL editor to create the `properties` and `scan_history` tables, the `upsert_property` RPC, and the AI analysis columns.

## Local Development

```bash
npm install
# set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
npm run dev
```

## Scraper (manual run)

```bash
# Dry run — writes 5 fake listings and runs AI enrichment
DRY_RUN=true \
NEXT_PUBLIC_SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
ANTHROPIC_API_KEY=... \
node scripts/scraper.mjs
```
