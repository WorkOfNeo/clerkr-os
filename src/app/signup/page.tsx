import Link from "next/link";

import { ClerkrLogo } from "@/components/ClerkrLogo";

import { SignUpForm } from "./signup-form";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-start gap-3">
          <ClerkrLogo className="h-7 w-auto" />
          <div>
            <h1 className="text-2xl font-semibold">Create account</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Only emails on the allowlist can sign up.
            </p>
          </div>
        </div>
        <SignUpForm />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/signin" className="font-medium text-foreground underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
