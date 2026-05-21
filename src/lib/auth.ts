import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import bcrypt from "bcryptjs";

import { db } from "./db";

const BCRYPT_COST = 10;

const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const baseURL = process.env.BETTER_AUTH_URL || "http://localhost:3000";

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
