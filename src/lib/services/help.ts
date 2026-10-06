import type { HelpPoint } from "@/types";
import { helpPoints as mockHelpPoints } from "@/lib/mock-data";
import { apiGet } from "@/lib/services/api";

function isSupabaseConfigured() {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function withDistance(
  points: Array<Record<string, unknown>>,
  userLng?: number,
  userLat?: number,
): HelpPoint[] {
  return points.map((p) => {
    const latitude = Number(p["latitude"]);
    const longitude = Number(p["longitude"]);
    const distanceKm =
      userLat !== undefined && userLng !== undefined
        ? +haversineKm(userLat, userLng, latitude, longitude).toFixed(1)
        : 0;

    return {
      id: String(p["id"]),
      name: String(p["name"]),
      kind: p["type"] as HelpPoint["kind"],
      distanceKm,
      open24h: Boolean(p["open_24h"]),
      lng: longitude,
      lat: latitude,
      x: 0,
      y: 0,
    };
  });
}

export async function getHelpPoints(
  userLng?: number,
  userLat?: number,
): Promise<HelpPoint[]> {
  if (!isSupabaseConfigured()) return mockHelpPoints;

  try {
    const rows = await apiGet<Record<string, unknown>[]>("help");
    return withDistance(rows, userLng, userLat);
  } catch (apiError) {
    console.warn("[help] FastAPI read failed, trying direct Supabase:", apiError);

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data, error } = await supabase
        .from("help_points")
        .select("id,name,type,latitude,longitude,address,phone,open_24h");

      if (error) throw error;
      return withDistance(
        (data ?? []) as unknown as Record<string, unknown>[],
        userLng,
        userLat,
      );
    } catch {
      return mockHelpPoints;
    }
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
