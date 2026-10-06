"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PenSquare, Loader2 } from "lucide-react";
import { StoryCard } from "@/components/stories/story-card";
import { Chip, EmptyState, Skeleton } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { REPORT_TAGS } from "@/lib/constants";
import { getStories } from "@/lib/services/stories";
import type { Story } from "@/types";
import { cn } from "@/lib/utils";

export default function StoriesPage() {
  const [tag, setTag]       = useState("All");
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getStories()
      .then((data) => { if (alive) { setStories(data); setLoading(false); } })
      .catch((err) => { if (alive) { setError(String(err)); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const list = stories.filter((s) => tag === "All" || s.tags.includes(tag));

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 lg:p-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Street Stories</h1>
          <p className="text-sm text-muted">Real experiences from people nearby</p>
        </div>
        <Link href="/report" className={cn(buttonVariants({ size: "sm" }), "hidden sm:inline-flex")}>
          <PenSquare className="h-4 w-4" />Add report
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {["All", ...REPORT_TAGS.slice(0, 6)].map((t) => (
          <Chip key={t} active={tag === t} onClick={() => setTag(t)} className="shrink-0">{t}</Chip>
        ))}
      </div>

      {loading && (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}</div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-concern/30 bg-concern/5 p-4 text-sm text-concern">
          <Loader2 className="mb-1 h-4 w-4 animate-spin" />
          Could not load stories. Showing demo data.
        </div>
      )}

      {!loading && !error && (
        list.length
          ? <div className="grid gap-3 md:grid-cols-2">{list.map((s) => <StoryCard key={s.id} story={s} />)}</div>
          : <EmptyState title="No stories yet" hint="Be the first to share what you noticed on this topic." />
      )}

      <p className="text-[11px] text-muted/60 text-center">
        Stories are community observations — not verified safety assessments.
      </p>

      <Link href="/report" className={cn(buttonVariants(), "fixed bottom-20 right-4 z-20 shadow-sheet sm:hidden")}>
        <PenSquare className="h-4 w-4" />Add report
      </Link>
    </div>
  );
}