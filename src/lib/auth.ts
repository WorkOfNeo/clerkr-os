import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import bcrypt from "bcryptjs";

import { ensureProtocol } from "./base-url";
import { db } from "./db";
import {
  recordDelivery,
  resetLink,
  resetMode,
  sendResetEmail,
} from "./password-reset";

const BCRYPT_COST = 10;

const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const baseURL = ensureProtocol(process.env.BETTER_AUTH_URL) ?? "http://localhost:3000";

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),

  secret: process.env.BETTER_AUTH_SECRET,
  baseURL,

  advanced: {
    cookiePrefix: "clerkr-internal",
    database: { generateId: "uuid" },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh every 24h
  },

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: false,

    // A reset invalidates every existing session for that account. If the
    // password had to be reset because someone else knew it, leaving their
    // 30-day cookie working would make the reset pointless.
    revokeSessionsOnPasswordReset: true,

    // The one place a reset link is ever sent. Better Auth requires this hook
    // to exist before `requestPasswordReset` will run at all, and routing the
    // send through it means a call straight to /api/auth/request-password-reset
    // behaves the same as our own form.
    //
    // The `url` Better Auth hands us points at its own callback endpoint; we
    // build our own link to the page that actually shows the form. What
    // happened is recorded because Better Auth swallows anything thrown here
    // and reports success anyway — see `recordDelivery`.
    sendResetPassword: async ({
      user,
      token,
    }: {
      user: { email: string };
      token: string;
    }) => {
      if (resetMode() === "direct") {
        recordDelivery(token, { sent: false, reason: "direct-mode" });
        return;
      }
      try {
        await sendResetEmail(user.email, resetLink(token));
        recordDelivery(token, { sent: true });
      } catch (e) {
        recordDelivery(token, {
          sent: false,
          reason: "failed",
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },

    password: {
      hash: async (password: string) => bcrypt.hash(password, BCRYPT_COST),
      verify: async ({ hash, password }: { hash: string; password: string }) =>
        bcrypt.compare(password, hash),
    },
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const email = user.email.trim().toLowerCase();
          if (!allowedEmails.includes(email)) {
            throw new Error(
              `Email ${email} is not on the allowlist. Ask an admin to add it to ALLOWED_EMAILS.`,
            );
          }
          return { data: { ...user, email } };
        },
      },
      update: {
        before: async (user) => {
          if (typeof user.email !== "string") return { data: user };
          return { data: { ...user, email: user.email.trim().toLowerCase() } };
        },
      },
    },
  },

  plugins: [nextCookies()],
});
