"use client";
import { useCallback, useEffect, useState } from "react";
import { MapLayout } from "@/components/map/map-layout";
import { MapLibreMap } from "@/components/map/maplibre-map";
import { Legend } from "@/components/safety/score";
import { SafetyLens } from "@/components/safety/safety-lens";
import { Chip, EmptyState, Skeleton } from "@/components/ui/card";
import { getSegments } from "@/lib/services/segments";
import type { Segment } from "@/types";

export default function SafetyPage() {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [sel, setSel] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    getSegments()
      .then((data) => {
        if (!alive) return;
        setSegments(data);
        const preferred = data.find((segment) => segment.score < 50) ?? data[0];
        setSel(preferred?.id ?? "");
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const onSelect = useCallback((id: string) => setSel(id), []);
  const selected = segments.find((segment) => segment.id === sel);

  return (
    <MapLayout
      map={
        <div className="relative h-full">
          <MapLibreMap
            className="h-full w-full"
            segments={segments}
            selectedSegmentId={sel}
            onSelectSegment={onSelect}
          />
          <div className="pointer-events-none absolute inset-x-3 top-3 z-[5]">
            <Legend />
          </div>
          {loading && (
            <div className="absolute left-3 bottom-20 z-[5] rounded-xl bg-white/95 px-3 py-2 text-xs text-muted shadow-card">
              Loading safety intelligence…
            </div>
          )}
        </div>
      }
      panel={
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-bold">Safety Lens</h1>
            <p className="text-sm text-muted">
              Tap a road on the map or choose below
            </p>
          </div>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-8" />
              <Skeleton className="h-56" />
            </div>
          ) : segments.length ? (
            <>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {segments.map((segment) => (
                  <Chip
                    key={segment.id}
                    active={segment.id === sel}
                    onClick={() => setSel(segment.id)}
                    className="shrink-0"
                  >
                    {segment.name}
                  </Chip>
                ))}
              </div>
              <SafetyLens segment={selected} />
            </>
          ) : (
            <EmptyState
              title="Safety data unavailable"
              hint="Check your Supabase connection and try again."
            />
          )}
        </div>
      }
    />
  );
}
