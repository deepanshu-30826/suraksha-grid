/**
 * Geocoding & Place Search Service.
 *
 * Provides real place-search and forward geocoding using OSM-derived data.
 * Uses MapTiler Geocoding API when NEXT_PUBLIC_MAPTILER_KEY is available,
 * with proximity bias around the user's current GPS location.
 */
import type { LngLat } from "@/types";

export interface SearchResult {
  id: string;
  name: string;
  fullName: string;
  coordinates: LngLat; // [longitude, latitude] matching MapLibre order
}

// In-memory cache for recent queries to avoid redundant network calls
const queryCache = new Map<string, SearchResult[]>();
const MAX_CACHE_SIZE = 50;

/**
 * Search places and geocode to real coordinates [lng, lat].
 */
export async function searchDestinations(
  query: string,
  proximity?: LngLat | null
): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const cacheKey = `${q.toLowerCase()}_${proximity ? proximity.join(",") : "none"}`;
  if (queryCache.has(cacheKey)) {
    return queryCache.get(cacheKey)!;
  }

  const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;

  if (maptilerKey) {
    try {
      let url = `https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${maptilerKey}&limit=5`;
      if (proximity) {
        url += `&proximity=${proximity[0]},${proximity[1]}`;
      }

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`MapTiler geocoding HTTP ${res.status}`);
      }

      const data = await res.json();
      const features = (data.features ?? []) as Array<{
        id: string;
        text?: string;
        place_name?: string;
        center?: [number, number];
        geometry?: { coordinates: [number, number] };
      }>;

      const results: SearchResult[] = features
        .map((f, i) => {
          const coords = f.center ?? f.geometry?.coordinates;
          if (!coords || coords.length < 2) return null;

          const fullName = f.place_name ?? f.text ?? "Location";
          const name = f.text ?? fullName.split(",")[0].trim();

          return {
            id: f.id ?? `maptiler-${i}-${coords[0]}-${coords[1]}`,
            name,
            fullName,
            coordinates: [coords[0], coords[1]] as LngLat,
          };
        })
        .filter((item): item is SearchResult => item !== null);

      if (results.length > 0) {
        if (queryCache.size >= MAX_CACHE_SIZE) {
          const firstKey = queryCache.keys().next().value;
          if (firstKey) queryCache.delete(firstKey);
        }
        queryCache.set(cacheKey, results);
        return results;
      }
    } catch (err) {
      console.warn("[geocoding] MapTiler geocoding failed, trying fallback:", err);
    }
  }

  // Fallback: OpenStreetMap Nominatim
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Nominatim geocoding HTTP ${res.status}`);
    }

    const items = (await res.json()) as Array<{
      place_id?: number | string;
      display_name?: string;
      lat?: string;
      lon?: string;
    }>;

    const results: SearchResult[] = items
      .map((item, i) => {
        const lat = parseFloat(item.lat ?? "");
        const lon = parseFloat(item.lon ?? "");
        if (isNaN(lat) || isNaN(lon)) return null;

        const fullName = item.display_name ?? "Location";
        const name = fullName.split(",")[0].trim();

        return {
          id: String(item.place_id ?? `nominatim-${i}`),
          name,
          fullName,
          coordinates: [lon, lat] as LngLat,
        };
      })
      .filter((item): item is SearchResult => item !== null);

    if (queryCache.size >= MAX_CACHE_SIZE) {
      const firstKey = queryCache.keys().next().value;
      if (firstKey) queryCache.delete(firstKey);
    }
    queryCache.set(cacheKey, results);
    return results;
  } catch (err) {
    console.warn("[geocoding] Place search failed:", err);
    return [];
  }
}
