import { NextResponse, type NextRequest } from "next/server";
import { type CookieOptions } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const url    = new URL(request.url);
  const code   = url.searchParams.get("code");
  const next   = url.searchParams.get("next") ?? "/";

  if (code) {
    try {
      const { createServerClient } = await import("@supabase/ssr");
      const { cookies }            = await import("next/headers");
      const cookieStore            = cookies();
      const sb = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get(name: string) { return cookieStore.get(name)?.value; },
            set(_n: string, _v: string, _o: CookieOptions) {},
            remove(_n: string, _o: CookieOptions) {},
          },
        }
      );
      await sb.auth.exchangeCodeForSession(code);
    } catch { /* redirect anyway */ }
  }
  return NextResponse.redirect(new URL(next, request.url));
}