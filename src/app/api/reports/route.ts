import { NextResponse, type NextRequest } from "next/server";

export interface ReportPayload {
  category: string;
  description?: string;
  latitude: number;
  longitude: number;
  road_segment_id?: string;
  severity?: number;
  original_text?: string;
  language?: string;
}

function validatePayload(body: unknown): body is ReportPayload {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  if (typeof b["category"] !== "string" || b["category"].trim().length === 0) return false;
  if (typeof b["latitude"] !== "number" || typeof b["longitude"] !== "number") return false;
  if (b["description"] !== undefined && typeof b["description"] !== "string") return false;
  if (b["description"] && (b["description"] as string).length > 2000) return false;
  return true;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!validatePayload(body)) {
    return NextResponse.json({ error: "Missing or invalid fields" }, { status: 422 });
  }

  const fastapiBase = process.env.FASTAPI_BASE_URL ?? "http://localhost:8000";
  try {
    const resp = await fetch(`${fastapiBase}/api/v1/reports/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!resp.ok) {
      const err = await resp.text().catch(() => "unknown");
      return NextResponse.json({ error: err }, { status: resp.status });
    }
    const data: unknown = await resp.json();
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Backend unavailable" },
      { status: 503 }
    );
  }
}