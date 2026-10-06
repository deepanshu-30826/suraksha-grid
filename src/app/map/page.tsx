"use client";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { Search, LocateFixed, Bell, Phone, Loader2 } from "lucide-react";
import { MapLayout } from "@/components/map/map-layout";
import { MapLibreMap } from "@/components/map/maplibre-map";
import { Legend } from "@/components/safety/score";
import { SafetyLens } from "@/components/safety/safety-lens";
import { AnomalyBanner } from "@/components/safety/anomaly-banner";
import { EmergencyAlert } from "@/components/emergency/emergency-alert";
import { buttonVariants } from "@/components/ui/button";
import { getSegments } from "@/lib/services/segments";
import { getReports } from "@/lib/services/reports";
import {
  subscribeToReports,
  subscribeToSegmentUpdates,
  triggerRecalculation,
} from "@/lib/services/realtime";
import { aggregateCommunityEvidence } from "@/lib/community-evidence";
import { ORIGIN, markers } from "@/lib/mock-data";
import { cn, timeAgo } from "@/lib/utils";
import type { AnomalyResult, MapMarker, SafetyReport, Segment } from "@/types";

function clientAnomaly(count: number): AnomalyResult {
  if (count >= 5) {
    return {
      is_anomaly: true,
      severity: "high",
      reason: `${count} reports on this segment.`,
    };
  }
  if (count >= 3) {
    return {
      is_anomaly: true,
      severity: "medium",
      reason: `${count} recent safety reports nearby.`,
    };
  }
  return { is_anomaly: false, severity: "none", reason: "" };
}

export default function MapPage() {
  const [sel, setSel] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [reports, setReports] = useState<SafetyReport[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const [anomaly, setAnomaly] = useState<AnomalyResult | null>(null);
  const [showEmergency, setShowEmergency] = useState(false);
  const [loading, setLoading] = useState(true);
  const reportCounts = useRef<Record<string, number>>({});
  const subRefs = useRef<{ unsubscribe: () => void }[]>([]);

  useEffect(() => {
    let alive = true;

    Promise.all([getSegments(), getReports()])
      .then(([segmentData, reportData]) => {
        if (!alive) return;
        setSegments(segmentData);
        setReports(reportData);
        setSel((current) =>
          current && segmentData.some((segment) => segment.id === current)
            ? current
            : segmentData[0]?.id ?? "",
        );
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;

    Promise.all([
      subscribeToReports((row) => {
        if (!alive) return;

        const report: SafetyReport = {
          id: row.id,
          place: `${row.latitude.toFixed(4)}, ${row.longitude.toFixed(4)}`,
          tag: row.category,
          minutesAgo: 0,
          note: row.description ?? "",
          latitude: row.latitude,
          longitude: row.longitude,
          segmentId: row.road_segment_id ?? undefined,
        };

        setReports((previous) => [report, ...previous].slice(0, 50));
        setAlertCount((count) => count + 1);

        const affectedSegId = row.road_segment_id;
        if (!affectedSegId) return;

        reportCounts.current[affectedSegId] =
          (reportCounts.current[affectedSegId] ?? 0) + 1;

        const a = clientAnomaly(reportCounts.current[affectedSegId]);
        if (a.is_anomaly) setAnomaly(a);

        void triggerRecalculation(affectedSegId);
      }),
      subscribeToSegmentUpdates((row) => {
        if (!alive) return;

        setSegments((previous) =>
          previous.map((segment) =>
            segment.id === row.id
              ? { ...segment, score: row.safety_score }
              : segment,
          ),
        );

        setAnomaly(null);
      }),
    ]).then((subscriptions) => {
      if (!alive) {
        subscriptions.forEach((subscription) => subscription.unsubscribe());
        return;
      }
      subRefs.current = subscriptions;
    });

    return () => {
      alive = false;
      subRefs.current.forEach((subscription) => subscription.unsubscribe());
      subRefs.current = [];
    };
  }, []);

  const onSelect = useCallback((id: string) => setSel(id), []);
  const segment = useMemo(
    () => segments.find((item) => item.id === sel),
    [segments, sel],
  );

  const reportMarkers = useMemo<MapMarker[]>(
    () =>
      reports.flatMap((report): MapMarker[] => {
        if (
          report.latitude === undefined ||
          report.longitude === undefined
        ) {
          return [];
        }
        return [
          {
            id: `report-${report.id}`,
            x: 0,
            y: 0,
            lng: report.longitude,
            lat: report.latitude,
            kind: "report",
            label: report.tag,
          },
        ];
      }),
    [reports],
  );

  const mapMarkers = useMemo(
    () => [
      ...markers.filter((marker) => marker.kind === "you" || marker.kind === "dest"),
      ...reportMarkers,
    ],
    [reportMarkers],
  );

  const evidence = aggregateCommunityEvidence(
    reports.slice(0, 20).map((report) => ({
      category: report.tag,
      severity: 2,
      ageHours: report.minutesAgo / 60,
    })),
    true,
  );

  return (
    <>
      <MapLayout
        map={
          <div className="relative h-full">
            <MapLibreMap
              className="h-full w-full"
              segments={segments}
              selectedSegmentId={sel}
              onSelectSegment={onSelect}
              markers={mapMarkers}
            />
            <div className="pointer-events-none absolute inset-x-3 top-3 z-[5] space-y-2 [&>*]:pointer-events-auto">
              <div className="flex items-center gap-2 rounded-2xl bg-white px-3 shadow-card">
                <Search className="h-4 w-4 text-muted" />
                <input
                  aria-label="Search places"
                  placeholder="Search places"
                  className="h-12 flex-1 bg-transparent text-sm outline-none"
                />
                {alertCount > 0 && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-elevated text-[11px] font-bold text-white">
                    {alertCount > 9 ? "9+" : alertCount}
                  </span>
                )}
              </div>
              <Legend />
            </div>

            {loading && (
              <div className="absolute left-3 bottom-20 z-[5] flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 text-xs text-muted shadow-card">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
                Loading safety data…
              </div>
            )}

            <button
              aria-label="Recenter map"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent("suraksha-grid:recenter", {
                    detail: { lng: ORIGIN[0], lat: ORIGIN[1] },
                  }),
                );
              }}
              className="absolute bottom-[calc(8rem+env(safe-area-inset-bottom))] right-3 z-[5] grid h-11 w-11 place-items-center rounded-full bg-white shadow-card lg:bottom-16"
            >
              <LocateFixed className="h-5 w-5 text-brand" />
            </button>

            {reports[0] && (
              <div className="animate-rise pointer-events-none absolute inset-x-3 top-20 z-[6] flex items-start gap-2 rounded-2xl bg-ink p-3 text-sm text-white shadow-sheet lg:left-auto lg:right-4 lg:top-4 lg:w-72">
                <Bell className="mt-0.5 h-4 w-4 shrink-0 text-elevated" />
                <div>
                  <p className="font-semibold">Recent report</p>
                  <p className="text-white/70">
                    {reports[0].tag} · {timeAgo(reports[0].minutesAgo)}
                  </p>
                </div>
              </div>
            )}
          </div>
        }
        panel={
          <div className="space-y-4">
            {anomaly && (
              <AnomalyBanner
                anomaly={anomaly}
                segmentName={segment?.name}
                onRecalculate={() => {
                  setAnomaly(null);
                  if (segment?.id) void triggerRecalculation(segment.id);
                }}
                onDismiss={() => setAnomaly(null)}
              />
            )}

            <SafetyLens segment={segment} />

            {evidence.reportCount > 0 && (
              <p className="text-[11px] text-muted/70 text-center">
                {evidence.label}
              </p>
            )}

            <Link
              href="/routes"
              className={cn(buttonVariants(), "w-full")}
            >
              Plan a route
            </Link>

            <button
              onClick={() => setShowEmergency(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-concern py-3 text-sm font-bold text-concern transition hover:bg-concern/5"
            >
              <Phone className="h-4 w-4" />
              Emergency Safety Alert
            </button>
          </div>
        }
      />

      {showEmergency && (
        <EmergencyAlert onClose={() => setShowEmergency(false)} />
      )}
    </>
  );
}
