
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
  Mic,
  Square,
  Volume2,
  RotateCcw,
  Trash2,
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
  voice_attached?: boolean;
  voice_error?: string | null;
}

const COUNTDOWN_SEC = 60;
const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5MB

function formatRecordingTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result;
      if (typeof res === "string") {
        resolve(res);
      } else {
        reject(new Error("Failed to convert audio blob to base64"));
      }
    };
    reader.onerror = () => reject(reader.error || new Error("FileReader error"));
    reader.readAsDataURL(blob);
  });
}

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

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioUrlRef = useRef<string | null>(null);

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

  const stopMediaTracks = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      mediaStreamRef.current = null;
    }
  }, []);

  const clearRecordingTimer = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const cleanupAudioUrl = useCallback(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  const discardRecording = useCallback(() => {
    clearRecordingTimer();
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    stopMediaTracks();
    cleanupAudioUrl();
    setAudioBlob(null);
    setAudioUrl(null);
    setIsRecording(false);
    setRecordingSeconds(0);
    setRecordingError(null);
  }, [clearRecordingTimer, stopMediaTracks, cleanupAudioUrl]);

  const startRecording = useCallback(async () => {
    setRecordingError(null);
    discardRecording();

    if (
      typeof window === "undefined" ||
      !navigator?.mediaDevices?.getUserMedia ||
      typeof window.MediaRecorder === "undefined"
    ) {
      setRecordingError("Audio recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const preferredTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg",
        "audio/mp4",
        "audio/aac",
      ];
      let selectedMime = "";
      for (const mime of preferredTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMime = mime;
          break;
        }
      }

      const recorder = selectedMime
        ? new MediaRecorder(stream, { mimeType: selectedMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stopMediaTracks();
        clearRecordingTimer();
        setIsRecording(false);

        const chunks = audioChunksRef.current;
        const mime = recorder.mimeType || selectedMime || "audio/webm";
        const blob = new Blob(chunks, { type: mime });

        if (blob.size === 0) {
          setRecordingError(
            "Recording was empty. Please check your microphone and speak."
          );
          return;
        }

        if (blob.size > MAX_AUDIO_BYTES) {
          setRecordingError(
            "Recording exceeds the 5MB upload limit. Please record a shorter message."
          );
          return;
        }

        const newUrl = URL.createObjectURL(blob);
        cleanupAudioUrl();
        audioUrlRef.current = newUrl;
        setAudioBlob(blob);
        setAudioUrl(newUrl);
      };

      recorder.onerror = () => {
        stopMediaTracks();
        clearRecordingTimer();
        setIsRecording(false);
        setRecordingError("An error occurred during audio recording.");
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);

      const startTime = Date.now();
      recordingTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setRecordingSeconds(elapsed);
        if (elapsed >= 60) {
          if (recorder.state === "recording") {
            recorder.stop();
          }
        }
      }, 1000);
    } catch (err: unknown) {
      stopMediaTracks();
      clearRecordingTimer();
      setIsRecording(false);

      if (err instanceof DOMException) {
        if (
          err.name === "NotAllowedError" ||
          err.name === "PermissionDeniedError"
        ) {
          setRecordingError(
            "Microphone permission denied. Enable microphone access in browser settings or proceed without voice message."
          );
        } else if (
          err.name === "NotFoundError" ||
          err.name === "DevicesNotFoundError"
        ) {
          setRecordingError("No microphone found on your device.");
        } else {
          setRecordingError(`Could not access microphone: ${err.message}`);
        }
      } else {
        setRecordingError(
          "Could not access microphone. You can still trigger the alert without audio."
        );
      }
    }
  }, [discardRecording, stopMediaTracks, clearRecordingTimer, cleanupAudioUrl]);

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
    clearRecordingTimer();
    stopMediaTracks();
  }, [clearRecordingTimer, stopMediaTracks]);

  const sendAlert = useCallback(async () => {
    // Prevent duplicate requests from countdown and Send Now.
    if (sendingRef.current) return;

    sendingRef.current = true;
    clearCountdown();
    setPhase("sending");
    setResult(null);

    try {
      let voiceB64: string | undefined;
      let voiceMime: string | undefined;
      let voiceFilename: string | undefined;

      if (audioBlob) {
        try {
          voiceB64 = await blobToBase64(audioBlob);
          voiceMime = audioBlob.type || "audio/webm";
          const ext =
            voiceMime.includes("mp4") || voiceMime.includes("aac")
              ? ".m4a"
              : voiceMime.includes("ogg")
                ? ".ogg"
                : voiceMime.includes("wav")
                  ? ".wav"
                  : ".webm";
          voiceFilename = `emergency_voice_message${ext}`;
        } catch (encodeErr) {
          console.error("Failed to encode audio attachment:", encodeErr);
        }
      }

      const body = {
        user_name: userName,
        latitude: geoCoords?.latitude,
        longitude: geoCoords?.longitude,
        destination,
        route_name: routeName,
        emergency_contact_email: contactEmail.trim() || undefined,
        emergency_contact_phone: contactPhone.trim() || undefined,
        voice_message_base64: voiceB64,
        voice_message_mime_type: voiceMime,
        voice_message_filename: voiceFilename,
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
    audioBlob,
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
    return () => {
      clearCountdown();
      clearRecordingTimer();
      stopMediaTracks();
      cleanupAudioUrl();
    };
  }, [clearCountdown, clearRecordingTimer, stopMediaTracks, cleanupAudioUrl]);

  function startCountdown() {
    if (isRecording) {
      stopRecording();
    }
    setResult(null);
    setRemaining(COUNTDOWN_SEC);
    setPhase("countdown");
  }

  function cancel() {
    clearCountdown();
    stopRecording();
    discardRecording();
    setRemaining(COUNTDOWN_SEC);
    setPhase("cancelled");
  }

  function handleClose() {
    clearCountdown();
    stopRecording();
    discardRecording();
    if (onClose) {
      onClose();
    }
  }

  function sendNow() {
    clearCountdown();
    if (isRecording) {
      stopRecording();
    }
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
              onClick={handleClose}
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

              {/* Voice Message Section */}
              <div className="pt-1">
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="block text-xs font-semibold">
                    Voice message (optional)
                  </label>
                  {audioBlob && (
                    <span className="text-[11px] font-medium text-brand">
                      {(audioBlob.size / 1024).toFixed(0)} KB recorded
                    </span>
                  )}
                </div>

                {!isRecording && !audioBlob && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-center gap-2 border-dashed border-line text-xs hover:border-brand hover:bg-surface"
                    onClick={() => void startRecording()}
                  >
                    <Mic className="h-4 w-4 text-concern" />
                    Record voice message
                  </Button>
                )}

                {isRecording && (
                  <div className="flex items-center justify-between rounded-xl border border-concern/30 bg-concern/5 p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-3 w-3">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-concern opacity-75" />
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-concern" />
                      </span>
                      <span className="text-xs font-semibold text-concern">
                        Recording… {formatRecordingTime(recordingSeconds)} / 01:00
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 bg-concern px-2.5 text-xs hover:bg-concern/90"
                      onClick={stopRecording}
                    >
                      <Square className="mr-1 h-3 w-3 fill-current" />
                      Stop
                    </Button>
                  </div>
                )}

                {audioBlob && audioUrl && (
                  <div className="space-y-2 rounded-xl border border-line bg-surface p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-ink">
                        <Volume2 className="h-3.5 w-3.5 text-brand" />
                        Voice preview
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => void startRecording()}
                          title="Re-record"
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted hover:bg-elevated hover:text-ink"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Re-record
                        </button>
                        <button
                          type="button"
                          onClick={discardRecording}
                          title="Remove recording"
                          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-concern hover:bg-concern/10"
                        >
                          <Trash2 className="h-3 w-3" />
                          Remove
                        </button>
                      </div>
                    </div>
                    <audio
                      controls
                      src={audioUrl}
                      className="h-8 w-full rounded-md"
                      preload="metadata"
                    />
                  </div>
                )}

                {recordingError && (
                  <p className="mt-1 flex items-start gap-1 text-[11px] text-concern">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{recordingError}</span>
                  </p>
                )}
              </div>
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
                onClick={handleClose}
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

              <div className="flex flex-col items-center gap-1.5 text-xs text-muted">
                <div className="flex items-center gap-1.5">
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

                {audioBlob && (
                  <div className="flex items-center gap-1.5 font-medium text-brand">
                    <Volume2 className="h-3.5 w-3.5" />
                    <span>
                      Voice message attached ({(audioBlob.size / 1024).toFixed(0)} KB)
                    </span>
                  </div>
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

              {result.voice_attached && (
                <div className="flex items-start gap-2 text-safer">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Playable voice message attached and delivered with emergency email.
                  </span>
                </div>
              )}

              {result.voice_error && (
                <div className="flex items-start gap-2 text-concern text-xs">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{result.voice_error}</span>
                </div>
              )}

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

            <Button className="w-full" onClick={handleClose}>
              Close
            </Button>
          </>
        )}

        {phase === "cancelled" && (
          <>
            <p className="text-sm text-muted">
              Alert cancelled. Stay safe!
            </p>
            <Button className="w-full" variant="outline" onClick={handleClose}>
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
                onClick={handleClose}
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
