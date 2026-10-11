"use client";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { HelpList } from "@/components/help/help-list";
import { MapLayout } from "@/components/map/map-layout";
import { MapLibreMap } from "@/components/map/maplibre-map";
import { Chip, EmptyState, Skeleton } from "@/components/ui/card";
import { getHelpPoints } from "@/lib/services/help";
import { useGeolocation } from "@/lib/location";
import type { HelpKind, HelpPoint, MapMarker } from "@/types";

const FILTERS: { k: HelpKind | "all"; l: string }[] = [
  { k: "all", l: "All" },
  { k: "police", l: "Police" },
  { k: "hospital", l: "Hospitals" },
  { k: "help", l: "Help points" },
];

export default function HelpPage() {
  const [f, setF] = useState<HelpKind | "all">("all");
  const [points, setPoints] = useState<HelpPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const {
    lngLat: userLngLat,
    isLoading: geoLoading,
  } = useGeolocation({ autoRequest: true });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    const lng = userLngLat ? userLngLat[0] : undefined;
    const lat = userLngLat ? userLngLat[1] : undefined;

    getHelpPoints(lng, lat)
      .then((data) => {
        if (!alive) return;
        setPoints(data);
        setLoading(false);
      })
      .catch((err) => {
        if (alive) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load emergency help points. Please check connection."
          );
          setLoading(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [userLngLat, reloadKey]);

  const filtered = useMemo(
    () =>
      points
        .filter((p) => f === "all" || p.kind === f)
        .sort((a, b) => {
          if (!userLngLat) return 0;
          return a.distanceKm - b.distanceKm;
        }),
    [points, f, userLngLat],
  );

  const helpMarkers: MapMarker[] = useMemo(
    () => [
      ...(userLngLat
        ? [
            {
              id: "you",
              x: 0,
              y: 0,
              lng: userLngLat[0],
              lat: userLngLat[1],
              kind: "you" as const,
              label: "You (GPS)",
            },
          ]
        : []),
      ...filtered.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        lng: p.lng,
        lat: p.lat,
        kind: "help" as const,
        label: p.name,
      })),
    ],
    [filtered, userLngLat],
  );

  return (
    <MapLayout
      map={
        <MapLibreMap
          className="h-full w-full"
          markers={helpMarkers}
          segments={[]}
        />
      }
      panel={
        <div className="space-y-3">
          <div>
            <h1 className="text-xl font-bold">Nearby help</h1>
            <p className="mt-0.5 text-xs">
              {userLngLat ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-safer">
                  <span className="inline-block h-2 w-2 rounded-full bg-safer" />
                  Live GPS Location · Distances measured from your position
                </span>
              ) : geoLoading ? (
                <span className="inline-flex items-center gap-1.5 text-muted">
                  <Loader2 className="h-3 w-3 animate-spin text-brand" />
                  Acquiring your GPS position…
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-muted">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                  Location unavailable · Distance sorting requires GPS
                </span>
              )}
            </p>
          </div>

          <div className="flex gap-2 overflow-x-auto">
            {FILTERS.map((x) => (
              <Chip
                key={x.k}
                active={f === x.k}
                onClick={() => setF(x.k)}
                className="shrink-0"
              >
                {x.l}
              </Chip>
            ))}
          </div>

          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-concern/30 bg-concern/5 p-4 text-xs text-concern space-y-2">
              <p className="font-semibold">Unable to load emergency help points</p>
              <p>{error}</p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="rounded-lg bg-concern text-white px-3 py-1 font-semibold text-xs"
              >
                Retry
              </button>
            </div>
          ) : filtered.length ? (
            <HelpList points={filtered} />
          ) : (
            <EmptyState
              title="Nothing nearby"
              hint={`No ${f === "all" ? "emergency services" : f} found in this category.`}
            />
          )}
        </div>
      }
    />
  );
}
