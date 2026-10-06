import { Zap, Scale, ShieldCheck, Clock, Ruler, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { RouteOption } from "@/types";
import { ScoreBadge } from "@/components/safety/score";
import { cn } from "@/lib/utils";

const ICON = { fastest: Zap, balanced: Scale, safest: ShieldCheck };

export function RouteCard({ route, selected, onSelect }: { route: RouteOption; selected: boolean; onSelect: () => void }) {
  const I = ICON[route.id];
  const risks    = route.riskFactors?.slice(0, 2)    ?? [];
  const positives= route.positiveFactors?.slice(0, 2) ?? [];

  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "relative w-full rounded-2xl border bg-white p-4 text-left transition",
        selected ? "border-brand shadow-card ring-2 ring-brand/30" : "border-line hover:border-brand/40",
        route.recommended && !selected && "border-brand/40",
      )}
    >
      {route.recommended && (
        <span className="absolute -top-2.5 left-4 rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-bold text-white">
          Recommended
        </span>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-bold">
          <I className="h-4 w-4 text-brand" />{route.name}
        </span>
        <ScoreBadge score={route.score} />
      </div>

      {/* ETA / distance / confidence */}
      <div className="mt-3 flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1 text-lg font-bold">
          <Clock className="h-4 w-4 text-muted" />{route.etaMin} min
        </span>
        <span className="flex items-center gap-1 text-muted">
          <Ruler className="h-4 w-4" />{route.distanceKm} km
        </span>
        <span className="ml-auto text-xs text-muted">{route.confidence}% confidence</span>
      </div>

      {/* Reason / explanation */}
      <p className="mt-2 text-sm text-muted">{route.reason}</p>

      {/* Risk + positive factor chips */}
      {(risks.length > 0 || positives.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {risks.map((f) => (
            <span key={f} className="flex items-center gap-1 rounded-full bg-elevated/10 px-2.5 py-1 text-[11px] font-medium text-elevated">
              <AlertTriangle className="h-3 w-3" />{f}
            </span>
          ))}
          {positives.map((f) => (
            <span key={f} className="flex items-center gap-1 rounded-full bg-safer/10 px-2.5 py-1 text-[11px] font-medium text-safer">
              <CheckCircle2 className="h-3 w-3" />{f}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}