/**
 * Route data access.
 *
 * Canonical read path:
 * browser → Next.js backend proxy → FastAPI → Supabase/Postgres.
 * Direct Supabase and mock routing remain fallbacks for local resilience.
 */
import type { RouteOption } from "@/types";
import { routes as mockRoutes } from "@/lib/mock-data";
import { getRoutes as getMockRoutes, type RouteResult } from "@/lib/map/routing";
import { ORIGIN, DESTINATION } from "@/lib/mock-data";
import { lineStringCoords } from "@/lib/map/geometry";
import { apiGet } from "@/lib/services/api";

function isSupabaseConfigured() {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function rowToRouteResult(row: Record<string, unknown>): RouteResult {
  return {
    id: String(row["route_type"] ?? "balanced") as RouteOption["id"],
    name: String(row["name"] ?? "Route"),
    etaMin: Math.round(Number(row["duration_s"] ?? 900) / 60),
    distanceKm: +(Number(row["distance_m"] ?? 3600) / 1000).toFixed(1),
    score: Number(row["safety_score"] ?? 70),
    confidence: Number(row["confidence"] ?? 70),
    reason: String(row["reason"] ?? ""),
    segmentIds: Array.isArray(row["segment_ids"])
      ? row["segment_ids"].map(String)
      : [],
    recommended: Boolean(row["recommended"]),
    coords: lineStringCoords(row["geometry"]),
  };
}

function mockFallback() {
  return getMockRoutes({ origin: ORIGIN, destination: DESTINATION });
}

export async function fetchRoutes(): Promise<RouteResult[]> {
  if (!isSupabaseConfigured()) return mockFallback();

  try {
    const rows = await apiGet<Record<string, unknown>[]>("routes");
    const mapped = rows.map(rowToRouteResult);

    if (mapped.length !== 3) {
      throw new Error(`Expected 3 route options, received ${mapped.length}`);
    }
    if (!mapped.some((route) => route.coords.length >= 2)) {
      throw new Error("Route geometry could not be read from FastAPI");
    }
    return mapped;
  } catch (apiError) {
    console.warn("[routes] FastAPI read failed, trying direct Supabase:", apiError);

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data, error } = await supabase
        .from("routes")
        .select(
          "id,name,route_type,distance_m,duration_s,safety_score,confidence," +
          "reason,segment_ids,recommended,geometry::json",
        )
        .order("safety_score", { ascending: false });

      if (error) throw error;
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      const mapped = rows.map(rowToRouteResult);
      if (mapped.length !== 3 || !mapped.some((route) => route.coords.length >= 2)) {
        throw new Error("Incomplete route data");
      }
      return mapped;
    } catch (err) {
      console.warn("[routes] Falling back to mock routing:", err);
      return mockFallback();
    }
  }
}

export { mockRoutes };
