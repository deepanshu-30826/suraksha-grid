"use client";
import { useEffect, useMemo, useState } from "react";
import { HelpList } from "@/components/help/help-list";
import { MapLayout } from "@/components/map/map-layout";
import { MapLibreMap } from "@/components/map/maplibre-map";
import { Chip, EmptyState, Skeleton } from "@/components/ui/card";
import { getHelpPoints } from "@/lib/services/help";
import { ORIGIN } from "@/lib/mock-data";
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

  useEffect(() => {
    let alive = true;

    getHelpPoints(ORIGIN[0], ORIGIN[1])
      .then((data) => {
        if (!alive) return;
        setPoints(data);
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(
    () =>
      points
        .filter((p) => f === "all" || p.kind === f)
        .sort((a, b) => a.distanceKm - b.distanceKm),
    [points, f],
  );

  const helpMarkers: MapMarker[] = useMemo(
    () => [
      {
        id: "you",
        x: 0,
        y: 0,
        lng: ORIGIN[0],
        lat: ORIGIN[1],
        kind: "you",
        label: "You",
      },
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
    [filtered],
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
          <h1 className="text-xl font-bold">Nearby help</h1>
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
          ) : filtered.length ? (
            <HelpList points={filtered} />
          ) : (
            <EmptyState
              title="Nothing nearby"
              hint="Try another filter."
            />
          )}
        </div>
      }
    />
  );
}
