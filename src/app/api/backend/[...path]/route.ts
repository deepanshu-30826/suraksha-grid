import { NextRequest, NextResponse } from "next/server";

const ALLOWED_PATHS = new Set([
  "segments",
  "routes",
  "reports",
  "stories",
  "help",
]);

function backendBaseUrl(): string {
  return (process.env.FASTAPI_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");
}

async function proxy(request: NextRequest, context: { params: { path?: string[] } }) {
  const path = context.params.path?.join("/") ?? "";
  const rootPath = path.split("/")[0];

  if (!ALLOWED_PATHS.has(rootPath)) {
    return NextResponse.json({ error: "Unsupported API resource" }, { status: 404 });
  }

  const upstream = `${backendBaseUrl()}/api/v1/${path.replace(/\/+$/, "")}/`;
  const target = new URL(upstream);
  target.search = request.nextUrl.search;

  try {
    const response = await fetch(target, {
      method: "GET",
      cache: "no-store",
    });

    const body = await response.text();
    return new NextResponse(body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Backend API unavailable",
      },
      { status: 503 },
    );
  }
}

export async function GET(
  request: NextRequest,
  context: { params: { path?: string[] } },
) {
  return proxy(request, context);
}

