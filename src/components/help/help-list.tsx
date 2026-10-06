import Link from "next/link";
import { Shield, Cross, LifeBuoy, Navigation } from "lucide-react";
import type { HelpPoint } from "@/types";
import { Card } from "@/components/ui/card";
const META = { police: { I: Shield, label: "Police", c: "text-blue-600 bg-blue-50" }, hospital: { I: Cross, label: "Hospital", c: "text-concern bg-concern/10" }, help: { I: LifeBuoy, label: "Help point", c: "text-brand bg-brand-soft" } };
export function HelpList({ points }: { points: HelpPoint[] }) {
  return <div className="space-y-2.5">{points.map((p) => { const { I, label, c } = META[p.kind];
    return <Card key={p.id} className="flex items-center gap-3 p-3.5"><span className={`grid h-11 w-11 place-items-center rounded-xl ${c}`}><I className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1"><p className="truncate font-semibold">{p.name}</p><p className="text-xs text-muted">{label} · {p.distanceKm} km · {p.open24h ? "Open 24h" : "Limited hours"}</p></div>
      <Link href="/navigation" className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-white" aria-label={`Directions to ${p.name}`}><Navigation className="h-4 w-4" /></Link></Card>; })}</div>;
}
