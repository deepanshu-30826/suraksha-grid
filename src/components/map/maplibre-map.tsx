"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GeoJSONSource, LngLatLike } from "maplibre-gl";
import type { LngLat, MapMarker, MarkerKind, RouteId, RouteOption, Segment } from "@/types";
import { LEVELS } from "@/lib/constants";
import { levelOf } from "@/lib/utils";
import { DEFAULT_CENTER, DEFAULT_ZOOM, MAP_STYLE, MAX_FIT_ZOOM } from "@/lib/map/style";
import { MapErrorOverlay, MapLoadingOverlay } from "./map-states";

export interface RouteLine { route: RouteOption; coords: LngLat[] }

interface Props {
  segments?: Segment[];
  selectedSegmentId?: string;
  onSelectSegment?: (id: string) => void;
  routeLines?: RouteLine[];
  selectedRouteId?: RouteId | string;
  onSelectRoute?: (id: RouteId) => void;
  markers?: MapMarker[];
  className?: string;
}

const MARKER_COLOR: Record<MarkerKind, string> = {
  you: "#0E7C86", dest: "#0B1F33", report: "#EA580C", help: "#2563EB",
};

function markerElement(kind: MarkerKind, label: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("aria-label", label);
  el.style.cssText = `width:${kind==="you"?"18":"15"}px;height:${kind==="you"?"18":"15"}px;border-radius:999px;border:2.5px solid white;box-shadow:0 1px 5px rgba(11,31,51,.45);background:${MARKER_COLOR[kind]};cursor:default`;
  return el;
}

function toGeoJSON(segs: Segment[], selectedId?: string) {
  return {
    type: "FeatureCollection" as const,
    features: segs.map((s) => ({
      type: "Feature" as const,
      properties: { id: s.id, color: LEVELS[levelOf(s.score)].hex, selected: s.id === selectedId ? 1 : 0 },
      geometry: { type: "LineString" as const, coordinates: s.coords as number[][] },
    })),
  };
}

function toRouteGeoJSON(lines: RouteLine[], selectedId?: string) {
  return {
    type: "FeatureCollection" as const,
    features: lines.map(({ route, coords }) => ({
      type: "Feature" as const,
      properties: { id: route.id, color: LEVELS[levelOf(route.score)].hex, selected: route.id === selectedId ? 1 : 0 },
      geometry: { type: "LineString" as const, coordinates: coords as number[][] },
    })),
  };
}

/**
 * Reusable MapLibre GL map. Client-only, self-cleans on unmount.
 * Takes the same segment/route/marker data shapes the rest of the app uses
 * so pages hold no MapLibre-specific logic.
 */
export function MapLibreMap({
  segments = [], selectedSegmentId, onSelectSegment,
  routeLines = [], selectedRouteId, onSelectRoute,
  markers = [], className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<InstanceType<typeof maplibregl.Map> | null>(null);
  const markerRefs = useRef<InstanceType<typeof maplibregl.Marker>[]>([]);
  const hasFit = useRef(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retryKey, setRetryKey] = useState(0);

  // ---- init ----
  useEffect(() => {
    if (!containerRef.current) return;
    setStatus("loading");
    hasFit.current = false;
    let map: InstanceType<typeof maplibregl.Map>;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        attributionControl: false,
      });
    } catch {
      setStatus("error");
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }));

    const onLoad = () => setStatus("ready");
    const onError = () => setStatus("error");
    map.on("load", onLoad);
    map.on("error", onError);

    const ro = new ResizeObserver(() => map.resize());
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      markerRefs.current.forEach((m) => m.remove());
      markerRefs.current = [];
      map.off("load", onLoad as (e: unknown) => void);
      map.off("error", onError as (e: unknown) => void);
      map.remove();
      mapRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]);

  // ---- segment layer ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    const fc = toGeoJSON(segments, selectedSegmentId);
    const src = map.getSource("segments") as GeoJSONSource | undefined;
    if (src) { src.setData(fc); return; }
    if (!segments.length) return;
    map.addSource("segments", { type: "geojson", data: fc });
    map.addLayer({ id: "segments-casing", type: "line", source: "segments", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": ["case", ["==", ["get", "selected"], 1], 8, 5] } });
    map.addLayer({ id: "segments-line",   type: "line", source: "segments", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["case", ["==", ["get", "selected"], 1], 5.5, 3.5] } });
    if (onSelectSegment) {
      map.on("click", "segments-line", (e) => {
        const id = e.features?.[0]?.properties?.["id"] as string | undefined;
        if (id) onSelectSegment(id);
      });
      map.on("mouseenter", "segments-line", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "segments-line", () => { map.getCanvas().style.cursor = ""; });
    }
  }, [segments, selectedSegmentId, status, onSelectSegment]);

  // ---- route lines ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    const fc = toRouteGeoJSON(routeLines, selectedRouteId);
    const src = map.getSource("route-lines") as GeoJSONSource | undefined;
    if (src) { src.setData(fc); return; }
    if (!routeLines.length) return;
    map.addSource("route-lines", { type: "geojson", data: fc });
    map.addLayer({ id: "route-casing", type: "line", source: "route-lines", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": ["case", ["==", ["get", "selected"], 1], 9, 5], "line-opacity": ["case", ["==", ["get", "selected"], 1], 1, 0.55] } });
    map.addLayer({ id: "route-line",   type: "line", source: "route-lines", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["case", ["==", ["get", "selected"], 1], 6, 3], "line-opacity": ["case", ["==", ["get", "selected"], 1], 1, 0.5] } });
    if (onSelectRoute) {
      map.on("click", "route-line", (e) => {
        const id = e.features?.[0]?.properties?.["id"] as RouteId | undefined;
        if (id) onSelectRoute(id);
      });
      map.on("mouseenter", "route-line", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "route-line", () => { map.getCanvas().style.cursor = ""; });
    }
  }, [routeLines, selectedRouteId, status, onSelectRoute]);

  // ---- z-order: selected layer always on top ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    if (map.getLayer("route-line")) map.moveLayer("route-line");
    if (map.getLayer("segments-line")) map.moveLayer("segments-line");
  }, [selectedRouteId, selectedSegmentId, status]);

  // ---- markers ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    markerRefs.current.forEach((m) => m.remove());
    markerRefs.current = markers.map((m) =>
      new maplibregl.Marker({ element: markerElement(m.kind, m.label), anchor: "center" })
        .setLngLat([m.lng, m.lat] as LngLatLike)
        .setPopup(new maplibregl.Popup({ offset: 14, closeButton: false }).setText(m.label))
        .addTo(map)
    );
  }, [markers, status]);

  // ---- fit bounds once ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready" || hasFit.current) return;
    const all: LngLat[] = [
      ...segments.flatMap((s) => s.coords),
      ...routeLines.flatMap((r) => r.coords),
      ...markers.map((m): LngLat => [m.lng, m.lat]),
    ];
    if (!all.length) return;
    const bounds = all.reduce(
      (b, c) => b.extend(c as LngLatLike),
      new maplibregl.LngLatBounds(all[0] as LngLatLike, all[0] as LngLatLike)
    );
    map.fitBounds(bounds, { padding: 56, duration: 0, maxZoom: MAX_FIT_ZOOM });
    hasFit.current = true;
  }, [segments, routeLines, markers, status]);

  return (
    <div className={className} style={{ position: "relative" }}>
      <div ref={containerRef} className="h-full w-full" />
      {status === "loading" && <MapLoadingOverlay />}
      {status === "error"   && <MapErrorOverlay onRetry={() => setRetryKey((k) => k + 1)} />}
    </div>
  );
}