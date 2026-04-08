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
            <div style={{ minWidth: 170 }}>
              <p style={{ fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>
                {p.address}
              </p>
              <p style={{ color: "#374151", marginBottom: 2 }}>
                {formatPrice(p.price)}
              </p>
              {p.property_type && (
                <p style={{ color: "#6b7280", fontSize: 12, textTransform: "capitalize" }}>
                  {p.property_type}
                </p>
              )}
              <p style={{ color: scoreColor(p.value_score), fontWeight: 600, fontSize: 12, marginTop: 4 }}>
                Score: {p.value_score}
              </p>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
