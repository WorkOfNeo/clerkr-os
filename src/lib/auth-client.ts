import { createAuthClient } from "better-auth/react";

import { ensureProtocol } from "./base-url";

// Same normalization as `auth.ts` so a bare-host BETTER_AUTH_URL (e.g.
// `myapp.railway.app` with no protocol) doesn't crash module evaluation
// during SSR/SSG. Better Auth otherwise throws `Invalid base URL` here.
export const authClient = createAuthClient({
  baseURL: ensureProtocol(
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? process.env.BETTER_AUTH_URL,
  ),
});

export const { signIn, signUp, signOut, useSession } = authClient;
