"use client";
import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { signIn, signUp } from "@/lib/services/auth";
import { cn } from "@/lib/utils";

interface Props {
  mode: "login" | "signup";
  onSuccess?: () => void;
}

export function AuthForm({ mode, onSuccess }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result =
        mode === "signup"
          ? await signUp(email, password, name)
          : await signIn(email, password);

      if (result.error) throw result.error;

      if (mode === "signup") {
        if (result.session) {
          // If auto-authenticated (e.g. email confirmation disabled), proceed to success handler
          setDone(true);
          onSuccess?.();
        } else {
          // Email confirmation is required — show the check email card
          setDone(true);
        }
      } else {
        setDone(true);
        onSuccess?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (done && mode === "signup") {
    return (
      <Card className="py-8 text-center space-y-3">
        <p className="text-lg font-bold">Check your email</p>
        <p className="mt-1 text-sm text-muted">
          We sent you a confirmation link. Open it to activate your account.
        </p>
        <div className="pt-2">
          <Link href="/auth/login" className="text-sm font-semibold text-brand">
            Return to sign in
          </Link>
        </div>
      </Card>
    );
  }

  const field = cn(
    "h-11 w-full rounded-xl border border-line bg-white px-3 text-sm outline-none focus:border-brand"
  );

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        {mode === "signup" && (
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-semibold">
              Full name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className={field}
            />
          </div>
        )}
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-semibold">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={field}
            autoComplete="email"
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="mb-1 block text-sm font-semibold"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={show ? "text" : "password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={cn(field, "pr-11")}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
        {error && (
          <p className="flex items-center gap-2 rounded-xl bg-concern/10 p-3 text-sm text-concern">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {mode === "signup" ? "Creating account…" : "Signing in…"}
            </>
          ) : mode === "signup" ? (
            "Create account"
          ) : (
            "Sign in"
          )}
        </Button>
      </form>
    </Card>
  );
}
