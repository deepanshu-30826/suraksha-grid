"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CornerUpRight,
  Clock,
  Ruler,
  X,
  RotateCw,
  ShieldCheck,
  Phone,
  Loader2,
} from "lucide-react";
import { MapLayout } from "@/components/map/map-layout";
import { MapLibreMap } from "@/components/map/maplibre-map";
import { ScoreBadge } from "@/components/safety/score";
import { AnomalyBanner } from "@/components/safety/anomaly-banner";
import { EmergencyAlert } from "@/components/emergency/emergency-alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fetchRoutes, type RouteResult } from "@/lib/services/routes";
import { getSegments } from "@/lib/services/segments";
import { subscribeToSegmentUpdates } from "@/lib/services/realtime";
import { aggregateCommunityEvidence } from "@/lib/community-evidence";
import { markers } from "@/lib/mock-data";
import type { AnomalyResult, RouteId, Segment } from "@/types";

function checkAnomaly(reportCount: number): AnomalyResult {
  if (reportCount >= 5) {
    return {
      is_anomaly: true,
      severity: "high",
      reason: `${reportCount} recent reports on this segment.`,
    };
  }
  if (reportCount >= 3) {
    return {
      is_anomaly: true,
      severity: "medium",
      reason: `${reportCount} new reports detected nearby.`,
    };
  }
  return { is_anomaly: false, severity: "none", reason: "" };
}

function Nav() {
  const initial = (useSearchParams().get("route") as RouteId) || "balanced";
  const [routes, setRoutes] = useState<RouteResult[] | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [id, setId] = useState<RouteId>(initial);
  const [anomaly, setAnomaly] = useState<AnomalyResult | null>(null);
  const [changed, setChanged] = useState(false);
  const [showEmergency, setShowEmergency] = useState(false);
  const [recalcState, setRecalcState] = useState<"idle" | "loading" | "done">("idle");
  const reportCounts = useRef<Record<string, number>>({});
  const subRef = useRef<{ unsubscribe: () => void } | null>(null);

  useEffect(() => {
    let alive = true;

    Promise.all([fetchRoutes(), getSegments()])
      .then(([routeData, segmentData]) => {
        if (!alive) return;
        setRoutes(routeData);
        setSegments(segmentData);
        const initialRoute =
          routeData.find((route) => route.id === initial) ??
          routeData.find((route) => route.recommended) ??
          routeData[0];
        if (initialRoute) setId(initialRoute.id);
      })
      .catch(() => {
        if (alive) {
          setRoutes([]);
          setSegments([]);
        }
      });

    return () => {
      alive = false;
    };
  }, [initial]);

  useEffect(() => {
    let alive = true;

    subscribeToSegmentUpdates((seg) => {
      if (!alive) return;

      setSegments((current) =>
        current.map((segment) =>
          segment.id === seg.id
            ? { ...segment, score: seg.safety_score }
            : segment,
        ),
      );

      reportCounts.current[seg.id] = (reportCounts.current[seg.id] ?? 0) + 1;
      const a = checkAnomaly(reportCounts.current[seg.id]);
      if (a.is_anomaly) {
        setAnomaly(a);
        setChanged(true);
      }

      void fetchRoutes().then((updated) => {
        if (alive) setRoutes(updated);
      });
    }).then((sub) => {
      if (alive) subRef.current = sub;
      else sub.unsubscribe();
    });

    return () => {
      alive = false;
      subRef.current?.unsubscribe();
      subRef.current = null;
    };
  }, []);

  const handleRecalculate = useCallback(async () => {
    setRecalcState("loading");
    setAnomaly(null);
    setChanged(false);

    try {
      const fresh = await fetchRoutes();
      setRoutes(fresh);
      const best = fresh.reduce(
        (current, candidate) =>
          candidate.score > current.score ? candidate : current,
      );
      setId(best.id);
    } finally {
      setRecalcState("done");
      window.setTimeout(() => setRecalcState("idle"), 2000);
    }
  }, []);

  const route = useMemo(
    () =>
      routes?.find((item) => item.id === id) ??
      routes?.find((item) => item.recommended) ??
      routes?.[0],
    [routes, id],
  );

  const upcoming = useMemo(() => {
    if (!route) return undefined;
    const nextId = route.segmentIds.find(
      (segmentId) => segmentId !== route.segmentIds[0],
    );
    return segments.find((segment) => segment.id === nextId);
  }, [route, segments]);

  const evidence = useMemo(
    () =>
      aggregateCommunityEvidence(
        Object.entries(reportCounts.current).flatMap(([segmentId, count]) =>
          route?.segmentIds.includes(segmentId)
            ? Array.from({ length: count }, () => ({
                category: "report",
                severity: 3,
                ageHours: 0.5,
              }))
            : [],
        ),
        true,
      ),
    [route, changed],
  );

  if (routes === null) {
    return (
      <MapLayout
        map={
          <div className="grid h-full place-items-center bg-surface text-sm text-muted">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
          </div>
        }
        panel={
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        }
      />
    );
  }

  if (!route) {
    return (
      <div className="grid h-64 place-items-center p-8 text-center">
        <div>
          <p className="font-semibold">Routes unavailable</p>
          <p className="mt-1 text-sm text-muted">
            Check the database connection and try again.
          </p>
          <Link
            href="/routes"
            className={cn(buttonVariants({ variant: "outline" }), "mt-4")}
          >
            Back to routes
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <MapLayout
        map={
          <div className="relative h-full">
            <MapLibreMap
              className="h-full w-full"
              routeLines={routes.map((item) => ({
                route: item,
                coords: item.coords,
              }))}
              selectedRouteId={id}
              markers={markers.filter(
                (marker) => marker.kind === "you" || marker.kind === "dest",
              )}
            />

            <div className="pointer-events-none absolute inset-x-3 top-3 z-[5]">
              <div className="flex items-center gap-3 rounded-2xl bg-ink p-4 text-white shadow-card">
                <CornerUpRight className="h-9 w-9 shrink-0" />
                <div>
                  <p className="text-xs text-white/70">In 200 m</p>
                  <p className="text-lg font-bold leading-tight">
                    Continue toward {upcoming?.name ?? "your destination"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        }
        panel={
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {route.name} route
                </p>
                <p className="flex items-center gap-4 text-2xl font-bold">
                  <span className="flex items-center gap-1">
                    <Clock className="h-5 w-5 text-muted" />
                    {route.etaMin} min
                  </span>
                  <span className="flex items-center gap-1 text-lg text-muted">
                    <Ruler className="h-4 w-4" />
                    {route.distanceKm} km
                  </span>
                </p>
              </div>
              <ScoreBadge score={route.score} />
            </div>

            {changed && anomaly && (
              <AnomalyBanner
                anomaly={anomaly}
                segmentName={upcoming?.name}
                onRecalculate={() => void handleRecalculate()}
                onDismiss={() => {
                  setChanged(false);
                  setAnomaly(null);
                }}
              />
            )}

            {recalcState === "loading" && (
              <Card className="flex items-center gap-2 text-sm text-muted">
                <RotateCw className="h-4 w-4 animate-spin text-brand" />
                Recalculating routes…
              </Card>
            )}

            {recalcState === "done" && !changed && (
              <Card className="bg-safer/5 text-sm">
                <p className="font-semibold text-safer">Routes updated</p>
                <p className="text-muted">
                  Showing the highest-scored available route.
                </p>
              </Card>
            )}

            {!changed && recalcState === "idle" && (
              <Card className="flex items-start gap-2 bg-safer/5 text-sm">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-safer" />
                <div>
                  <p className="font-semibold text-safer">
                    Safety status: stable
                  </p>
                  <p className="text-muted">
                    Roads ahead are tracking their latest Safety Score.
                  </p>
                  {evidence.reportCount === 0 && (
                    <button
                      className="mt-1.5 text-xs font-semibold text-brand"
                      onClick={() => {
                        setAnomaly({
                          is_anomaly: true,
                          severity: "medium",
                          reason: "New safety reports detected on the upcoming segment (simulated).",
                        });
                        setChanged(true);
                      }}
                    >
                      Simulate safety update ↗
                    </button>
                  )}
                </div>
              </Card>
            )}

            {evidence.reportCount > 0 && (
              <p className="text-xs text-muted/70 text-center">
                {evidence.label}
              </p>
            )}

            <button
              onClick={() => setShowEmergency(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-concern py-3 text-sm font-bold text-concern transition hover:bg-concern/5"
            >
              <Phone className="h-4 w-4" />
              Emergency Safety Alert
            </button>

            <Link
              href="/routes"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "w-full",
              )}
            >
              <X className="h-4 w-4" />
              End navigation
            </Link>
          </div>
        }
      />

      {showEmergency && (
        <EmergencyAlert
          userName="Riya Menon"
          destination="Cyber Hub"
          routeName={route.name}
          onClose={() => setShowEmergency(false)}
        />
      )}
    </>
  );
}

export default function NavigationPage() {
  return (
    <Suspense
      fallback={
        <div className="grid h-64 place-items-center text-muted">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
        </div>
      }
    >
      <Nav />
    </Suspense>
  );
}
