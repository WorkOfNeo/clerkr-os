import type { Metadata } from "next";

import Link from "next/link";

import { ClerkrLogo } from "@/components/ClerkrLogo";

import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = {
  title: "Set a new password",
  description: "Choose a new password for your Clerkr OS account.",
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

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
          <h1 className="text-display text-[26px] font-semibold leading-tight">
            Set a new password
          </h1>
        </div>

        <div className="surface p-6 shadow-lg">
          {token ? (
            <ResetPasswordForm token={token} />
          ) : (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">
                This link has no token in it. Ask for a new one.
              </p>
              <Link
                href="/forgot-password"
                className="inline-block text-[13px] font-medium text-primary underline-offset-4 hover:underline"
              >
                Start over
              </Link>
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-[13px] text-muted-foreground">
          <Link href="/signin" className="underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
