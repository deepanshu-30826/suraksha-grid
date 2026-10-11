"use client";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, X, Phone, Loader2, MapPin, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useGeolocation } from "@/lib/location";

export type EmergencyState =
  | "idle"
  | "countdown"
  | "sending"
  | "sent"
  | "cancelled"
  | "error";

interface Props {
  userName?: string;
  destination?: string;
  routeName?: string;
  onClose?: () => void;
}

const COUNTDOWN_SEC = 60;

export function EmergencyAlert({ userName = "App User", destination, routeName, onClose }: Props) {
  const [phase, setPhase]         = useState<EmergencyState>("idle");
  const [remaining, setRemaining] = useState(COUNTDOWN_SEC);
  const [result, setResult]       = useState<{ sms_simulated?: boolean; email_sent?: boolean; map_link?: string; error?: string; email_error?: string; location_available?: boolean } | null>(null);
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { coords: geoCoords, isLoading: isGeoLoading } = useGeolocation({ autoRequest: true });

  useEffect(() => {
    if (phase !== "countdown") return;
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(intervalRef.current!);
          void sendAlert();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, geoCoords]);

  async function sendAlert() {
    if (phase === "sending" || phase === "sent") return;
    setPhase("sending");
    try {
      const hasLocation = Boolean(geoCoords);
      const body = {
        user_name:               userName,
        latitude:                hasLocation ? geoCoords!.latitude : undefined,
        longitude:               hasLocation ? geoCoords!.longitude : undefined,
        destination:             destination,
        route_name:              routeName,
        emergency_contact_email: contactEmail || undefined,
        emergency_contact_phone: contactPhone || undefined,
      };
      const res = await fetch("/api/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as typeof result;
      setResult(data);
      setPhase(res.ok ? "sent" : "error");
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Network error" });
      setPhase("error");
    }
  }

  function cancel() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase("cancelled");
    setRemaining(COUNTDOWN_SEC);
  }

  const circumference = 2 * Math.PI * 38;
  const dash = circumference * (remaining / COUNTDOWN_SEC);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <Card className={cn(
        "w-full max-w-sm animate-rise space-y-4 border-2",
        phase === "countdown" ? "border-elevated" : phase === "sent" ? "border-safer" : "border-concern",
      )}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className={cn(
            "flex items-center gap-2 font-bold",
            phase === "sent" ? "text-safer" : "text-concern",
          )}>
            {phase === "sent" ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            {phase === "idle"      && "Emergency Alert"}
            {phase === "countdown" && "Alert Sending…"}
            {phase === "sending"   && "Sending Alert…"}
            {phase === "sent"      && "Alert Sent"}
            {phase === "cancelled" && "Alert Cancelled"}
            {phase === "error"     && "Alert Failed"}
          </span>
          {(phase === "idle" || phase === "cancelled" || phase === "sent" || phase === "error") && (
            <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-muted hover:bg-surface">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Idle: configure + start */}
        {phase === "idle" && (
          <>
            <p className="text-sm text-muted">
              Starting the alert will begin a {COUNTDOWN_SEC}-second countdown.
              Cancel at any time if you are safe.
            </p>
            <div className="space-y-2">
              <label className="block text-xs font-semibold">Emergency contact email (optional)</label>
              <input
                type="email" value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="contact@example.com"
                className="h-10 w-full rounded-xl border border-line px-3 text-sm outline-none focus:border-brand"
              />
              <label className="block text-xs font-semibold">Emergency contact phone (optional)</label>
              <input
                type="tel" value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+91 XXXXX XXXXX"
                className="h-10 w-full rounded-xl border border-line px-3 text-sm outline-none focus:border-brand"
              />
            </div>
            <p className="flex items-start gap-1.5 rounded-xl bg-surface p-2 text-[11px] text-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              SMS is simulated in demo mode. Email requires Resend configuration.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button className="flex-1 bg-concern hover:bg-concern/90" onClick={() => setPhase("countdown")}>
                <Phone className="h-4 w-4" />Start alert
              </Button>
            </div>
          </>
        )}

        {/* Countdown */}
        {phase === "countdown" && (
          <>
            <div className="flex flex-col items-center gap-3 py-2">
              <svg width="100" height="100" className="-rotate-90">
                <circle cx="50" cy="50" r="38" fill="none" stroke="#E3E8EF" strokeWidth="6" />
                <circle cx="50" cy="50" r="38" fill="none" stroke="#EA580C"
                  strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${dash} ${circumference}`}
                  style={{ transition: "stroke-dasharray 1s linear" }}
                />
                <text x="50" y="55" textAnchor="middle" className="fill-ink text-2xl font-bold" style={{ fontSize: 28, fontWeight: 700 }} transform="rotate(90, 50, 50)">
                  {remaining}
                </text>
              </svg>
              <p className="text-sm text-muted text-center">
                Alert will send in <b>{remaining}s</b> unless cancelled.
              </p>
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <MapPin className="h-3.5 w-3.5 text-brand" />
                {geoCoords ? (
                  <span>Location captured ({geoCoords.latitude.toFixed(4)}, {geoCoords.longitude.toFixed(4)})</span>
                ) : isGeoLoading ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin text-brand" /> Acquiring GPS location…
                  </span>
                ) : (
                  <span className="text-amber-600 font-medium">GPS location unavailable</span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 bg-safer hover:bg-safer/90" onClick={cancel}>
                <CheckCircle2 className="h-4 w-4" />I&apos;m safe — Cancel
              </Button>
              <Button className="flex-1 bg-concern hover:bg-concern/90" onClick={() => { if(intervalRef.current) clearInterval(intervalRef.current); void sendAlert(); }}>
                Send now
              </Button>
            </div>
          </>
        )}

        {/* Sending */}
        {phase === "sending" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-10 w-10 animate-spin text-concern" />
            <p className="text-sm text-muted">Sending emergency alert…</p>
          </div>
        )}

        {/* Sent */}
        {phase === "sent" && result && (
          <>
            <div className="space-y-2 text-sm">
              <div className={cn("flex items-center gap-2", result.email_sent ? "text-safer" : "text-muted")}>
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {result.email_sent ? "Email alert sent" : `Email: ${result.email_error ?? "not sent"}`}
              </div>
              <div className="flex items-center gap-2 text-muted">
                <Info className="h-4 w-4 shrink-0" />
                SMS: SIMULATED — no real SMS was sent in demo mode
              </div>
              {result.map_link ? (
                <a href={result.map_link} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-brand hover:underline">
                  <MapPin className="h-4 w-4" />View location on map
                </a>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <MapPin className="h-3.5 w-3.5 text-muted" />
                  <span>Location was unavailable at time of alert</span>
                </div>
              )}
            </div>
            <Button className="w-full" onClick={onClose}>Close</Button>
          </>
        )}

        {/* Cancelled */}
        {phase === "cancelled" && (
          <>
            <p className="text-sm text-muted">Alert cancelled. Stay safe!</p>
            <Button className="w-full" variant="outline" onClick={onClose}>Close</Button>
          </>
        )}

        {/* Error */}
        {phase === "error" && (
          <>
            <p className="flex items-center gap-2 text-sm text-concern">
              <AlertTriangle className="h-4 w-4" />
              {result?.error ?? "Alert failed. Check your connection and try again."}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>Close</Button>
              <Button className="flex-1 bg-concern" onClick={() => void sendAlert()}>Retry</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}