import { useEffect, useMemo, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { AdminBus, DriverPosition } from "@/lib/admin-console";

type ReactLeafletModule = typeof import("react-leaflet");
type LeafletModule = typeof import("leaflet");

const CHENNAI_CENTER: [number, number] = [12.9716, 80.1376];

const ROUTE_CENTERS: Record<string, [number, number]> = {
  "SRM Main Gate":    [12.8231, 80.0444],
  "Potheri Station":  [12.8167, 80.0424],
  "Guduvanchery":     [12.8447, 79.9801],
  "Tambaram":         [12.9249, 80.1000],
  "Chromepet":        [12.9516, 80.1462],
  "Velachery":        [12.9815, 80.2209],
  "Madhya Kailash":   [13.0065, 80.2414],
  "Sholinganallur":   [12.9009, 80.2273],
};

function getDefaultPosition(routeName: string, busIndex: number): [number, number] {
  const base = ROUTE_CENTERS[routeName] ?? CHENNAI_CENTER;
  const spread = 0.0025;
  const angle = (busIndex * 137.5 * Math.PI) / 180;
  const r = spread * (0.5 + (busIndex % 3) * 0.5);
  return [base[0] + r * Math.cos(angle), base[1] + r * Math.sin(angle)];
}

export interface FleetMapProps {
  buses: AdminBus[];
  driverPositions: Record<string, DriverPosition>;
  adminLocation: { lat: number; lng: number } | null;
  selectedBusId: string | null;
  onBusClick: (busId: string) => void;
  className?: string;
}

export function AdminFleetMap({
  buses,
  driverPositions,
  adminLocation,
  selectedBusId,
  onBusClick,
  className,
}: FleetMapProps) {
  const [leafletReady, setLeafletReady] = useState(false);
  const [rl, setRl] = useState<ReactLeafletModule | null>(null);
  const [L, setL] = useState<LeafletModule | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [leaflet, reactLeaflet] = await Promise.all([import("leaflet"), import("react-leaflet")]);
      delete (leaflet.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
      leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: new URL("leaflet/dist/images/marker-icon-2x.png", import.meta.url).toString(),
        iconUrl: new URL("leaflet/dist/images/marker-icon.png", import.meta.url).toString(),
        shadowUrl: new URL("leaflet/dist/images/marker-shadow.png", import.meta.url).toString(),
      });
      if (!mounted) return;
      setL(leaflet);
      setRl(reactLeaflet);
      setLeafletReady(true);
    };
    void load();
    return () => { mounted = false; };
  }, []);

  const routeCounters = useMemo(() => {
    const counters: Record<string, number> = {};
    return buses.map((bus) => {
      const key = bus.routeName;
      counters[key] = (counters[key] ?? 0) + 1;
      return counters[key] - 1;
    });
  }, [buses]);

  const busMarkerIcon = useMemo(() => {
    if (!L) return null;
    return (isActive: boolean, isSelected: boolean) => {
      const color = isActive ? "#06b6d4" : "#2a3855";
      const stroke = isActive ? "#0891b2" : "#3a4f6a";
      const glow = isActive ? "drop-shadow(0 0 8px rgba(6,182,212,0.9))" : "none";
      const size = isSelected ? 38 : isActive ? 32 : 26;
      const ring = isSelected
        ? `<div style="position:absolute;inset:-8px;border-radius:50%;border:2px solid #06b6d4;opacity:0.8;animation:pulse-ring 1.5s ease-out infinite"></div>`
        : isActive
        ? `<div style="position:absolute;inset:-6px;border-radius:50%;border:1.5px solid rgba(6,182,212,0.5);animation:pulse-ring 2.5s ease-out infinite"></div>`
        : "";

      return L.divIcon({
        className: "",
        html:
          `<div style="position:relative;width:${size}px;height:${size + 8}px;display:flex;align-items:center;justify-content:center">` +
          ring +
          `<div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:0;height:0;border-left:${size * 0.2}px solid transparent;border-right:${size * 0.2}px solid transparent;border-top:${size * 0.3}px solid ${color}"></div>` +
          `<svg width="${size}" height="${size}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style="position:absolute;top:0;filter:${glow}">` +
          `<rect x="8" y="8" width="48" height="36" rx="9" fill="${color}" stroke="${stroke}" stroke-width="2.5"/>` +
          `<rect x="12" y="13" width="40" height="12" rx="3" fill="${isActive ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.06)"}"/>` +
          `<rect x="12" y="28" width="18" height="9" rx="2" fill="${isActive ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.05)"}"/>` +
          `<rect x="34" y="28" width="18" height="9" rx="2" fill="${isActive ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.05)"}"/>` +
          `<circle cx="20" cy="44" r="5" fill="#111827" stroke="#374151" stroke-width="1.5"/>` +
          `<circle cx="44" cy="44" r="5" fill="#111827" stroke="#374151" stroke-width="1.5"/>` +
          `</svg>` +
          `</div>`,
        iconSize: [size, size + 8],
        iconAnchor: [size / 2, size + 8],
        popupAnchor: [0, -(size + 10)],
      });
    };
  }, [L]);

  const adminMarkerIcon = useMemo(() => {
    if (!L) return null;
    return L.divIcon({
      className: "",
      html:
        `<div style="position:relative;width:28px;height:28px;display:flex;align-items:center;justify-content:center">` +
        `<div style="position:absolute;inset:-6px;border-radius:50%;background:rgba(59,130,246,0.2);animation:pulse-ring 2s ease-out infinite"></div>` +
        `<div style="width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid rgba(255,255,255,0.9);box-shadow:0 0 16px rgba(59,130,246,0.8)"></div>` +
        `</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -16],
    });
  }, [L]);

  /* Always include explicit h-full so Leaflet container has measured pixel height */
  const wrapperClass = className ?? "h-full w-full";

  if (!leafletReady || !rl || !L || !busMarkerIcon || !adminMarkerIcon) {
    return (
      <div className={`${wrapperClass} flex items-center justify-center bg-background`}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Loading Fleet Map
          </p>
        </div>
      </div>
    );
  }

  const { MapContainer, Marker, TileLayer, ZoomControl, Popup, useMap } = rl;

  /* Fixes "tiles doubled" bug — forces Leaflet to recalculate container size after mount */
  function MapSizeGuard() {
    const map = useMap();
    useEffect(() => {
      const t = window.setTimeout(() => map.invalidateSize(), 80);
      return () => window.clearTimeout(t);
    }, [map]);
    return null;
  }

  const activeBusCount = buses.filter(
    (b) => b.assignedDriverId && driverPositions[b.assignedDriverId]?.isActive,
  ).length;

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={CHENNAI_CENTER}
        zoom={11}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <MapSizeGuard />
        <ZoomControl position="bottomright" />

        {/* All bus markers */}
        {buses.map((bus, i) => {
          const livPos = bus.assignedDriverId ? driverPositions[bus.assignedDriverId] : null;
          const isLive = Boolean(livPos?.isActive);
          const isSelected = bus.id === selectedBusId;
          const pos: [number, number] = livPos
            ? [livPos.lat, livPos.lng]
            : getDefaultPosition(bus.routeName, routeCounters[i]);

          return (
            <Marker
              key={bus.id}
              position={pos}
              icon={busMarkerIcon(isLive, isSelected)}
              eventHandlers={{ click: () => onBusClick(bus.id) }}
            >
              <Popup>
                <div className="space-y-1 text-xs min-w-[160px]">
                  <p className="font-bold text-sm">{bus.busNumber}</p>
                  <p className="text-muted-foreground">{bus.routeName}</p>
                  <p className="text-muted-foreground">{bus.plate}</p>
                  {isLive && livPos ? (
                    <p className="text-accent font-semibold">
                      Live · {livPos.speedKmh.toFixed(0)} km/h
                    </p>
                  ) : (
                    <p className="text-muted-foreground">No active trip</p>
                  )}
                  {bus.assignedDriverName && (
                    <p className="text-muted-foreground">Driver: {bus.assignedDriverName}</p>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Admin location marker */}
        {adminLocation && (
          <Marker position={[adminLocation.lat, adminLocation.lng]} icon={adminMarkerIcon}>
            <Popup>
              <div className="space-y-0.5 text-xs">
                <p className="font-bold">You (Admin)</p>
                <p className="text-muted-foreground">
                  {adminLocation.lat.toFixed(5)}°, {adminLocation.lng.toFixed(5)}°
                </p>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Live stats overlay */}
      <div className="pointer-events-none absolute left-3 top-3 z-[500] flex flex-col gap-2">
        <div className="glass rounded-xl px-3 py-2 text-xs font-semibold">
          <span className="text-muted-foreground">Fleet</span>
          <span className="ml-1.5 font-bold text-foreground">{buses.length} buses</span>
        </div>
        {activeBusCount > 0 && (
          <div className="glass rounded-xl px-3 py-2 text-xs font-semibold">
            <span className="inline-block h-2 w-2 rounded-full status-online mr-1.5" />
            <span className="font-bold text-accent">{activeBusCount} live</span>
          </div>
        )}
        {adminLocation && (
          <div className="glass rounded-xl px-3 py-2 text-xs font-semibold text-primary">
            Your location active
          </div>
        )}
      </div>
    </div>
  );
}
