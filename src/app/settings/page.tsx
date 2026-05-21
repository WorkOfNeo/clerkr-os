import { headers } from "next/headers";

import { listApiTokens } from "@/lib/api-tokens";
import { ensureProtocol } from "@/lib/base-url";
import { requireSession } from "@/lib/session";

import { AppNav } from "@/components/AppNav";

import { ConnectGuide } from "./ConnectGuide";
import { CreateTokenForm } from "./CreateTokenForm";
import { SkillSection } from "./SkillSection";
import { TokenList } from "./TokenList";

async function deriveOrigin() {
  const fromEnv = ensureProtocol(process.env.BETTER_AUTH_URL);
  if (fromEnv) return fromEnv;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

export default async function SettingsPage() {
  const session = await requireSession();
  const [tokens, origin] = await Promise.all([
    listApiTokens(session.user.id),
    deriveOrigin(),
  ]);

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container max-w-3xl space-y-10 py-8">
        <div>
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Personal API tokens for the MCP server, plus the setup guide for
            connecting Claude to the board.
          </p>
        </div>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">Step 1 &mdash; Create a token</h2>
            <p className="text-xs text-muted-foreground">
              Tokens are tied to your account. Posts created from a token are
              attributed to you.
            </p>
          </div>
          <CreateTokenForm origin={origin} />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">Step 2 &mdash; Connect Claude</h2>
            <p className="text-xs text-muted-foreground">
              Pick the client you use. Both work; pick whichever you actually
              talk to.
            </p>
          </div>
          <ConnectGuide origin={origin} />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">Step 3 &mdash; Install the skill</h2>
            <p className="text-xs text-muted-foreground">
              Tells Claude when to use the tools and how to fill the fields
              (URL crawl, image OCR, find / edit / delete).
            </p>
          </div>
          <SkillSection />
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold">Your active tokens</h2>
          <TokenList tokens={tokens} />
        </section>
      </main>
    </div>
  );
}
