import type { Metadata } from "next";

import { Suspense } from "react";
import Link from "next/link";

import { ClerkrLogo } from "@/components/ClerkrLogo";

import { SignInForm } from "./signin-form";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to Clerkr OS.",
};

export default function SignInPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* A single soft wash behind the card — enough to stop the page reading as
          a blank sheet, subtle enough not to compete with the form. */}
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
              Sign in to Clerkr OS
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Internal tool. Allowlisted emails only.
            </p>
          </div>
        </div>

        <div className="surface p-6 shadow-lg">
          <Suspense fallback={null}>
            <SignInForm />
          </Suspense>
        </div>

        <p className="mt-5 text-center text-[13px] text-muted-foreground">
          New here?{" "}
          <Link
            href="/signup"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
