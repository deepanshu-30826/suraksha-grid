"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { AuthForm } from "@/components/auth/auth-form";
export default function SignupPage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-sm space-y-6 p-6 pt-12">
      <div className="text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand text-white"><ShieldCheck className="h-7 w-7" /></span>
        <h1 className="mt-4 text-2xl font-bold">Create your account</h1>
        <p className="mt-1 text-sm text-muted">Join Suraksha Grid and help keep your community safer</p>
      </div>
      <AuthForm mode="signup" onSuccess={() => router.push("/auth/login")} />
      <p className="text-center text-sm text-muted">Already have an account?{" "}<Link href="/auth/login" className="font-semibold text-brand">Sign in</Link></p>
    </div>
  );
}