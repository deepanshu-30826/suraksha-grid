"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { AuthForm } from "@/components/auth/auth-form";
export default function LoginPage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-sm space-y-6 p-6 pt-12">
      <div className="text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand text-white"><ShieldCheck className="h-7 w-7" /></span>
        <h1 className="mt-4 text-2xl font-bold">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">Sign in to your Suraksha Grid account</p>
      </div>
      <AuthForm mode="login" onSuccess={() => router.push("/")} />
      <p className="text-center text-sm text-muted">No account?{" "}<Link href="/auth/signup" className="font-semibold text-brand">Create one</Link></p>
    </div>
  );
}