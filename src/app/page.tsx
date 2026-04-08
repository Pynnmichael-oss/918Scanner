"use client";

import { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import useSWR from "swr";
import { supabase } from "@/lib/supabase";
import type { Property, Filters } from "@/types/property";
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

async function fetchProperties(): Promise<Property[]> {
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .order("value_score", { ascending: false });
  if (error) throw error;
  return (data as Property[]) || [];
}

function formatPrice(price: number | null): string {
  if (price == null) return "Price N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatSqft(sqft: number | null): string {
  if (sqft == null) return "Sqft N/A";
  return new Intl.NumberFormat("en-US").format(sqft) + " sqft";
}

function scoreLabel(score: number): { label: string; cls: string } {
  if (score >= 80) return { label: "Strong Deal", cls: "text-green-700 bg-green-50" };
  if (score >= 50) return { label: "Moderate", cls: "text-yellow-700 bg-yellow-50" };
  return { label: "Weak", cls: "text-red-700 bg-red-50" };
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

        {/* Sidebar */}
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

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
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
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
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
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
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
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
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

            {/* Clear filters */}
            {hasFilters && (
              <button
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 border border-dashed border-gray-300 rounded-lg transition-colors"
              >
                Clear filters
              </button>
            )}

            {/* Legend */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Value Score
              </label>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-green-500 shrink-0" />
                  <span className="text-gray-600">Strong Deal (80+)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-yellow-400 shrink-0" />
                  <span className="text-gray-600">Moderate (50–79)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
                  <span className="text-gray-600">Weak (&lt;50)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Last scan time placeholder */}
          <div className="shrink-0 px-4 py-3 border-t text-xs text-gray-400">
            Updated daily via GitHub Actions
          </div>
        </aside>

        {/* Map */}
        <main className="flex-1 relative">
          <Map
            properties={filtered}
            selected={selected}
            onSelect={setSelected}
          />
        </main>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="fixed bottom-0 inset-x-0 md:left-72 z-50 bg-white border-t shadow-2xl rounded-t-2xl md:rounded-none max-h-[55vh] overflow-y-auto">
          <div className="p-4">
            {/* Handle bar (mobile) */}
            <div className="md:hidden w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm leading-snug">
                  {selected.address}
                </p>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {selected.property_type && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full capitalize">
                      {selected.property_type}
                    </span>
                  )}
                  {selected.listing_type && (
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full capitalize">
                      For {selected.listing_type}
                    </span>
                  )}
                  {(() => {
                    const { label, cls } = scoreLabel(selected.value_score);
                    return (
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${cls}`}>
                        {label} · {selected.value_score}
                      </span>
                    );
                  })()}
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="p-1 text-gray-400 hover:text-gray-600 shrink-0"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400">Price</p>
                <p className="font-semibold text-gray-900 text-sm mt-0.5">
                  {formatPrice(selected.price)}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400">Size</p>
                <p className="font-semibold text-gray-900 text-sm mt-0.5">
                  {formatSqft(selected.sqft)}
                </p>
              </div>
            </div>

            {(selected.broker_name || selected.broker_phone) && (
              <div className="mt-3 flex items-center gap-3 text-sm">
                {selected.broker_name && (
                  <span className="text-gray-700">{selected.broker_name}</span>
                )}
                {selected.broker_phone && (
                  <a
                    href={`tel:${selected.broker_phone}`}
                    className="flex items-center gap-1 text-blue-600 hover:underline"
                  >
                    <Phone size={13} />
                    {selected.broker_phone}
                  </a>
                )}
              </div>
            )}

            <div className="mt-4">
              <a
                href={selected.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
              >
                View on {selected.source === "crexi" ? "Crexi" : "Brevitas"}
                <ExternalLink size={13} />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
