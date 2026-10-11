
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  X,
  Phone,
  Loader2,
  MapPin,
  Info,
} from "lucide-react";

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

interface AlertResponse {
  email_sent?: boolean;
  sms_sent?: boolean;
  sms_simulated?: boolean;
  email_error?: string | null;
  sms_error?: string | null;
  error?: string;
  map_link?: string;
  location_available?: boolean;
}

const COUNTDOWN_SEC = 60;

export function EmergencyAlert({
  userName = "App User",
  destination,
  routeName,
  onClose,
}: Props) {
  const [phase, setPhase] = useState<EmergencyState>("idle");
  const [remaining, setRemaining] = useState(COUNTDOWN_SEC);
  const [result, setResult] = useState<AlertResponse | null>(null);
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendingRef = useRef(false);

  const { coords: geoCoords, isLoading: isGeoLoading } =
    useGeolocation({ autoRequest: true });

  const clearCountdown = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const sendAlert = useCallback(async () => {
    // Prevent duplicate requests from countdown and Send Now.
    if (sendingRef.current) return;

    sendingRef.current = true;
    clearCountdown();
    setPhase("sending");
    setResult(null);

    try {
      const body = {
        user_name: userName,
        latitude: geoCoords?.latitude,
        longitude: geoCoords?.longitude,
        destination,
        route_name: routeName,
        emergency_contact_email: contactEmail.trim() || undefined,
        emergency_contact_phone: contactPhone.trim() || undefined,
      };

      const response = await fetch("/api/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      let data: AlertResponse;

      try {
        data = (await response.json()) as AlertResponse;
      } catch {
        throw new Error(
          `The alert service returned an invalid response (HTTP ${response.status}).`
        );
      }

      setResult(data);

      // HTTP 200 alone does NOT mean an email was sent.
      // Require the backend's explicit email_sent confirmation.
      if (response.ok && data.email_sent === true) {
        setPhase("sent");
      } else {
        setPhase("error");
      }
    } catch (error) {
      setResult({
        error:
          error instanceof Error
            ? error.message
            : "Network error. The alert status could not be confirmed.",
      });
      setPhase("error");
    } finally {
      sendingRef.current = false;
    }
  }, [
    clearCountdown,
    userName,
    geoCoords,
    destination,
    routeName,
    contactEmail,
    contactPhone,
  ]);

  useEffect(() => {
    if (phase !== "countdown") return;

    intervalRef.current = setInterval(() => {
      setRemaining((current) => Math.max(0, current - 1));
    }, 1000);

    return clearCountdown;
  }, [phase, clearCountdown]);

  useEffect(() => {
    if (phase === "countdown" && remaining === 0) {
      void sendAlert();
    }
  }, [phase, remaining, sendAlert]);

  useEffect(() => {
    return () => clearCountdown();
  }, [clearCountdown]);

  function startCountdown() {
    setResult(null);
    setRemaining(COUNTDOWN_SEC);
    setPhase("countdown");
  }

  function cancel() {
    clearCountdown();
    setRemaining(COUNTDOWN_SEC);
    setPhase("cancelled");
  }

  function sendNow() {
    clearCountdown();
    void sendAlert();
  }

  const circumference = 2 * Math.PI * 38;
  const dash = circumference * (remaining / COUNTDOWN_SEC);

  const errorMessage =
    result?.email_error ||
    result?.error ||
    (result?.email_sent === false
      ? "Email was not sent. Check the recipient and email configuration."
      : "The email could not be confirmed. Please check the service logs.");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <Card
        className={cn(
          "w-full max-w-sm animate-rise space-y-4 border-2",
          phase === "countdown"
            ? "border-elevated"
            : phase === "sent"
              ? "border-safer"
              : "border-concern"
        )}
      >
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "flex items-center gap-2 font-bold",
              phase === "sent" ? "text-safer" : "text-concern"
            )}
          >
            {phase === "sent" ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <AlertTriangle className="h-5 w-5" />
            )}

            {phase === "idle" && "Emergency Alert"}
            {phase === "countdown" && "Alert Countdown"}
            {phase === "sending" && "Sending Alert…"}
            {phase === "sent" && "Email Accepted"}
            {phase === "cancelled" && "Alert Cancelled"}
            {phase === "error" && "Email Not Confirmed"}
          </span>

          {phase !== "countdown" && phase !== "sending" && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-full p-1 text-muted hover:bg-surface"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {phase === "idle" && (
          <>
            <p className="text-sm text-muted">
              Starting the alert begins a {COUNTDOWN_SEC}-second countdown.
              Cancel if you are safe.
            </p>

            <div className="space-y-2">
              <label className="block text-xs font-semibold">
                Test or emergency contact email
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                placeholder="your-email@example.com"
                autoComplete="email"
                className="h-10 w-full rounded-xl border border-line px-3 text-sm outline-none focus:border-brand"
              />

              <label className="block text-xs font-semibold">
                Emergency contact phone (optional)
              </label>
              <input
                type="tel"
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
                placeholder="+91 XXXXX XXXXX"
                autoComplete="tel"
                className="h-10 w-full rounded-xl border border-line px-3 text-sm outline-none focus:border-brand"
              />
            </div>

            <p className="flex items-start gap-1.5 rounded-xl bg-surface p-2 text-[11px] text-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Demo mode: SMS is simulated, not sent. Resend test sender may
              only allow the account's authorized test recipient.
            </p>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={onClose}
              >
                Close
              </Button>
              <Button
                className="flex-1 bg-concern hover:bg-concern/90"
                onClick={startCountdown}
              >
                <Phone className="h-4 w-4" />
                Start alert
              </Button>
            </div>
          </>
        )}

        {phase === "countdown" && (
          <>
            <div className="flex flex-col items-center gap-3 py-2">
              <svg
                width="100"
                height="100"
                viewBox="0 0 100 100"
                className="-rotate-90"
                aria-label={`${remaining} seconds remaining`}
              >
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  fill="none"
                  stroke="#E3E8EF"
                  strokeWidth="6"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  fill="none"
                  stroke="#EA580C"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${circumference}`}
                  style={{ transition: "stroke-dasharray 1s linear" }}
                />
                <text
                  x="50"
                  y="55"
                  textAnchor="middle"
                  className="fill-ink text-2xl font-bold"
                  style={{ fontSize: 28, fontWeight: 700 }}
                  transform="rotate(90, 50, 50)"
                >
                  {remaining}
                </text>
              </svg>

              <p className="text-center text-sm text-muted">
                Alert sends in <b>{remaining}s</b> unless cancelled.
              </p>

              <div className="flex items-center gap-1.5 text-xs text-muted">
                <MapPin className="h-3.5 w-3.5 text-brand" />
                {geoCoords ? (
                  <span>
                    Location captured ({geoCoords.latitude.toFixed(4)},{" "}
                    {geoCoords.longitude.toFixed(4)})
                  </span>
                ) : isGeoLoading ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin text-brand" />
                    Acquiring GPS location…
                  </span>
                ) : (
                  <span className="font-medium text-amber-600">
                    GPS location unavailable
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1 bg-safer hover:bg-safer/90"
                onClick={cancel}
              >
                <CheckCircle2 className="h-4 w-4" />
                I'm safe — Cancel
              </Button>
              <Button
                className="flex-1 bg-concern hover:bg-concern/90"
                onClick={sendNow}
              >
                Send now
              </Button>
            </div>
          </>
        )}

        {phase === "sending" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-10 w-10 animate-spin text-concern" />
            <p className="text-sm text-muted">
              Sending email alert and checking provider response…
            </p>
          </div>
        )}

        {phase === "sent" && result && (
          <>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-2 text-safer">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Resend accepted the email request. This does not guarantee
                  delivery to the inbox.
                </span>
              </div>

              <div className="flex items-start gap-2 text-muted">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  SMS is simulated in demo mode. No real SMS was sent.
                </span>
              </div>

              {result.map_link && (
                <a
                  href={result.map_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-brand hover:underline"
                >
                  <MapPin className="h-4 w-4" />
                  View location on map
                </a>
              )}

              {!result.map_link && (
                <p className="text-xs text-muted">
                  Location was unavailable at the time of the alert.
                </p>
              )}
            </div>

            <Button className="w-full" onClick={onClose}>
              Close
            </Button>
          </>
        )}

        {phase === "cancelled" && (
          <>
            <p className="text-sm text-muted">
              Alert cancelled. Stay safe!
            </p>
            <Button className="w-full" variant="outline" onClick={onClose}>
              Close
            </Button>
          </>
        )}

        {phase === "error" && (
          <>
            <p className="flex items-start gap-2 text-sm text-concern">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </p>

            {result?.sms_simulated && (
              <p className="text-xs text-muted">
                SMS remains simulated; no real SMS was sent.
              </p>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={onClose}
              >
                Close
              </Button>
              <Button
                className="flex-1 bg-concern hover:bg-concern/90"
                onClick={() => void sendAlert()}
              >
                Retry
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
