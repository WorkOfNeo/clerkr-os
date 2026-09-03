import type { Metadata } from "next";

import Link from "next/link";

import { ClerkrLogo } from "@/components/ClerkrLogo";

import { SignUpForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create account",
  description:
    "Create a Clerkr OS account. Allowlisted addresses only.",
};

export default function SignUpPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60rem 40rem at 50% -10%, hsl(var(--primary) / 0.07), transparent 70%)",
        }}
      />

      <div className="w-full max-w-[22rem] animate-slide-up">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <ClerkrLogo className="h-7 w-auto" />
          <div>
            <h1 className="text-display text-[26px] font-semibold leading-tight">
              Create your account
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Only allowlisted emails can sign up.
            </p>
          </div>
        </div>

        <div className="surface p-6 shadow-lg">
          <SignUpForm />
        </div>

        <p className="mt-5 text-center text-[13px] text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/signin"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
