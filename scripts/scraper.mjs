#!/usr/bin/env node
/**
 * 918Scanner scraper
 *
 * Sources:
 *   - CIMLS.com  (fetch + HTML parse — no Playwright needed, bot-friendly)
 *   - Crexi.com  (Playwright network interception)
 *
 * Env vars required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional:
 *   DRY_RUN=true  — skip live scraping, write fake Tulsa listings instead
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import { setOutput } from "./lib/actions.mjs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const DRY_RUN = process.env.DRY_RUN === "true";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Fake listings (dry-run) ────────────────────────────────────────────────────

const FAKE_LISTINGS = [
  {
    source: "crexi", external_id: "test-1",
    url: "https://www.crexi.com/properties/test-1",
    address: "320 S Boston Ave, Tulsa, OK 74103",
    lat: 36.1540, lng: -95.9928,
    price: 1_250_000, sqft: 8_400, property_type: "office",
    listing_type: "sale", broker_name: "James Whitfield",
    broker_phone: "(918) 555-0101", value_score: 82, content_hash: "dryrun0001",
  },
  {
    source: "crexi", external_id: "test-2",
    url: "https://www.crexi.com/properties/test-2",
    address: "4107 S Yale Ave, Tulsa, OK 74135",
    lat: 36.0856, lng: -95.9377,
    price: 680_000, sqft: 3_200, property_type: "retail",
    listing_type: "sale", broker_name: "Sandra Moore",
    broker_phone: "(918) 555-0147", value_score: 71, content_hash: "dryrun0002",
  },
  {
    source: "crexi", external_id: "test-3",
    url: "https://www.crexi.com/properties/test-3",
    address: "2651 E 21st St, Tulsa, OK 74114",
    lat: 36.1234, lng: -95.9456,
    price: null, sqft: 14_000, property_type: "industrial",
    listing_type: "lease", broker_name: "Ray Delgado",
    broker_phone: "(918) 555-0233", value_score: 58, content_hash: "dryrun0003",
  },
  {
    source: "crexi", external_id: "test-4",
    url: "https://www.crexi.com/properties/test-4",
    address: "7902 E 51st St, Tulsa, OK 74145",
    lat: 36.0912, lng: -95.8876,
    price: 390_000, sqft: null, property_type: "land",
    listing_type: "sale", broker_name: "Cheryl Nguyen",
    broker_phone: "(918) 555-0388", value_score: 44, content_hash: "dryrun0004",
  },
  {
    source: "crexi", external_id: "test-5",
    url: "https://www.crexi.com/properties/test-5",
    address: "1602 N Peoria Ave, Tulsa, OK 74106",
    lat: 36.1876, lng: -95.9912,
    price: 2_800_000, sqft: 22_500, property_type: "multifamily",
    listing_type: "sale", broker_name: "Tom Garrison",
    broker_phone: "(918) 555-0419", value_score: 88, content_hash: "dryrun0005",
  },
];

// ── helpers ────────────────────────────────────────────────────────────────────

function contentHash(obj) {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex").slice(0, 16);
}

function calcValueScore(price, sqft, listingType) {
  if (!price || !sqft || sqft === 0) return 50;
  const ppsf = price / sqft;
  let score = 50;
  if (listingType === "sale") {
    if (ppsf < 60)        score += 40;
    else if (ppsf < 100)  score += 28;
    else if (ppsf < 150)  score += 15;
    else if (ppsf < 200)  score += 5;
    else if (ppsf > 500)  score -= 25;
    else if (ppsf > 350)  score -= 15;
  } else {
    if (ppsf < 8)         score += 35;
    else if (ppsf < 12)   score += 20;
    else if (ppsf < 16)   score += 10;
    else if (ppsf > 40)   score -= 25;
    else if (ppsf > 28)   score -= 15;
  }
  return Math.max(0, Math.min(100, score));
}

async function geocode(address) {
  if (!address) return { lat: null, lng: null };
  try {
    const q = encodeURIComponent(address.includes("OK") ? address : `${address}, Tulsa, OK`);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { "User-Agent": "918scanner/1.0" } }
    );
    const data = await res.json();
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { /* ignore */ }
  return { lat: null, lng: null };
}

const TYPE_MAP = {
  office: "office", retail: "retail", industrial: "industrial",
  warehouse: "industrial", flex: "industrial", land: "land",
  multifamily: "multifamily", apartment: "multifamily",
  "multi-family": "multifamily", "mixed-use": "mixed-use", mixed: "mixed-use",
  "multi-use": "mixed-use", hotel: "hotel", hospitality: "hotel",
  storage: "industrial", "shopping center": "retail", "business park": "industrial",
};

function normalizeType(raw) {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  for (const [k, v] of Object.entries(TYPE_MAP)) {
    if (lower.includes(k)) return v;
  }
  return lower.trim() || null;
}

async function upsert(property) {
  const { data, error } = await supabase.rpc("upsert_property", {
    p_source:        property.source,
    p_external_id:   property.external_id,
    p_url:           property.url,
    p_address:       property.address,
    p_lat:           property.lat,
    p_lng:           property.lng,
    p_price:         property.price,
    p_sqft:          property.sqft,
    p_property_type: property.property_type,
    p_listing_type:  property.listing_type,
    p_broker_name:   property.broker_name,
    p_broker_phone:  property.broker_phone,
    p_value_score:   property.value_score,
    p_content_hash:  property.content_hash,
  });
  if (error) throw new Error(error.message);
  return data?.action ?? "unknown";
}

// ── scan_history ───────────────────────────────────────────────────────────────
// Live schema: platform (text not null), search_url (text not null),
// listings_found, listings_new, listings_updated, status, error_message, duration_seconds

async function startScan(platform, searchUrl) {
  const { data } = await supabase
    .from("scan_history")
    .insert({ platform, search_url: searchUrl, status: "running" })
    .select("id")
    .single();
  return data?.id;
}

async function finishScan(id, counts, durationSec, status = "success") {
  await supabase
    .from("scan_history")
    .update({
      listings_found:     counts.found,
      listings_new:       counts.inserted,
      listings_updated:   counts.updated,
      listings_unchanged: counts.skipped ?? 0,
      status,
      error_message:      counts.errorMsg ?? null,
      duration_seconds:   durationSec,
    })
    .eq("id", id);
}

// ── upsert a batch of listings ─────────────────────────────────────────────────

async function upsertAll(listings, platform, searchUrl) {
  const t0 = Date.now();
  const scanId = await startScan(platform, searchUrl);
  const counts = { found: listings.length, inserted: 0, updated: 0, skipped: 0, errors: 0 };

  console.log(`  Upserting ${listings.length} listings…`);
  for (const l of listings) {
    try {
      const action = await upsert(l);
      if (action === "inserted")      counts.inserted++;
      else if (action === "updated")  counts.updated++;
      else                            counts.skipped++;
      console.log(`  [${action}] ${l.address}`);
    } catch (e) {
      counts.errors++;
      console.error(`  [error] ${l.address}: ${e.message}`);
    }
  }

  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  await finishScan(scanId, counts, parseFloat(dur));
  return counts;
}

// ── CIMLS fetch scraper ────────────────────────────────────────────────────────
//
// CIMLS.com serves plain HTML without bot protection — a simple fetch works.
// Listing card structure:
//   <a href="/sale-listing/{id}/..." title="Type - Address, City, State">
//     <div class="listing-description"><b>$Price\nSqFt Sq. Ft.</b>...</div>
//   </a>

const CIMLS_HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

function parseCimlsHtml(html, listingType) {
  const listings = [];

  // Each listing: <a href="/(sale|lease)-listing/{id}/..." title="Type - Address">
  // followed by <b>price/sqft</b> in listing-description
  const blockRe = /<a\s+href="(\/(sale|lease)-listing\/(\d+)\/[^"]*)"[^>]*title="([^"]+)"[\s\S]*?<div class="listing-description">\s*<b>([\s\S]*?)<\/b>/g;
  let m;

  while ((m = blockRe.exec(html)) !== null) {
    const [, path, , id, titleRaw, boldRaw] = m;

    // Parse type + address from title: "Office - 123 Main St, Tulsa, OK"
    const dashIdx = titleRaw.indexOf(" - ");
    const typeRaw   = dashIdx >= 0 ? titleRaw.slice(0, dashIdx).trim() : "";
    const addressRaw = dashIdx >= 0 ? titleRaw.slice(dashIdx + 3).trim() : titleRaw.trim();

    // Parse price + sqft from bold text (may have \n or <br/>)
    const boldText = boldRaw.replace(/<[^>]+>/g, "\n");
    let price = null, sqft = null;
    for (const line of boldText.split(/[\n\r]+/)) {
      const clean = line.trim();
      if (!clean) continue;
      if (clean.startsWith("$") && price == null) {
        price = parseFloat(clean.replace(/[^0-9.]/g, "")) || null;
      } else if (/sq\.?\s*ft/i.test(clean) && sqft == null) {
        sqft = parseFloat(clean.replace(/[^0-9.]/g, "")) || null;
      }
    }

    const url = `https://www.cimls.com${path}`;
    const hash = contentHash({ id, listingType });
    listings.push({ id, url, addressRaw, typeRaw, price, sqft, listingType, hash });
  }

  return listings;
}

async function scrapeCIMLSType(listingType) {
  const searchUrl = `https://www.cimls.com/search.php?type=${listingType}&city=Tulsa&state=OK`;
  console.log(`  Fetching: ${searchUrl}`);
  const res = await fetch(searchUrl, { headers: CIMLS_HEADERS });
  if (!res.ok) throw new Error(`CIMLS ${listingType} HTTP ${res.status}`);
  const html = await res.text();
  return parseCimlsHtml(html, listingType);
}

async function scrapeCIMLSFetch() {
  console.log("\n── CIMLS (fetch) ───────────────────────────────────");
  const [saleRaw, leaseRaw] = await Promise.allSettled([
    scrapeCIMLSType("sale"),
    scrapeCIMLSType("lease"),
  ]);

  const raw = [
    ...(saleRaw.status  === "fulfilled" ? saleRaw.value  : (console.warn("  Sale fetch failed:", saleRaw.reason?.message), [])),
    ...(leaseRaw.status === "fulfilled" ? leaseRaw.value : (console.warn("  Lease fetch failed:", leaseRaw.reason?.message), [])),
  ];

  console.log(`  Parsed ${raw.length} raw listings from HTML`);

  const listings = [];
  for (const r of raw) {
    const coords = await geocode(r.addressRaw);
    listings.push({
      source:        "cimls",
      external_id:   r.id,
      url:           r.url,
      address:       r.addressRaw,
      lat:           coords.lat,
      lng:           coords.lng,
      price:         r.price,
      sqft:          r.sqft,
      property_type: normalizeType(r.typeRaw),
      listing_type:  r.listingType,
      broker_name:   null,
      broker_phone:  null,
      value_score:   calcValueScore(r.price, r.sqft, r.listingType),
      content_hash:  r.hash,
    });
  }
  return listings;
}

// ── Crexi (Playwright) ────────────────────────────────────────────────────────

async function makeBrowser() {
  return chromium.launch({
    headless: true,
    args: [
      "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });
}

async function makePage(browser) {
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  return page;
}

async function scrapeCrexi() {
  console.log("\n── Crexi (Playwright) ──────────────────────────────");
  const browser = await makeBrowser();
  const page = await makePage(browser);
  const captured = [];
  const SEARCH_URL = "https://www.crexi.com/properties?states=OK&cities=Tulsa";

  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("api.crexi.com") && response.status() === 200 &&
        response.headers()["content-type"]?.includes("json")) {
      try {
        const json = await response.json();
        const assets = json.assets ?? json.data ?? json.results ?? [];
        if (Array.isArray(assets) && assets.length > 0) {
          console.log(`  Intercepted Crexi API: ${assets.length} listings`);
          captured.push(...assets);
        }
      } catch { /* not parseable */ }
    }
  });

  try {
    await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(10000);
  } catch (e) {
    console.warn("  Crexi page load warning:", e.message);
  } finally {
    await browser.close();
  }

  if (captured.length === 0) {
    console.warn("  No listings captured from Crexi — likely bot-blocked.");
    return [];
  }

  const listings = [];
  for (const a of captured) {
    const address = [a.address, a.city, a.state].filter(Boolean).join(", ");
    const price       = a.askingPrice ?? a.price ?? a.listPrice ?? null;
    const sqft        = a.buildingSize ?? a.lotSize ?? a.sqft ?? null;
    const listingType = a.listingType?.toLowerCase().includes("lease") ? "lease" : "sale";
    const coords =
      a.lat && a.lng      ? { lat: a.lat, lng: a.lng } :
      a.location?.lat     ? { lat: a.location.lat, lng: a.location.lng } :
      await geocode(address);
    const hash = contentHash({ address, price, sqft, listingType });
    listings.push({
      source: "crexi", external_id: String(a.id ?? a.assetId ?? hash),
      url: a.url ?? `https://www.crexi.com/properties/${a.id}`,
      address, lat: coords.lat, lng: coords.lng,
      price, sqft,
      property_type: normalizeType(a.propertyType ?? a.assetType),
      listing_type: listingType,
      broker_name: a.brokerName ?? a.contactName ?? null,
      broker_phone: a.brokerPhone ?? a.contactPhone ?? null,
      value_score: calcValueScore(price, sqft, listingType),
      content_hash: hash,
    });
  }
  return listings;
}

// ── AI enrichment ─────────────────────────────────────────────────────────────

async function enrichWithAI() {
  if (!ANTHROPIC_API_KEY) {
    console.log("\nANTHROPIC_API_KEY not set — skipping AI enrichment.");
    return;
  }

  const { data: properties, error } = await supabase
    .from("properties")
    .select("*")
    .is("ai_rationale", null);

  if (error) {
    console.error("Failed to fetch properties for AI enrichment:", error.message);
    return;
  }
  if (!properties?.length) {
    console.log("\nNo properties need AI enrichment.");
    return;
  }

  console.log(`\n── AI enrichment ───────────────────────────────────`);
  console.log(`  Enriching ${properties.length} properties…`);

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  for (const p of properties) {
    try {
      const ppsf = p.price && p.sqft ? (p.price / p.sqft).toFixed(0) : "N/A";

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-0",
        max_tokens: 300,
        system:
          "You are a commercial real estate investment analyst specializing in the Tulsa, Oklahoma market. Be concise, specific, and practical.",
        messages: [
          {
            role: "user",
            content: `Analyze this Tulsa commercial property as a potential investment:
Address: ${p.address}
Type: ${p.property_type ?? "unknown"}
Listing Type: ${p.listing_type ?? "unknown"}
Price: $${p.price ?? "N/A"}
Size: ${p.sqft ?? "N/A"} sqft
Price/sqft: $${ppsf}
Value Score: ${p.value_score}/100
Broker: ${p.broker_name ?? "unknown"}

Provide:
1. OPPORTUNITY (2 sentences): Why this could be a good investment
2. RISKS (1 sentence): Main concern
3. VERDICT (1 sentence): Buy/Watch/Pass and why

Keep total response under 100 words.

Also select 2-4 tags from: ["below-market", "value-add", "corner-lot", "high-traffic", "redevelopment", "stable-income", "distressed", "land-play", "owner-user", "NNN", "above-market", "watch-only"]

Return ONLY valid JSON: {"rationale": "<your analysis>", "flags": ["tag1", "tag2"]}`,
          },
        ],
      });

      const text =
        response.content[0]?.type === "text" ? response.content[0].text : "";

      let rationale = text;
      let flags = [];
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          rationale = parsed.rationale ?? text;
          flags = Array.isArray(parsed.flags) ? parsed.flags : [];
        }
      } catch { /* use raw text */ }

      const { error: updateError } = await supabase
        .from("properties")
        .update({ ai_rationale: rationale, ai_flags: flags })
        .eq("id", p.id);

      if (updateError) throw new Error(updateError.message);
      console.log(`  [AI] ${p.address}`);

      // Brief pause to respect rate limits
      await new Promise((r) => setTimeout(r, 600));
    } catch (e) {
      console.error(`  [AI error] ${p.address ?? p.id}: ${e.message}`);
    }
  }
}

// ── main ───────────────────────────────────────────────────────────────────────

async function deleteDummyListings() {
  const { error, count } = await supabase
    .from("properties")
    .delete({ count: "exact" })
    .or("content_hash.like.dryrun%,external_id.like.test-%");
  if (error) {
    console.warn("  Warning: could not delete dummy listings:", error.message);
  } else if (count && count > 0) {
    console.log(`  Deleted ${count} dummy listing(s) from previous dry runs.`);
  }
}

async function main() {
  const start = Date.now();

  if (DRY_RUN) {
    console.log("918Scanner scraper — DRY RUN (fake listings)");
    console.log(`Writing ${FAKE_LISTINGS.length} fake Tulsa listings to Supabase…\n`);
    const counts = await upsertAll(FAKE_LISTINGS, "dry-run", "dry-run");
    await enrichWithAI();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\nDone in ${elapsed}s — new: ${counts.inserted}, updated: ${counts.updated}, errors: ${counts.errors}`);
    setOutput("inserted", counts.inserted);
    setOutput("updated", counts.updated);
    setOutput("errors", counts.errors);
    return;
  }

  console.log("918Scanner scraper starting…");

  // Remove any leftover dummy data from previous dry runs.
  await deleteDummyListings();

  // CIMLS runs first (fetch-based, reliable). Crexi runs in parallel (Playwright, may be blocked).
  const [cimlsResult, crexiResult] = await Promise.allSettled([
    scrapeCIMLSFetch().then((listings) =>
      upsertAll(listings, "cimls", "https://www.cimls.com/search.php?type=sale&city=Tulsa&state=OK")
    ),
    scrapeCrexi().then((listings) =>
      upsertAll(listings, "crexi", "https://www.crexi.com/properties?states=OK&cities=Tulsa")
    ),
  ]);

  const totals = { inserted: 0, updated: 0, errors: 0 };
  for (const r of [cimlsResult, crexiResult]) {
    if (r.status === "fulfilled") {
      totals.inserted += r.value.inserted;
      totals.updated  += r.value.updated;
      totals.errors   += r.value.errors;
    } else {
      console.error("Source failed:", r.reason?.message);
      totals.errors++;
    }
  }

  await enrichWithAI();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s — inserted: ${totals.inserted}, updated: ${totals.updated}, errors: ${totals.errors}`);

  setOutput("inserted", totals.inserted);
  setOutput("updated",  totals.updated);
  setOutput("errors",   totals.errors);
}

main().catch((e) => { console.error(e); process.exit(1); });
