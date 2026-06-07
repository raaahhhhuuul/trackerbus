import { useEffect, useMemo, useState } from "react";
import "leaflet/dist/leaflet.css";

type ReactLeafletModule = typeof import("react-leaflet");
type LeafletModule = typeof import("leaflet");

const CHENNAI_CENTER: [number, number] = [13.0827, 80.2707];

export function DriverPositionMap({
  coords,
  active,
}: {
  coords: { lat: number; lng: number } | null;
  active: boolean;
}) {
  const [ready, setReady] = useState(false);
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
      setReady(true);
    };
    void load();
    return () => { mounted = false; };
  }, []);

  const driverIcon = useMemo(() => {
    if (!L) return null;
    const color = active ? "#22c55e" : "#64748b";
    const glow = active ? "0 0 16px rgba(34,197,94,0.9)" : "none";
    const ring = active
      ? `<div style="position:absolute;inset:-7px;border-radius:9999px;border:2px solid rgba(34,197,94,0.5);animation:pulse-ring 2s ease-out infinite"></div>`
      : "";
    return L.divIcon({
      className: "",
      html:
        `<div style="position:relative;width:20px;height:20px;display:flex;align-items:center;justify-content:center;">` +
        ring +
        `<div style="width:20px;height:20px;border-radius:9999px;background:${color};border:3px solid rgba(255,255,255,0.9);box-shadow:${glow};"></div>` +
        `</div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
      popupAnchor: [0, -13],
    });
  }, [L, active]);

  if (!ready || !rl || !L) {
    return (
      <div className="h-[220px] overflow-hidden rounded-2xl border border-border/50 bg-muted/30 flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const { MapContainer, Marker, Popup, TileLayer, ZoomControl, useMap } = rl;
  const center: [number, number] = coords ? [coords.lat, coords.lng] : CHENNAI_CENTER;

  function MapGuard() {
    const map = useMap();
    useEffect(() => {
      const t = window.setTimeout(() => map.invalidateSize(), 80);
      return () => window.clearTimeout(t);
    }, [map]);
    return null;
  }

  function FollowDriver({ pos }: { pos: [number, number] | null }) {
    const map = useMap();
    useEffect(() => {
      if (!pos) return;
      const c = map.getCenter();
      if (Math.abs(c.lat - pos[0]) > 0.0001 || Math.abs(c.lng - pos[1]) > 0.0001) {
        map.panTo(pos, { animate: true, duration: 0.8 });
      }
    }, [pos, map]);
    return null;
  }

  return (
    <div className="h-[220px] overflow-hidden rounded-2xl border border-border/50 relative">
      <MapContainer
        center={center}
        zoom={15}
        scrollWheelZoom={false}
        zoomControl={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <MapGuard />
        <ZoomControl position="bottomright" />
        {coords && (
          <Marker position={[coords.lat, coords.lng]} icon={driverIcon ?? undefined}>
            <Popup>
              <div className="space-y-0.5 text-xs">
                <p className="font-bold">{active ? "Live Position" : "Last Known"}</p>
                <p>{coords.lat.toFixed(5)}°, {coords.lng.toFixed(5)}°</p>
              </div>
            </Popup>
          </Marker>
        )}
        <FollowDriver pos={coords ? [coords.lat, coords.lng] : null} />
      </MapContainer>

      {/* Status badge overlay */}
      <div className="pointer-events-none absolute left-2 top-2 z-[500]">
        {active ? (
          <div className="glass rounded-lg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-success flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success status-online" />
            Live GPS
          </div>
        ) : (
          <div className="glass rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            GPS Off
          </div>
        )}
      </div>
    </div>
  );
}
