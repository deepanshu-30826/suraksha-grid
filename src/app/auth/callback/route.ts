import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/types";

export type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? searchParams.get("redirect") ?? "/";

  if (code) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && key) {
      try {
        const cookieStore = cookies();
        const sb = createServerClient<Database>(url, key, {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
            setAll(cookiesToSet: CookieToSet[]) {
              try {
                cookiesToSet.forEach(({ name, value, options }) =>
                  cookieStore.set(name, value, options)
                );
              } catch {
                // Route handler cookie set error fallback
              }
            },
          },
        });
        const { error } = await sb.auth.exchangeCodeForSession(code);
        if (!error) {
          const forwardedHost = request.headers.get("x-forwarded-host");
          const isLocalEnv = process.env.NODE_ENV === "development";
          const targetPath = next.startsWith("/") ? next : `/${next}`;
          if (isLocalEnv) {
            return NextResponse.redirect(`${origin}${targetPath}`);
          } else if (forwardedHost) {
            return NextResponse.redirect(`https://${forwardedHost}${targetPath}`);
          } else {
            return NextResponse.redirect(`${origin}${targetPath}`);
          }
        }
      } catch (err) {
        console.error("[auth/callback] session exchange failed:", err);
      }
    }
  }

  const targetPath = next.startsWith("/") ? next : `/${next}`;
  return NextResponse.redirect(new URL(targetPath, request.url));
}