"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import type { CircleMarker as LeafletCircleMarker } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Property } from "@/types/property";
import { scoreColor } from "@/lib/colors";

function formatPrice(price: number | null): string {
  if (price == null) return "Price on request";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(price);
}

function extractVerdict(text: string | null): string | null {
  if (!text) return null;
  const section = text.match(/VERDICT[:\s]+(.{0,80})/i)?.[1] ?? text;
  return section.match(/\b(Buy|Watch|Pass)\b/i)?.[1] ?? null;
}

function incomeSnippet(text: string | null): string {
  if (!text) return "";
  // Try to pull the INCOME POTENTIAL sentence; fall back to first 100 chars
  const m = text.match(/INCOME\s+POTENTIAL[:\s]+([^]*?)(?=\d\.\s+[A-Z]{2,}|REDEVELOPMENT|TULSA|VERDICT|$)/i);
  const raw = m ? m[1].replace(/\s+/g, " ").trim() : text.slice(0, 100);
  return raw.length > 100 ? raw.slice(0, 97) + "…" : raw;
}

const VERDICT_COLORS: Record<string, string> = {
  Buy: "#15803d", Watch: "#a16207", Pass: "#b91c1c",
};

// Lives inside MapContainer so it can call useMap()
function SeeDetailsButton({ p, onSelect }: { p: Property; onSelect: (p: Property) => void }) {
  const map = useMap();
  return (
    <button
      onClick={() => { map.closePopup(); onSelect(p); }}
      style={{
        fontSize: 12,
        color: "#2563eb",
        background: "none",
        border: "1px solid #2563eb",
        borderRadius: 5,
        padding: "4px 10px",
        cursor: "pointer",
        fontWeight: 600,
        width: "100%",
        marginTop: 4,
      }}
    >
      See details →
    </button>
  );
}

// Fits the map to show all markers the first time they load.
function FitBounds({ properties }: { properties: Property[] }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current || properties.length === 0) return;
    const bounds = L.latLngBounds(
      properties.map((p) => [p.latitude as number, p.longitude as number])
    );
    map.fitBounds(bounds, { padding: [48, 48] });
    fitted.current = true;
  }, [map, properties]);

  return null;
}

// Flies to selected property and opens its popup after animation.
function FlyAndOpen({
  selected,
  markerRefs,
}: {
  selected: Property | null;
  markerRefs: React.RefObject<Record<string, LeafletCircleMarker>>;
}) {
  const map = useMap();
  const prevId = useRef<string | null>(null);

  useEffect(() => {
    if (!selected || selected.id === prevId.current) return;
    if (selected.latitude == null || selected.longitude == null) return;
    prevId.current = selected.id;
    map.flyTo([selected.latitude, selected.longitude], 16, {
      animate: true,
      duration: 0.7,
    });
    setTimeout(() => {
      markerRefs.current?.[selected.id]?.openPopup();
    }, 800);
  }, [map, selected, markerRefs]);

  return null;
}

interface MapProps {
  properties: Property[];
  selected: Property | null;
  onSelect: (property: Property) => void;
}

const TULSA: [number, number] = [36.1539, -95.9928];

export default function Map({ properties, selected, onSelect }: MapProps) {
  const visible = properties.filter(
    (p) => p.latitude != null && p.longitude != null
  );

  const markerRefs = useRef<Record<string, LeafletCircleMarker>>({});

  return (
    <MapContainer
      center={TULSA}
      zoom={12}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds properties={visible} />
      <FlyAndOpen selected={selected} markerRefs={markerRefs} />

      {visible.map((p) => (
        <CircleMarker
          key={p.id}
          ref={(r) => {
            if (r) markerRefs.current[p.id] = r as unknown as LeafletCircleMarker;
            else delete markerRefs.current[p.id];
          }}
          center={[p.latitude as number, p.longitude as number]}
          radius={12}
          pathOptions={{
            fillColor: scoreColor(p.value_score),
            fillOpacity: 0.85,
            color: selected?.id === p.id ? "#1d4ed8" : "white",
            weight: 2,
          }}
          eventHandlers={{ click: () => onSelect(p) }}
        >
          <Popup>
            <div style={{ minWidth: 190, fontFamily: "inherit" }}>
              <p style={{ fontWeight: 600, marginBottom: 4, lineHeight: 1.3, fontSize: 13 }}>
                {p.address}
              </p>
              <p style={{ color: "#374151", marginBottom: 2, fontSize: 13 }}>
                {formatPrice(p.price)}
              </p>
              <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                {p.property_type && (
                  <span style={{ fontSize: 11, color: "#6b7280", textTransform: "capitalize" }}>
                    {p.property_type}
                  </span>
                )}
                <span style={{ fontSize: 11, fontWeight: 600, color: scoreColor(p.value_score) }}>
                  Score: {p.value_score}
                </span>
              </div>
              {p.ai_rationale && (() => {
                const verdict = extractVerdict(p.ai_rationale);
                const snippet = incomeSnippet(p.ai_rationale);
                const vColor  = verdict ? VERDICT_COLORS[verdict] ?? "#374151" : null;
                return (
                  <div style={{
                    background: "#f9fafb", borderRadius: 6,
                    padding: "6px 8px", marginBottom: 6,
                  }}>
                    {verdict && (
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                        <span style={{ fontSize: 10 }}>✨</span>
                        <span style={{
                          fontSize: 11, fontWeight: 700,
                          color: vColor ?? "#374151",
                          background: vColor ? vColor + "15" : "#f3f4f6",
                          padding: "1px 6px", borderRadius: 4,
                        }}>
                          {verdict}
                        </span>
                      </div>
                    )}
                    {snippet && (
                      <p style={{ fontSize: 11, color: "#4b5563", lineHeight: 1.5, margin: 0 }}>
                        {snippet}
                      </p>
                    )}
                  </div>
                );
              })()}
              <SeeDetailsButton p={p} onSelect={onSelect} />
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
