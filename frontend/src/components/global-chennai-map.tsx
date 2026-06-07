import { useEffect, useMemo, useState } from "react";
import "leaflet/dist/leaflet.css";
import { useLiveTracking } from "@/hooks/use-live-tracking";
import { useStudentLocation } from "@/hooks/use-student-location";
import { useStudentRouteFeed } from "@/hooks/use-student-route-feed";
import { useStudentBus } from "@/hooks/use-student-bus";
import { getSession } from "@/lib/auth";

type ReactLeafletModule = typeof import("react-leaflet");
type LeafletModule = typeof import("leaflet");

const CHENNAI_CENTER: [number, number] = [13.0827, 80.2707];
const BUS_MARKER: [number, number] = [13.0674, 80.2376];

export function GlobalChennaiMap({
  className,
  driverUserIdOverride,
}: {
  className?: string;
  /** When set, tracks this driver instead of the student's default assigned driver. */
  driverUserIdOverride?: string | null;
}) {
  const [leafletReady, setLeafletReady] = useState(false);
  const [reactLeaflet, setReactLeaflet] = useState<ReactLeafletModule | null>(null);
  const [leafletModule, setLeafletModule] = useState<LeafletModule | null>(null);
  const session = getSession();
  const isStudentView = session?.role === "student";
  const { busInfo } = useStudentBus();
  // driverUserIdOverride takes priority when explicitly passed (even as null)
  const driverUserIdForMap = isStudentView
    ? (driverUserIdOverride !== undefined ? driverUserIdOverride : (busInfo?.driverUserId ?? null))
    : undefined;
  const { tracking } = useLiveTracking(driverUserIdForMap);
  const { location: studentLocation } = useStudentLocation({
    enabled: isStudentView,
    watch: isStudentView,
  });
  const { route } = useStudentRouteFeed();

  useEffect(() => {
    let isMounted = true;
    const setup = async () => {
      if (typeof window === "undefined") return;
      const [leaflet, rl] = await Promise.all([import("leaflet"), import("react-leaflet")]);
      delete (leaflet.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
      leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: new URL("leaflet/dist/images/marker-icon-2x.png", import.meta.url).toString(),
        iconUrl: new URL("leaflet/dist/images/marker-icon.png", import.meta.url).toString(),
        shadowUrl: new URL("leaflet/dist/images/marker-shadow.png", import.meta.url).toString(),
      });
      if (!isMounted) return;
      setLeafletModule(leaflet);
      setReactLeaflet(rl);
      setLeafletReady(true);
    };
    void setup();
    return () => { isMounted = false; };
  }, []);

  /* Always include `relative` so the label overlay positions correctly.
     The passed className overrides the layout but we always prepend relative. */
  const outerClass = useMemo(
    () => className
      ? `relative ${className}`
      : "relative h-full w-full overflow-hidden rounded-none",
    [className],
  );

  const busIcon = useMemo(() => {
    if (!leafletModule) return null;
    return leafletModule.divIcon({
      className: "",
      html:
        "<div style='position:relative;width:36px;height:44px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 6px 10px rgba(2,6,23,.5));'>" +
        "<div style='position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:11px solid #06b6d4;'></div>" +
        "<svg width='32' height='32' viewBox='0 0 64 64' fill='none' xmlns='http://www.w3.org/2000/svg' style='position:absolute;top:2px;left:50%;transform:translateX(-50%);filter:drop-shadow(0 0 8px rgba(6,182,212,0.8));'>" +
        "<rect x='8' y='8' width='48' height='36' rx='9' fill='#06b6d4' stroke='#0891b2' stroke-width='2.5'/>" +
        "<rect x='12' y='13' width='40' height='11' rx='3' fill='rgba(255,255,255,0.25)'/>" +
        "<rect x='12' y='27' width='18' height='8' rx='2' fill='rgba(255,255,255,0.18)'/>" +
        "<rect x='34' y='27' width='18' height='8' rx='2' fill='rgba(255,255,255,0.18)'/>" +
        "<circle cx='20' cy='44' r='5' fill='#111827' stroke='#374151' stroke-width='1.5'/>" +
        "<circle cx='44' cy='44' r='5' fill='#111827' stroke='#374151' stroke-width='1.5'/>" +
        "</svg></div>",
      iconSize: [36, 44],
      iconAnchor: [18, 41],
      popupAnchor: [0, -36],
    });
  }, [leafletModule]);

  const studentIcon = useMemo(() => {
    if (!leafletModule) return null;
    return leafletModule.divIcon({
      className: "",
      html: "<div style='position:relative;width:16px;height:16px;border-radius:9999px;background:#3b82f6;border:3px solid rgba(255,255,255,0.9);box-shadow:0 0 12px rgba(59,130,246,0.8);'></div>",
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      popupAnchor: [0, -10],
    });
  }, [leafletModule]);

  if (!leafletReady || !reactLeaflet) {
    return (
      <div className={outerClass}>
        <div className="flex h-full w-full items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Loading map...
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { MapContainer, Marker, Polyline, Popup, TileLayer, ZoomControl, useMap } = reactLeaflet;
  const markerPosition: [number, number] = tracking
    ? [tracking.latitude, tracking.longitude]
    : BUS_MARKER;
  const studentPosition: [number, number] | null = studentLocation
    ? [studentLocation.latitude, studentLocation.longitude]
    : null;
  const routePath = isStudentView ? (route?.path ?? []) : [];
  const mapCenter: [number, number] =
    isStudentView && studentPosition
      ? studentPosition
      : tracking?.isActive
        ? markerPosition
        : CHENNAI_CENTER;

  /* Forces Leaflet to recalculate its container dimensions after mount — fixes
     the "tiles doubled" bug that appears when the container size isn't known
     at the exact moment Leaflet first renders. */
  function MapSizeGuard() {
    const map = useMap();
    useEffect(() => {
      const t = window.setTimeout(() => map.invalidateSize(), 80);
      return () => window.clearTimeout(t);
    }, [map]);
    return null;
  }

  function FollowLiveBus({ position, active }: { position: [number, number]; active: boolean }) {
    const map = useMap();
    useEffect(() => {
      if (!active) return;
      map.panTo(position, { animate: true, duration: 0.8 });
    }, [active, map, position]);
    return null;
  }

  function SyncMapCenter({ center }: { center: [number, number] }) {
    const map = useMap();
    useEffect(() => {
      const c = map.getCenter();
      if (Math.abs(c.lat - center[0]) < 0.0001 && Math.abs(c.lng - center[1]) < 0.0001) return;
      map.setView(center, map.getZoom(), { animate: true });
    }, [center, map]);
    return null;
  }

  function FocusStudentRoute({ path, active }: { path: Array<[number, number]>; active: boolean }) {
    const map = useMap();
    useEffect(() => {
      if (!active || path.length < 2) return;
      map.fitBounds(path, { padding: [36, 36], maxZoom: 14, animate: true });
    }, [active, map, path]);
    return null;
  }

  return (
    <div className={outerClass}>
      <MapContainer
        center={mapCenter}
        zoom={12}
        scrollWheelZoom={false}
        zoomControl={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {isStudentView && routePath.length > 1 ? (
          <Polyline
            positions={routePath}
            pathOptions={{ color: "#06b6d4", weight: 3, opacity: 0.8, dashArray: "8 5" }}
          />
        ) : null}
        <MapSizeGuard />
        <SyncMapCenter center={mapCenter} />
        <FollowLiveBus position={markerPosition} active={Boolean(tracking?.isActive)} />
        {isStudentView ? (
          <FocusStudentRoute path={routePath} active={Boolean(tracking?.isActive)} />
        ) : null}
        <ZoomControl position="bottomright" />
        <Marker position={markerPosition} icon={busIcon ?? undefined}>
          <Popup>
            <div className="space-y-0.5 text-xs">
              <p className="font-bold">{busInfo?.busNumber ?? "Bus"}</p>
              <p>Status: {tracking?.isActive ? "On Trip" : "Waiting"}</p>
              <p>Speed: {tracking ? `${tracking.speedKmh.toFixed(0)} km/h` : "0 km/h"}</p>
              <p>Distance: {tracking ? `${tracking.distanceKm.toFixed(2)} km` : "0.00 km"}</p>
            </div>
          </Popup>
        </Marker>
        {isStudentView && studentPosition ? (
          <Marker position={studentPosition} icon={studentIcon ?? undefined}>
            <Popup>
              <div className="space-y-0.5 text-xs">
                <p className="font-bold">Your Location</p>
                <p>{studentPosition[0].toFixed(5)}°, {studentPosition[1].toFixed(5)}°</p>
              </div>
            </Popup>
          </Marker>
        ) : null}
      </MapContainer>
    </div>
  );
}
