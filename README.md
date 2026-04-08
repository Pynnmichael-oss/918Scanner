# 918Scanner

Tulsa commercial real estate investment scanner. Scrapes for-sale listings daily, scores them by value, and generates AI investment analysis (income potential, redevelopment upside, Tulsa market context).

## Investment Criteria

| Field | Value |
|-------|-------|
| **Strategy** | Buy & hold for income + Land/redevelopment plays |
| **Types** | Office, Industrial, Multifamily, Mixed-Use, Retail, Land |
| **Market** | Tulsa, OK metro |
| **Listing type** | For Sale only |
| **Updated** | Daily via GitHub Actions (8 AM CDT) |

## Features

- Interactive Leaflet map — markers colored by value score (green/yellow/red)
- **Strategy filter**: Income Play (office/retail/multifamily/industrial) or Redevelopment (land/mixed-use/distressed)
- AI analysis per listing: income potential, redevelopment upside, Tulsa market context, Buy/Watch/Pass verdict
- Delete listings you don't want (inline confirmation, no modal)
- Daily automated scrape from CIMLS, Crexi, and Brevitas

## Tech Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Map**: React-Leaflet / Leaflet
- **Database**: Supabase (PostgreSQL)
- **Scraping**: Playwright (Crexi, Brevitas), fetch (CIMLS)
- **AI**: Anthropic Claude (`claude-sonnet-4-0`)
- **CI/CD**: GitHub Actions → GitHub Pages

## GitHub Secrets Required

Add these in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (write access) |
| `ANTHROPIC_API_KEY` | Anthropic API key for AI investment analysis |

## Database Setup

Run `supabase/schema.sql` in the Supabase SQL editor to create tables, indexes, RLS policies, and the `upsert_property` RPC.

**After first deploy**, run these cleanup queries to remove any old lease listings and reset AI analysis with the new prompt:

```sql
-- Remove non-investment listings
delete from properties where listing_type = 'lease';
delete from properties where property_type not in ('office','industrial','multifamily','mixed-use','retail','land');

-- Reset AI so new buy-hold prompt runs on next scrape
update properties set ai_rationale = null, ai_flags = '{}';
```

## Value Scoring

Score is 0–100, based on price-per-sqft vs. Tulsa market benchmarks (for-sale only):

| Price/sf | Score |
|----------|-------|
| < $40 | 92 — deeply below market |
| $40–59 | 82 |
| $60–99 | 70 |
| $100–149 | 60 |
| $150–199 | 52 |
| $200–249 | 50 |
| $250–349 | 42 |
| $350–499 | 32 |
| > $500 | 22 |

## Local Development

```bash
npm install
# .env.local needs:
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
npm run dev
```

## Scraper (manual run)

```bash
DRY_RUN=true \
NEXT_PUBLIC_SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
ANTHROPIC_API_KEY=... \
node scripts/scraper.mjs
```
