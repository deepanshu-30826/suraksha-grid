/**
 * Server-side Supabase client (Server Components, Route Handlers).
 * Uses @supabase/ssr to forward the session cookie so RLS sees the user JWT.
 * Never import this in "use client" files.
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

export function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars — see .env.example");

  const cookieStore = cookies();
  return createServerClient<Database>(url, key, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      // In Server Components, set/remove are no-ops; middleware handles refresh.
      set(_name: string, _value: string, _options: CookieOptions) {},
      remove(_name: string, _options: CookieOptions) {},
    },
  });
}