#!/usr/bin/env node
/**
 * 918Scanner scraper
 * Sources: Crexi + Brevitas via Playwright network interception
 *
 * Env vars required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { setOutput } from "./lib/actions.mjs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Playwright browser factory ─────────────────────────────────────────────────

async function makeBrowser() {
  return chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });
}

async function makePage(browser) {
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
  });
  const page = await ctx.newPage();
  // Remove webdriver fingerprint
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  return page;
}

// ── helpers ────────────────────────────────────────────────────────────────────

function contentHash(obj) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(obj))
    .digest("hex")
    .slice(0, 16);
}

function calcValueScore(price, sqft, listingType) {
  if (!price || !sqft || sqft === 0) return 50;
  const ppsf = price / sqft;
  let score = 50;
  if (listingType === "sale") {
    if (ppsf < 60)       score += 40;
    else if (ppsf < 100) score += 28;
    else if (ppsf < 150) score += 15;
    else if (ppsf < 200) score += 5;
    else if (ppsf > 350) score -= 15;
    else if (ppsf > 500) score -= 25;
  } else {
    if (ppsf < 8)        score += 35;
    else if (ppsf < 12)  score += 20;
    else if (ppsf < 16)  score += 10;
    else if (ppsf > 28)  score -= 15;
    else if (ppsf > 40)  score -= 25;
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
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch { /* ignore */ }
  return { lat: null, lng: null };
}

const TYPE_MAP = {
  office: "office", retail: "retail", industrial: "industrial",
  warehouse: "industrial", flex: "industrial", land: "land",
  multifamily: "multifamily", apartment: "multifamily",
  "mixed-use": "mixed-use", mixed: "mixed-use",
  hotel: "hotel", hospitality: "hotel",
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

// ── Crexi ──────────────────────────────────────────────────────────────────────
//
// Strategy: load the Crexi Tulsa search page and intercept the XHR/fetch calls
// the React app makes to api.crexi.com — we capture the raw JSON instead of
// parsing rendered HTML, which sidesteps most anti-scraping measures.

async function scrapeCrexi() {
  console.log("\n── Crexi ──────────────────────────────────────────");
  const browser = await makeBrowser();
  const page = await makePage(browser);
  const captured = [];

  page.on("response", async (response) => {
    const url = response.url();
    if (
      url.includes("api.crexi.com") &&
      response.status() === 200 &&
      response.headers()["content-type"]?.includes("json")
    ) {
      try {
        const json = await response.json();
        const assets = json.assets ?? json.data ?? json.results ?? [];
        if (Array.isArray(assets) && assets.length > 0) {
          console.log(`  Intercepted Crexi API: ${assets.length} listings`);
          captured.push(...assets);
        }
      } catch { /* not parseable JSON */ }
    }
  });

  try {
    await page.goto(
      "https://www.crexi.com/properties?states=OK&cities=Tulsa",
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );
    // Give React time to render and fire API calls
    await page.waitForTimeout(10000);
  } catch (e) {
    console.warn("  Crexi page load warning:", e.message);
  } finally {
    await browser.close();
  }

  if (captured.length === 0) {
    console.warn("  No listings captured from Crexi — site may be blocking headless.");
    return [];
  }

  const listings = [];
  for (const a of captured) {
    const address = [a.address, a.city, a.state].filter(Boolean).join(", ");
    const price        = a.askingPrice ?? a.price ?? a.listPrice ?? null;
    const sqft         = a.buildingSize ?? a.lotSize ?? a.sqft ?? null;
    const listingType  = a.listingType?.toLowerCase().includes("lease") ? "lease" : "sale";
    const coords =
      a.lat && a.lng          ? { lat: a.lat, lng: a.lng } :
      a.location?.lat         ? { lat: a.location.lat, lng: a.location.lng } :
      await geocode(address);

    const hash = contentHash({ address, price, sqft, listingType });
    listings.push({
      source:        "crexi",
      external_id:   String(a.id ?? a.assetId ?? hash),
      url:           a.url ?? `https://www.crexi.com/properties/${a.id}`,
      address,
      lat:           coords.lat,
      lng:           coords.lng,
      price,
      sqft,
      property_type: normalizeType(a.propertyType ?? a.assetType),
      listing_type:  listingType,
      broker_name:   a.brokerName ?? a.contactName ?? null,
      broker_phone:  a.brokerPhone ?? a.contactPhone ?? null,
      value_score:   calcValueScore(price, sqft, listingType),
      content_hash:  hash,
    });
  }
  return listings;
}

// ── Brevitas ───────────────────────────────────────────────────────────────────

async function scrapeBrevitas() {
  console.log("\n── Brevitas ────────────────────────────────────────");
  const browser = await makeBrowser();
  const page = await makePage(browser);
  const captured = [];

  // Intercept any JSON API responses
  page.on("response", async (response) => {
    const url = response.url();
    const ct  = response.headers()["content-type"] ?? "";
    if (response.status() === 200 && ct.includes("json") && url.includes("brevitas")) {
      try {
        const json = await response.json();
        const items =
          json.listings ?? json.properties ?? json.data ?? json.results ?? [];
        if (Array.isArray(items) && items.length > 0) {
          console.log(`  Intercepted Brevitas API: ${items.length} listings`);
          captured.push(...items);
        }
      } catch { /* ignore */ }
    }
  });

  try {
    await page.goto(
      "https://brevitas.com/commercial-real-estate/oklahoma/tulsa",
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );
    await page.waitForTimeout(8000);

    // If no API was intercepted, fall back to DOM scraping
    if (captured.length === 0) {
      const cards = await page.$$eval("a[href*='/listing/'], a[href*='/property/']", (els) =>
        els.slice(0, 50).map((el) => {
          const closest = el.closest("[class*='card'], [class*='listing'], article, li") ?? el;
          return {
            url:     el.href,
            id:      el.href.split("/").pop() ?? "",
            address: closest.querySelector("[class*='address'], [class*='location'], h2, h3")?.textContent?.trim() ?? "",
            price:   closest.querySelector("[class*='price']")?.textContent?.trim() ?? "",
            sqft:    closest.querySelector("[class*='sqft'], [class*='size'], [class*='area']")?.textContent?.trim() ?? "",
            type:    closest.querySelector("[class*='type'], [class*='category'], [class*='class']")?.textContent?.trim() ?? "",
          };
        })
      );
      console.log(`  DOM scrape found ${cards.length} Brevitas cards`);
      captured.push(...cards.map((c) => ({ _dom: true, ...c })));
    }
  } catch (e) {
    console.warn("  Brevitas page load warning:", e.message);
  } finally {
    await browser.close();
  }

  const listings = [];
  for (const item of captured) {
    // DOM-scraped card
    if (item._dom) {
      const { url, id, address, price: rawPrice, sqft: rawSqft, type } = item;
      if (!address && !id) continue;
      const price       = parseFloat(rawPrice.replace(/[^0-9.]/g, "")) || null;
      const sqft        = parseFloat(rawSqft.replace(/[^0-9.]/g, "")) || null;
      const listingType = type?.toLowerCase().includes("lease") ? "lease" : "sale";
      const coords      = await geocode(address);
      const hash        = contentHash({ address, price, sqft, listingType });
      listings.push({
        source:        "brevitas",
        external_id:   id || `brevitas-${hash}`,
        url:           url || "https://brevitas.com",
        address,
        lat:           coords.lat,
        lng:           coords.lng,
        price,
        sqft,
        property_type: normalizeType(type),
        listing_type:  listingType,
        broker_name:   null,
        broker_phone:  null,
        value_score:   calcValueScore(price, sqft, listingType),
        content_hash:  hash,
      });
      continue;
    }

    // API-intercepted listing
    const address     = item.address ?? item.title ?? "";
    const price       = item.price ?? item.askingPrice ?? null;
    const sqft        = item.sqft ?? item.size ?? item.buildingSize ?? null;
    const listingType = item.listingType?.toLowerCase().includes("lease") ? "lease" : "sale";
    const coords =
      item.lat && item.lng ? { lat: item.lat, lng: item.lng } : await geocode(address);
    const hash = contentHash({ address, price, sqft, listingType });
    listings.push({
      source:        "brevitas",
      external_id:   String(item.id ?? item.listingId ?? hash),
      url:           item.url ?? item.link ?? "https://brevitas.com",
      address,
      lat:           coords.lat,
      lng:           coords.lng,
      price,
      sqft,
      property_type: normalizeType(item.propertyType ?? item.type),
      listing_type:  listingType,
      broker_name:   item.brokerName ?? item.agentName ?? null,
      broker_phone:  item.brokerPhone ?? item.phone ?? null,
      value_score:   calcValueScore(price, sqft, listingType),
      content_hash:  hash,
    });
  }
  return listings;
}

// ── scan_history ───────────────────────────────────────────────────────────────

async function startScan(source) {
  const { data } = await supabase
    .from("scan_history")
    .insert({ source, status: "running" })
    .select("id")
    .single();
  return data?.id;
}

async function finishScan(id, counts, status = "done") {
  await supabase
    .from("scan_history")
    .update({ ...counts, finished_at: new Date().toISOString(), status })
    .eq("id", id);
}

// ── run one source ─────────────────────────────────────────────────────────────

async function run(source) {
  const scanId = await startScan(source);
  const counts = { inserted: 0, updated: 0, errors: 0 };
  let listings;

  try {
    listings = source === "crexi" ? await scrapeCrexi() : await scrapeBrevitas();
  } catch (e) {
    console.error(`Fatal scrape error (${source}):`, e.message);
    await finishScan(scanId, { errors: 1 }, "failed");
    return counts;
  }

  console.log(`  Upserting ${listings.length} listings…`);
  for (const l of listings) {
    try {
      const action = await upsert(l);
      if (action === "inserted") counts.inserted++;
      else if (action === "updated") counts.updated++;
      console.log(`  [${action}] ${l.address}`);
    } catch (e) {
      counts.errors++;
      console.error(`  [error] ${l.address}: ${e.message}`);
    }
  }

  await finishScan(scanId, counts);
  return counts;
}

// ── main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("918Scanner scraper starting…");
  const start = Date.now();

  const [crexi, brevitas] = await Promise.allSettled([
    run("crexi"),
    run("brevitas"),
  ]);

  const totals = { inserted: 0, updated: 0, errors: 0 };
  for (const r of [crexi, brevitas]) {
    if (r.status === "fulfilled") {
      totals.inserted += r.value.inserted;
      totals.updated  += r.value.updated;
      totals.errors   += r.value.errors;
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s — inserted: ${totals.inserted}, updated: ${totals.updated}, errors: ${totals.errors}`);

  setOutput("inserted", totals.inserted);
  setOutput("updated",  totals.updated);
  setOutput("errors",   totals.errors);

  if (totals.inserted === 0 && totals.updated === 0) process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
