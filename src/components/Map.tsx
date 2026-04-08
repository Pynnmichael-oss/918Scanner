"use client";

import { MapContainer, TileLayer, CircleMarker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Property } from "@/types/property";

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 50) return "#eab308";
  return "#ef4444";
}

interface MapProps {
  properties: Property[];
  selected: Property | null;
  onSelect: (property: Property) => void;
}

// Tulsa, OK
const TULSA: [number, number] = [36.1539, -95.9928];

export default function Map({ properties, selected, onSelect }: MapProps) {
  const visible = properties.filter(
    (p) => p.lat != null && p.lng != null
  );

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
      {visible.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={selected?.id === p.id ? 12 : 8}
          pathOptions={{
            fillColor: scoreColor(p.value_score),
            fillOpacity: 0.9,
            color: selected?.id === p.id ? "#1d4ed8" : "white",
            weight: selected?.id === p.id ? 3 : 2,
          }}
          eventHandlers={{ click: () => onSelect(p) }}
        />
      ))}
    </MapContainer>
  );
}
