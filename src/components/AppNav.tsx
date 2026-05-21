"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ClerkrLogo } from "@/components/ClerkrLogo";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-client";

export function AppNav({ email }: { email: string }) {
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push("/signin");
    router.refresh();
  }

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur">
      <div className="container flex h-14 items-center justify-between">
        <Link href="/grid" className="flex items-center gap-2 text-sm font-semibold">
          <ClerkrLogo className="h-4 w-auto" />
          <span>Ideas</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/grid"
            className="rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Grid
          </Link>
          <Link
            href="/settings"
            className="rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Settings
          </Link>
          <span className="mx-2 hidden text-xs text-muted-foreground sm:inline">
            {email}
          </span>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </nav>
      </div>
    </header>
  );
}
