/**
 * Supabase Realtime subscriptions.
 *
 * subscribeToReports       — fires on every new safety_reports INSERT
 * subscribeToSegmentUpdates — fires when a road_segments row is UPDATEd
 *                             (score recalculation complete)
 *
 * Both return an object with unsubscribe() so callers clean up on unmount.
 * Falls back to a no-op when Supabase is not configured.
 */
import type { Database } from "@/lib/supabase/types";

type ReportRow = Database["public"]["Tables"]["safety_reports"]["Row"];
type SegmentRow = Database["public"]["Tables"]["road_segments"]["Row"];

export type ReportInsertHandler  = (report: ReportRow) => void;
export type SegmentUpdateHandler = (segment: Pick<SegmentRow, "id" | "safety_score" | "updated_at">) => void;

export interface RealtimeSubscription {
  unsubscribe: () => void;
}

function configured() {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function subscribeToReports(
  onInsert: ReportInsertHandler,
): Promise<RealtimeSubscription> {
  if (!configured()) return { unsubscribe: () => {} };
  const { createClient } = await import("@/lib/supabase/client");
  const sb = createClient();
  const ch = sb
    .channel(`safety_reports_inserts_${Date.now()}`)
    .on<ReportRow>(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "safety_reports" },
      (payload) => onInsert(payload.new),
    )
    .subscribe();
  return { unsubscribe: () => { sb.removeChannel(ch); } };
}

export async function subscribeToSegmentUpdates(
  onUpdate: SegmentUpdateHandler,
): Promise<RealtimeSubscription> {
  if (!configured()) return { unsubscribe: () => {} };
  const { createClient } = await import("@/lib/supabase/client");
  const sb = createClient();
  const ch = sb
    .channel(`road_segments_updates_${Date.now()}`)
    .on<SegmentRow>(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "road_segments" },
      (payload) => {
        const { id, safety_score, updated_at } = payload.new;
        onUpdate({ id, safety_score, updated_at });
      },
    )
    .subscribe();
  return { unsubscribe: () => { sb.removeChannel(ch); } };
}

/**
 * Trigger a server-side segment recalculation via the Next.js API proxy.
 * Never exposes backend credentials to the browser.
 * Returns null on success, error string on failure.
 */
export async function triggerRecalculation(segmentId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/recalculate/${segmentId}`, {
      method: "POST",
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      return body.error ?? `HTTP ${res.status}`;
    }
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Network error";
  }
}