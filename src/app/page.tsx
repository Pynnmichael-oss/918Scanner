"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { supabase } from "@/lib/supabase";
import type { Property, Filters } from "@/types/property";
import { scoreColor } from "@/lib/colors";
import { X, ExternalLink, Phone, Menu } from "lucide-react";

const Map = dynamic(() => import("@/components/Map"), { ssr: false });

const PROPERTY_TYPES = [
  "office",
  "retail",
  "industrial",
  "land",
  "multifamily",
  "mixed-use",
];

const TYPE_BADGE: Record<string, string> = {
  office:      "bg-blue-50 text-blue-700",
  retail:      "bg-purple-50 text-purple-700",
  industrial:  "bg-orange-50 text-orange-700",
  land:        "bg-green-50 text-green-700",
  multifamily: "bg-indigo-50 text-indigo-700",
  "mixed-use": "bg-cyan-50 text-cyan-700",
};

async function fetchProperties(): Promise<Property[]> {
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .order("value_score", { ascending: false });
  if (error) throw error;
  return (data as Property[]) || [];
}

function formatPrice(price: number | null): string {
  if (price == null) return "Price on request";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatSqft(sqft: number | null): string {
  if (sqft == null) return "";
  return new Intl.NumberFormat("en-US").format(sqft) + " sf";
}

function ScoreBadge({ score }: { score: number | null }) {
  const color = scoreColor(score);
  const label =
    score == null ? "N/A" :
    score >= 80   ? "Strong" :
    score >= 50   ? "Moderate" : "Weak";
  return (
    <span
      className="px-1.5 py-0.5 rounded text-xs font-semibold"
      style={{ background: color + "20", color }}
    >
      {label} {score != null ? score : ""}
    </span>
  );
}

const DEFAULT_FILTERS: Filters = {
  propertyType: "",
  listingType: "",
  minPrice: "",
  maxPrice: "",
};

export default function Home() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<Property | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: allProperties = [], error, isLoading } = useSWR(
    "properties",
    fetchProperties
  );

  const filtered = useMemo(() => {
    return allProperties.filter((p) => {
      if (filters.propertyType && p.property_type !== filters.propertyType)
        return false;
      if (filters.listingType && p.listing_type !== filters.listingType)
        return false;
      if (filters.minPrice && p.price != null && p.price < Number(filters.minPrice))
        return false;
      if (filters.maxPrice && p.price != null && p.price > Number(filters.maxPrice))
        return false;
      return true;
    });
  }, [allProperties, filters]);

  // Sorted by value_score desc for the listings panel
  const sortedListings = useMemo(
    () => [...filtered].sort((a, b) => (b.value_score ?? 0) - (a.value_score ?? 0)),
    [filtered]
  );

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-100">
      {/* Mobile header */}
      <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b shadow-sm z-20 shrink-0">
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="p-1 text-gray-600"
          aria-label="Toggle sidebar"
        >
          <Menu size={20} />
        </button>
        <span className="font-semibold text-gray-900">918Scanner</span>
        <span className="ml-auto text-sm text-gray-500">
          {filtered.length} listings
        </span>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black/40 z-30"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Sidebar ── */}
        <aside
          className={[
            "fixed md:relative inset-y-0 left-0 z-40 md:z-auto",
            "w-72 bg-white shadow-lg flex flex-col shrink-0",
            "transition-transform duration-200",
            sidebarOpen
              ? "translate-x-0"
              : "-translate-x-full md:translate-x-0",
          ].join(" ")}
        >
          {/* Sidebar header */}
          <div className="flex items-center justify-between px-4 py-4 border-b shrink-0">
            <div>
              <h1 className="font-bold text-lg text-gray-900">918Scanner</h1>
              <p className="text-xs text-gray-500">Tulsa Commercial Real Estate</p>
            </div>
            <button
              className="md:hidden p-1 text-gray-400"
              onClick={() => setSidebarOpen(false)}
            >
              <X size={18} />
            </button>
          </div>

          {/* Scrollable content: filters + listings */}
          <div className="flex-1 overflow-y-auto min-h-0">

            {/* ── Filters ── */}
            <div className="p-4 space-y-4 border-b">
              {/* Status row */}
              <div className="flex gap-2 flex-wrap text-xs">
                <span className="px-2 py-1 bg-gray-100 rounded text-gray-600">
                  {filtered.length} of {allProperties.length} listings
                </span>
                {isLoading && (
                  <span className="px-2 py-1 bg-blue-50 rounded text-blue-600">
                    Loading…
                  </span>
                )}
                {error && (
                  <span className="px-2 py-1 bg-red-50 rounded text-red-600">
                    Load error
                  </span>
                )}
              </div>

              {/* Property type */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Property Type
                </label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  value={filters.propertyType}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, propertyType: e.target.value }))
                  }
                >
                  <option value="">All types</option>
                  {PROPERTY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Listing type */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Listing Type
                </label>
                <div className="flex gap-2">
                  {(["", "sale", "lease"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() =>
                        setFilters((f) => ({ ...f, listingType: type }))
                      }
                      className={[
                        "flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                        filters.listingType === type
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-600 border-gray-200 hover:border-gray-300",
                      ].join(" ")}
                    >
                      {type === "" ? "All" : type[0].toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price range */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Price Range ($)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Min"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={filters.minPrice}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, minPrice: e.target.value }))
                    }
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={filters.maxPrice}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, maxPrice: e.target.value }))
                    }
                  />
                </div>
              </div>

              {/* Legend + clear */}
              <div className="flex items-end justify-between">
                <div className="space-y-1 text-xs text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                    Strong (80+)
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0" />
                    Moderate (50–79)
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                    Weak (&lt;50)
                  </div>
                </div>
                {hasFilters && (
                  <button
                    onClick={() => setFilters(DEFAULT_FILTERS)}
                    className="text-xs text-gray-400 hover:text-gray-600 underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>

            {/* ── Listings panel ── */}
            <div className="p-3 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">
                Listings
              </p>

              {isLoading && (
                <p className="text-sm text-gray-400 px-1">Loading…</p>
              )}

              {!isLoading && sortedListings.length === 0 && (
                <p className="text-sm text-gray-400 px-1">No listings found.</p>
              )}

              {sortedListings.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className={[
                    "w-full text-left rounded-xl border p-3 transition-all",
                    "hover:border-blue-300 hover:shadow-sm",
                    selected?.id === p.id
                      ? "border-blue-400 bg-blue-50 shadow-sm"
                      : "border-gray-100 bg-white",
                  ].join(" ")}
                >
                  {/* Address */}
                  <p className="font-semibold text-gray-900 text-xs leading-snug mb-1.5">
                    {p.address}
                  </p>

                  {/* Price + sqft */}
                  <p className="text-sm font-semibold text-gray-800 mb-1">
                    {formatPrice(p.price)}
                    {p.sqft != null && (
                      <span className="font-normal text-gray-400 text-xs ml-1.5">
                        {formatSqft(p.sqft)}
                      </span>
                    )}
                  </p>

                  {/* Badges */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {p.property_type && (
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs font-medium capitalize ${TYPE_BADGE[p.property_type] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {p.property_type}
                      </span>
                    )}
                    {p.listing_type && (
                      <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 capitalize">
                        {p.listing_type}
                      </span>
                    )}
                    <ScoreBadge score={p.value_score} />
                  </div>

                  {/* Broker */}
                  {(p.broker_name || p.broker_phone) && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                      {p.broker_name && <span>{p.broker_name}</span>}
                      {p.broker_phone && (
                        <a
                          href={`tel:${p.broker_phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-0.5 text-blue-500 hover:underline"
                        >
                          <Phone size={11} />
                          {p.broker_phone}
                        </a>
                      )}
                    </div>
                  )}

                  {/* View link */}
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium"
                  >
                    View listing <ExternalLink size={11} />
                  </a>
                </button>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 px-4 py-3 border-t text-xs text-gray-400">
            Updated daily via GitHub Actions
          </div>
        </aside>

        {/* ── Map ── */}
        <main className="flex-1 relative">
          <Map
            properties={filtered}
            selected={selected}
            onSelect={setSelected}
          />
        </main>
      </div>
    </div>
  );
}
