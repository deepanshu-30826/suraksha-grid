import type { LngLat } from "@/types";

type GeoJSONLineString = {
  type?: unknown;
  coordinates?: unknown;
};

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/**
 * Convert a PostGIS/Supabase GeoJSON value into MapLibre [lng, lat] pairs.
 * The helper accepts either an already-parsed object or a JSON string and
 * rejects malformed/non-LineString geometry instead of guessing.
 */
export function lineStringCoords(value: unknown): LngLat[] {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];

  const geometry = parsed as GeoJSONLineString;
  if (geometry.type !== undefined && geometry.type !== "LineString") return [];

  if (!Array.isArray(geometry.coordinates)) return [];

  return geometry.coordinates.flatMap((point): LngLat[] => {
    if (!Array.isArray(point) || point.length < 2) return [];
    const lng = Number(point[0]);
    const lat = Number(point[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return [];
    return [[lng, lat]];
  });
}
