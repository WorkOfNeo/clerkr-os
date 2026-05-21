import { Suspense } from "react";
import Link from "next/link";

import { SignInForm } from "./signin-form";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Internal Clerkr idea board. Allowlisted emails only.
          </p>
        </div>
        <Suspense fallback={null}>
          <SignInForm />
        </Suspense>
        <p className="text-center text-sm text-muted-foreground">
          New here?{" "}
          <Link href="/signup" className="font-medium text-foreground underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
