import { routes, segments } from "@/lib/mock-data";
import type { LngLat, RouteOption } from "@/types";

export interface RouteRequest { origin: LngLat; destination: LngLat }
export interface RouteResult extends RouteOption { coords: LngLat[] }

const segmentById = new Map(segments.map((s) => [s.id, s] as const));

function coordsForSegments(ids: string[]): LngLat[] {
  const pts: LngLat[] = [];
  ids.forEach((id, i) => {
    const seg = segmentById.get(id);
    if (!seg) return;
    pts.push(...(i === 0 ? seg.coords : seg.coords.slice(1)));
  });
  return pts;
}

/** Derive riskFactors and positiveFactors from the segments a route passes through. */
function routeFactors(segmentIds: string[]): { riskFactors: string[]; positiveFactors: string[] } {
  const risk     = new Set<string>();
  const positive = new Set<string>();
  for (const id of segmentIds) {
    const s = segmentById.get(id);
    if (!s) continue;
    if (s.riskFactors)     s.riskFactors.forEach((f)     => risk.add(f));
    if (s.positiveFactors) s.positiveFactors.forEach((f) => positive.add(f));
    // Fall back to computed labels when engine output isn't present
    if (!s.riskFactors) {
      if (s.lighting < 40)  risk.add("Poor lighting");
      if (s.activity < 35)  risk.add("Low pedestrian activity");
      if (s.score < 50)     risk.add("Low Safety Score segment");
    }
    if (!s.positiveFactors) {
      if (s.lighting > 75)  positive.add("Good lighting");
      if (s.activity > 70)  positive.add("Active pedestrian presence");
      if (s.emergency === "Good") positive.add("Good emergency access");
    }
  }
  return { riskFactors: [...risk], positiveFactors: [...positive] };
}

/**
 * Typed routing abstraction.
 * Phase 2: resolves mock segment geometry.
 * Phase 4: adds risk/positive factors derived from Safety Engine output.
 * Phase 5 (future): swap body for an ORS server-side call.
 */
export async function getRoutes(_req: RouteRequest): Promise<RouteResult[]> {
  return routes.map((r) => {
    const { riskFactors, positiveFactors } = routeFactors(r.segmentIds);
    return {
      ...r,
      coords: coordsForSegments(r.segmentIds),
      riskFactors,
      positiveFactors,
      explanation: r.explanation ?? r.reason,
    };
  });
}