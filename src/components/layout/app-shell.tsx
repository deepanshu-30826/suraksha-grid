"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { BOTTOM_ALIAS, BOTTOM_NAV, BRAND, NAV } from "@/lib/constants";
import { cn } from "@/lib/utils";
const Logo = () => <div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-white"><ShieldCheck className="h-5 w-5" /></span><div className="leading-tight"><p className="font-bold tracking-tight">SURAKSHA GRID</p><p className="hidden text-[11px] text-muted lg:block">{BRAND.tagline}</p></div></div>;
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const active = BOTTOM_ALIAS[path] ?? path;
  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-line bg-white p-5 lg:flex">
        <Link href="/"><Logo /></Link>
        <nav className="mt-8 space-y-1">{NAV.map(({ href, label, icon: I }) => <Link key={href} href={href} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition", path === href ? "bg-brand-soft text-brand-dark" : "text-muted hover:bg-surface hover:text-ink")}><I className="h-[18px] w-[18px]" />{label}</Link>)}</nav>
        <p className="mt-auto rounded-xl bg-surface p-3 text-xs text-muted">Safety scores are guidance based on lighting, activity and community reports.</p>
      </aside>
      <header className="sticky top-0 z-30 flex h-14 items-center border-b border-line bg-white px-4 lg:hidden"><Logo /></header>
      <main className="pb-16 lg:pb-0 lg:pl-64">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-4 border-t border-line bg-white/95 backdrop-blur lg:hidden" aria-label="Primary">
        {BOTTOM_NAV.map((href) => { const item = NAV.find((n) => n.href === href)!; const I = item.icon;
          return <Link key={href} href={href} className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium", active === href ? "text-brand" : "text-muted")}><I className="h-5 w-5" />{item.label}</Link>; })}
      </nav>
    </div>);
}
