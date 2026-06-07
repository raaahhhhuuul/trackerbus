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

export function GlobalChennaiMap({ className }: { className?: string }) {
  const [leafletReady, setLeafletReady] = useState(false);
  const [reactLeaflet, setReactLeaflet] = useState<ReactLeafletModule | null>(null);
  const [leafletModule, setLeafletModule] = useState<LeafletModule | null>(null);
  const session = getSession();
  const isStudentView = session?.role === "student";
  const { busInfo } = useStudentBus();
  const driverUserIdForMap = isStudentView ? (busInfo?.driverUserId ?? null) : undefined;
  const { tracking } = useLiveTracking(driverUserIdForMap);
  const { location: studentLocation } = useStudentLocation({
    enabled: isStudentView,
    watch: isStudentView,
  });
  const { route } = useStudentRouteFeed();

  useEffect(() => {
    let isMounted = true;

    const setupMap = async () => {
      if (typeof window === "undefined") return;

      const [leaflet, rl] = await Promise.all([import("leaflet"), import("react-leaflet")]);

      // Fix default marker assets in bundlers.
      delete (leaflet.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
      leaflet.Icon.Default.mergeOptions({
        iconRetinaUrl: new URL(
          "leaflet/dist/images/marker-icon-2x.png",
          import.meta.url,
        ).toString(),
        iconUrl: new URL("leaflet/dist/images/marker-icon.png", import.meta.url).toString(),
        shadowUrl: new URL("leaflet/dist/images/marker-shadow.png", import.meta.url).toString(),
      });

      if (!isMounted) return;
      setLeafletModule(leaflet);
      setReactLeaflet(rl);
      setLeafletReady(true);
    };

    void setupMap();

    return () => {
      isMounted = false;
    };
  }, []);

  const mapContainerClasses = useMemo(
    () => className ?? "h-full w-full overflow-hidden rounded-none bg-card",
    [className],
  );

  const busIcon = useMemo(() => {
    if (!leafletModule) return null;
    return leafletModule.divIcon({
      className: "",
      html:
        "<div style='position:relative;width:36px;height:44px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 7px 12px rgba(2,6,23,.45));'>" +
        "<div style='position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:10px solid #f97316;'></div>" +
        "<svg width='30' height='30' viewBox='0 0 64 64' fill='none' xmlns='http://www.w3.org/2000/svg' style='position:absolute;top:2px;left:50%;transform:translateX(-50%);'>" +
        "<rect x='8' y='8' width='48' height='38' rx='10' fill='#f97316' stroke='#7c2d12' stroke-width='3'/>" +
        "<rect x='14' y='14' width='36' height='10' rx='3' fill='#bae6fd'/>" +
        "<rect x='14' y='27' width='14' height='8' rx='2' fill='#ffedd5'/>" +
        "<rect x='31' y='27' width='19' height='8' rx='2' fill='#ffedd5'/>" +
        "<circle cx='20' cy='46' r='5' fill='#111827' stroke='#374151' stroke-width='2'/>" +
        "<circle cx='44' cy='46' r='5' fill='#111827' stroke='#374151' stroke-width='2'/>" +
        "</svg>" +
        "</div>",
      iconSize: [36, 44],
      iconAnchor: [18, 41],
      popupAnchor: [0, -36],
    });
  }, [leafletModule]);

  const studentIcon = useMemo(() => {
    if (!leafletModule) return null;

    return leafletModule.divIcon({
      className: "",
      html: "<div style='position:relative;width:14px;height:14px;border-radius:9999px;background:#d7c2c2;border:2px solid rgba(80,46,46,.9);box-shadow:0 0 0 4px rgba(126,86,86,.2);'></div>",
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -10],
    });
  }, [leafletModule]);

  if (!leafletReady || !reactLeaflet) {
    return (
      <div className={mapContainerClasses}>
        <div className="flex h-full w-full items-center justify-center bg-surface text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Loading Chennai map...
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
      const current = map.getCenter();
      const latDiff = Math.abs(current.lat - center[0]);
      const lngDiff = Math.abs(current.lng - center[1]);
      if (latDiff < 0.0001 && lngDiff < 0.0001) return;
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
    <div className={mapContainerClasses}>
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
            pathOptions={{ color: "#8f4b4b", weight: 4, opacity: 0.9 }}
          />
        ) : null}
        <SyncMapCenter center={mapCenter} />
        <FollowLiveBus position={markerPosition} active={Boolean(tracking?.isActive)} />
        {isStudentView ? (
          <FocusStudentRoute path={routePath} active={Boolean(tracking?.isActive)} />
        ) : null}
        <ZoomControl position="bottomright" />
        <Marker position={markerPosition} icon={busIcon ?? undefined}>
          <Popup>
            <div className="space-y-0.5 text-xs">
              <p className="font-semibold">PulseRide Bus</p>
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
                <p className="font-semibold">Your Location</p>
                <p>Lat: {studentPosition[0].toFixed(5)}</p>
                <p>Lng: {studentPosition[1].toFixed(5)}</p>
              </div>
            </Popup>
          </Marker>
        ) : null}
      </MapContainer>
      <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-background/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-foreground">
        Chennai Live Transit Map
      </div>
    </div>
  );
}
