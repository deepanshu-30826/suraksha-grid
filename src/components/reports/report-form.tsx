"use client";
import { useState } from "react";
import { CheckCircle2, ImagePlus, MapPin, Loader2, AlertCircle, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Chip } from "@/components/ui/card";
import { REPORT_TAGS } from "@/lib/constants";
import { CURRENT_LOCATION, ORIGIN } from "@/lib/mock-data";

type FormState = "idle" | "submitting" | "analysing" | "done" | "error";

export function ReportForm() {
  const [tags, setTags]   = useState<string[]>([]);
  const [text, setText]   = useState("");
  const [file, setFile]   = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [geminiUsed, setGeminiUsed] = useState(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);

  const toggle = (t: string) =>
    setTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  const reset = () => {
    setTags([]); setText(""); setFile("");
    setState("idle"); setError(null); setGeminiUsed(false); setGeminiError(null);
  };

  async function submit() {
    if (!tags.length && !text.trim()) return;
    setState("submitting");
    setError(null);

    // If free text was entered, show the "analysing" state briefly
    if (text.trim()) setState("analysing");

    try {
      const payload = {
        category:      tags[0] ?? "Other",
        description:   text.trim() || undefined,
        original_text: text.trim() || undefined,
        latitude:      ORIGIN[1],
        longitude:     ORIGIN[0],
        severity:      1,
      };
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { gemini_used?: boolean; gemini_error?: string };
      setGeminiUsed(data.gemini_used ?? false);
      setGeminiError(data.gemini_error ?? null);
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setState("error");
    }
  }

  if (state === "done") return (
    <Card className="animate-rise py-10 text-center space-y-2">
      <CheckCircle2 className="mx-auto h-12 w-12 text-safer" />
      <h2 className="text-xl font-bold">Thanks for helping others</h2>
      <p className="text-sm text-muted">Your report will improve safety scores nearby.</p>
      {geminiUsed && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-brand">
          <Bot className="h-3.5 w-3.5" />AI extracted structured signals from your text
        </p>
      )}
      {geminiError && !geminiUsed && (
        <p className="text-xs text-muted">AI analysis unavailable — report saved without it.</p>
      )}
      <Button className="mt-4" variant="outline" onClick={reset}>Add another</Button>
    </Card>
  );

  return (
    <Card className="space-y-5">
      <div className="flex items-center gap-2 rounded-xl bg-surface p-3 text-sm">
        <MapPin className="h-4 w-4 text-brand" />
        <span className="font-medium">{CURRENT_LOCATION}</span>
        <span className="ml-auto text-xs text-muted">Current location (demo)</span>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">What did you notice?</p>
        <div className="flex flex-wrap gap-2">
          {REPORT_TAGS.map((t) => (
            <Chip key={t} active={tags.includes(t)} onClick={() => toggle(t)}>{t}</Chip>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="exp" className="mb-2 block text-sm font-semibold">
          Your experience <span className="font-normal text-muted">(optional — any language)</span>
        </label>
        <textarea
          id="exp" value={text} rows={4}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          placeholder="Share a short note for other travellers… (any language)"
          className="w-full rounded-xl border border-line p-3 text-sm outline-none focus:border-brand"
        />
        {text.trim().length > 0 && (
          <p className="mt-1 flex items-center gap-1 text-xs text-brand">
            <Bot className="h-3 w-3" />AI will extract structured signals from your text
          </p>
        )}
      </div>

      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line p-3 text-sm text-muted hover:bg-surface">
        <ImagePlus className="h-4 w-4" />
        {file || "Add a photo (optional)"}
        <input type="file" accept="image/*" className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0]?.name ?? "")} />
      </label>

      {state === "error" && error && (
        <p className="flex items-center gap-2 rounded-xl bg-concern/10 p-3 text-sm text-concern">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </p>
      )}

      <Button
        size="lg"
        className="w-full"
        disabled={(!tags.length && !text.trim()) || state === "submitting" || state === "analysing"}
        onClick={submit}
      >
        {state === "submitting" && <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</>}
        {state === "analysing" && <><Bot className="h-4 w-4 animate-pulse" />Analysing…</>}
        {(state === "idle" || state === "error") && "Submit report"}
      </Button>
    </Card>
  );
}