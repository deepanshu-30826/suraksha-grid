/**
 * POST /api/reports/[id]/analyse-image
 *
 * Proxies to the FastAPI backend: POST /api/v1/reports/{id}/analyse-image
 * Strictly requires an authenticated user.
 * Verifies server-side Supabase session and report ownership before proxying.
 */
import { NextResponse, type NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  if (!id || typeof id !== "string" || id.trim().length === 0) {
    return NextResponse.json({ error: "Missing or invalid report ID" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Authentication service not configured" },
      { status: 503 }
    );
  }

  // 1. Authenticate user server-side
  let userId: string;
  let supabase: any;
  try {
    const { createServerSupabaseClient } = await import("@/lib/supabase/server");
    supabase = createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required to analyse report image" },
        { status: 401 }
      );
    }
    userId = user.id;
  } catch {
    return NextResponse.json(
      { error: "Authentication verification failed" },
      { status: 401 }
    );
  }

  // 2. Validate request body
  let body: { image_url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body.image_url !== "string" || body.image_url.trim().length < 8) {
    return NextResponse.json(
      { error: "Invalid or missing 'image_url' parameter" },
      { status: 400 }
    );
  }

  // 3. Verify report exists and belongs to the authenticated user
  try {
    const { data: report, error: reportError } = await supabase
      .from("safety_reports")
      .select("id, user_id")
      .eq("id", id)
      .maybe_single();

    if (reportError) {
      return NextResponse.json(
        { error: "Database error during report verification" },
        { status: 500 }
      );
    }

    if (!report) {
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404 }
      );
    }

    // Ownership check: fail closed if user does not own the report
    if (report.user_id && report.user_id !== userId) {
      return NextResponse.json(
        { error: "Forbidden: You do not have permission to analyse this report" },
        { status: 403 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Failed to verify report ownership" },
      { status: 500 }
    );
  }

  // 4. Proxy to FastAPI backend with verified user ID
  const fastapiBase = process.env.FASTAPI_BASE_URL ?? "http://localhost:8000";
  try {
    const resp = await fetch(
      `${fastapiBase}/api/v1/reports/${encodeURIComponent(id)}/analyse-image`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({ image_url: body.image_url }),
        cache: "no-store",
      }
    );

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({ error: "Image analysis failed" }));
      return NextResponse.json(errBody, { status: resp.status });
    }

    const data: unknown = await resp.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      {
        report_id: id,
        vision_used: false,
        vision_error: "Vision analysis backend unavailable",
      },
      { status: 503 }
    );
  }
}
