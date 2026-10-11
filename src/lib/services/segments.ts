import type { Segment } from "@/types";
import { LEVELS } from "@/lib/constants";
import { levelOf } from "@/lib/utils";
import { lineStringCoords } from "@/lib/map/geometry";
import { apiGet } from "@/lib/services/api";

function configured() {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function rowToSegment(row: Record<string, unknown>): Segment {
  const score = Number(row["safety_score"] ?? 50);
  const coords = lineStringCoords(row["geometry"]);

  return {
    id:            String(row["id"]),
    name:          String(row["name"] ?? "Unknown"),
    path:          "",
    coords,
    score,
    confidence:    Number(row["confidence_score"] ?? 70),
    lighting:      Number(row["lighting_score"] ?? 50),
    activity:      Number(row["pedestrian_activity_score"] ?? 50),
    emergency:     (row["emergency_access_label"] as Segment["emergency"]) ?? "Fair",
    timeCondition: String(row["time_condition"] ?? ""),
    explanation:   String(row["explanation"] ?? LEVELS[levelOf(score)].label),
    observations:  [],
    riskFactors:   [],
    positiveFactors: [],
    recentReportCount: Number(row["recent_reports_count"] ?? 0),
  };
}

const SEGMENT_FIELDS =
  "id,name,safety_score,confidence_score,lighting_score," +
  "pedestrian_activity_score,emergency_access_score," +
  "emergency_access_label,time_condition,explanation," +
  "recent_reports_count,geometry::json";

export async function getSegments(): Promise<Segment[]> {
  if (!configured()) return [];

  try {
    const rows = await apiGet<Record<string, unknown>[]>("segments");
    const mapped = rows.map(rowToSegment);

    if (!mapped.length) throw new Error("No road segments in database yet");
    if (!mapped.some((segment) => segment.coords.length >= 2)) {
      throw new Error("Road segment geometry could not be read from FastAPI");
    }
    return mapped;
  } catch (apiError) {
    console.warn("[segments] FastAPI read failed, trying direct Supabase:", apiError);

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data, error } = await supabase.from("road_segments").select(SEGMENT_FIELDS);
      if (error) throw error;

      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      const mapped = rows.map(rowToSegment);
      if (!mapped.length) throw new Error("No road segments in database yet");
      if (!mapped.some((segment) => segment.coords.length >= 2)) {
        throw new Error("Road segment geometry could not be read from Supabase");
      }
      return mapped;
    } catch (err) {
      console.warn("[segments] Supabase unavailable:", err);
      return [];
    }
  }
}

export async function getSegmentById(id: string): Promise<Segment | undefined> {
  if (!configured()) return undefined;

  try {
    const segment = await apiGet<Record<string, unknown>>(`segments/${id}`);
    return rowToSegment(segment);
  } catch {
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data, error } = await supabase
        .from("road_segments")
        .select(SEGMENT_FIELDS)
        .eq("id", id)
        .single();
      if (error) throw error;
      return data
        ? rowToSegment(data as unknown as Record<string, unknown>)
        : undefined;
    } catch {
      return undefined;
    }
  }
}
