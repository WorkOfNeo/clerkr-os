import type { Metadata } from "next";

import Link from "next/link";

import { ClerkrLogo } from "@/components/ClerkrLogo";
import { RESET_DOMAIN, resetMode } from "@/lib/password-reset";

import { ForgotPasswordForm } from "./forgot-form";

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Set a new password for your Clerkr OS account.",
};

// The mode is read from the environment on every request, so setting
// RESEND_API_KEY switches this page over without a deploy.
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  const mode = resetMode();

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
              Forgot your password?
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {mode === "email"
                ? "We'll email you a link to set a new one."
                : "Confirm your address and set a new one."}
            </p>
          </div>
        </div>

        <div className="surface p-6 shadow-lg">
          <ForgotPasswordForm mode={mode} domain={RESET_DOMAIN} />
        </div>

        <p className="mt-5 text-center text-[13px] text-muted-foreground">
          Remembered it?{" "}
          <Link
            href="/signin"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
