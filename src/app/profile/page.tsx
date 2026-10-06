"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { LogIn, LogOut } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/safety/score";
import { getUser, signOut } from "@/lib/services/auth";
import { routes } from "@/lib/mock-data";
import { user as mockUser } from "@/lib/mock-data";
import { cn, timeAgo } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";

const PREFS = ["Prefer well-lit roads", "Avoid isolated stretches", "Alert me when safety changes"];

export default function ProfilePage() {
  const [on, setOn] = useState<Record<string, boolean>>({ [PREFS[0]]: true, [PREFS[2]]: true });
  const [authUser, setAuthUser] = useState<User | null | "loading">("loading");

  useEffect(() => {
    getUser().then(setAuthUser).catch(() => setAuthUser(null));
  }, []);

  const handleSignOut = async () => {
    await signOut();
    setAuthUser(null);
  };

  const name = authUser && authUser !== "loading" ? (authUser.user_metadata?.full_name as string | undefined) ?? authUser.email ?? mockUser.name : mockUser.name;
  const email = authUser && authUser !== "loading" ? authUser.email ?? mockUser.email : mockUser.email;
  const initials = name.slice(0, 2).toUpperCase();

  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-4 lg:grid-cols-2 lg:p-8">
      {/* Header */}
      <Card className="flex items-center gap-4 lg:col-span-2">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-brand text-xl font-bold text-white shrink-0">
          {initials}
        </span>
        <div className="flex-1 min-w-0">
          <h1 className="truncate text-xl font-bold">{name}</h1>
          <p className="truncate text-sm text-muted">{email}</p>
          {authUser === "loading" && <p className="text-xs text-muted mt-0.5">Loading session…</p>}
          {authUser && authUser !== "loading" && (
            <span className="mt-1 inline-block rounded-full bg-safer/10 px-2 py-0.5 text-xs font-semibold text-safer">Signed in</span>
          )}
          {!authUser && authUser !== "loading" && (
            <span className="mt-1 inline-block rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted">Browsing as guest</span>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-6 text-center">
            <div><p className="text-xl font-bold">{mockUser.reports}</p><p className="text-xs text-muted">Reports</p></div>
            <div><p className="text-xl font-bold">{mockUser.stories}</p><p className="text-xs text-muted">Stories</p></div>
          </div>
          {authUser && authUser !== "loading" ? (
            <Button variant="outline" size="sm" onClick={handleSignOut}><LogOut className="h-4 w-4" />Sign out</Button>
          ) : authUser !== "loading" ? (
            <Link href="/auth/login"><Button size="sm"><LogIn className="h-4 w-4" />Sign in</Button></Link>
          ) : null}
        </div>
      </Card>

      {/* Saved routes */}
      <Card>
        <h2 className="mb-3 font-bold">Saved routes</h2>
        <div className="space-y-2">
          {routes.map((r) => (
            <Link key={r.id} href={`/navigation?route=${r.id}`}
              className="flex items-center justify-between rounded-xl bg-surface p-3 text-sm hover:bg-brand-soft transition">
              <span><b>Home → Cyber Hub</b> · {r.name}</span>
              <ScoreBadge score={r.score} />
            </Link>
          ))}
        </div>
      </Card>

      {/* Preferences */}
      <Card>
        <h2 className="mb-3 font-bold">Preferences</h2>
        <div className="space-y-2">
          {PREFS.map((p) => (
            <button key={p} role="switch" aria-checked={!!on[p]}
              onClick={() => setOn({ ...on, [p]: !on[p] })}
              className="flex w-full items-center justify-between rounded-xl bg-surface p-3 text-left text-sm hover:bg-brand-soft/50 transition">
              {p}
              <span className={cn("h-6 w-11 rounded-full p-0.5 transition", on[p] ? "bg-brand" : "bg-line")}>
                <span className={cn("block h-5 w-5 rounded-full bg-white shadow transition-transform", on[p] && "translate-x-5")} />
              </span>
            </button>
          ))}
        </div>
      </Card>

      {/* Contributions */}
      <Card className="lg:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">My contributions</h2>
          {!authUser && authUser !== "loading" && (
            <Link href="/auth/signup" className="text-sm font-semibold text-brand">Sign up to contribute</Link>
          )}
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {[
            { id:"p1", t: "Market Lane · Poor lighting", m: 25 },
            { id:"p2", t: "Canal Road · Police presence", m: 95 },
            { id:"s1", t: "Story: Market Lane", m: 25 },
            { id:"s2", t: "Story: Canal Road", m: 95 },
          ].map((c) => (
            <div key={c.id} className="flex justify-between rounded-xl bg-surface p-3 text-sm">
              <span>{c.t}</span><span className="text-muted">{timeAgo(c.m)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}