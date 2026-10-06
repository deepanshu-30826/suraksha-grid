"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MapLayout } from "@/components/map/map-layout";
import { MapLibreMap } from "@/components/map/maplibre-map";
import { RouteCard } from "@/components/navigation/route-card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fetchRoutes, type RouteResult } from "@/lib/services/routes";
import { markers, CURRENT_LOCATION } from "@/lib/mock-data";
import type { RouteId } from "@/types";

export default function RoutesPage() {
  const [sel, setSel] = useState<RouteId>("balanced");
  const [data, setData] = useState<RouteResult[] | null>(null);

  useEffect(() => {
    let alive = true;

    fetchRoutes()
      .then((routes) => {
        if (!alive) return;
        setData(routes);
        const recommended = routes.find((route) => route.recommended) ?? routes[0];
        if (recommended) setSel(recommended.id);
      })
      .catch(() => {
        if (alive) setData([]);
      });

    return () => {
      alive = false;
    };
  }, []);

  const route = data?.find((r) => r.id === sel);
  const endpoints = markers.filter(
    (m) => m.kind === "you" || m.kind === "dest",
  );

  return (
    <MapLayout
      map={
        data ? (
          <MapLibreMap
            className="h-full w-full"
            routeLines={data.map((r) => ({
              route: r,
              coords: r.coords,
            }))}
            selectedRouteId={sel}
            onSelectRoute={setSel}
            markers={endpoints}
          />
        ) : (
          <div className="grid h-full place-items-center bg-surface text-sm text-muted">
            Loading route data…
          </div>
        )
      }
      panel={
        <div className="space-y-3">
          <div>
            <h1 className="text-xl font-bold">Choose your route</h1>
            <p className="text-sm text-muted">
              {CURRENT_LOCATION} → Cyber Hub
            </p>
          </div>

          {data?.length ? (
            <div className="space-y-3 pt-2">
              {data.map((r) => (
                <RouteCard
                  key={r.id}
                  route={r}
                  selected={r.id === sel}
                  onSelect={() => setSel(r.id)}
                />
              ))}
            </div>
          ) : data ? (
            <div className="rounded-xl border border-line p-4 text-sm text-muted">
              Route data is currently unavailable.
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
          )}

          {route && (
            <Link
              href={`/navigation?route=${sel}`}
              className={cn(buttonVariants({ size: "lg" }), "w-full")}
            >
              Start {route.name} route <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      }
    />
  );
}
