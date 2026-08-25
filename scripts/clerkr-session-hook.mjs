#!/usr/bin/env node
// Clerkr OS — Claude Code SessionEnd hook.
//
// Harvests what a working session produced (decisions, dead ends, blockers,
// ideas) into the Clerkr OS work log, so the record exists even when nobody
// remembered to write it down.
//
// Plain Node >= 18, ZERO npm dependencies.
//
// This hook is a DUMB PIPE on purpose. It decides only one cheap, local thing:
// is this session plausibly Clerkr work? Everything expensive — judging whether
// there's anything durable in it, extracting the entries, matching them to a
// thread, embedding — happens server-side in /api/ingest/session, where the
// OpenAI key and the editable prompt already live. Nothing here needs a model,
// and no API key beyond the Clerkr token ever touches this file.
//
// SAFETY CONTRACT (mirrors ~/.claude/hooks/nah-hook.mjs):
//   - This script must NEVER break a Claude Code session.
//   - It must ALWAYS exit 0, whatever happens internally.
//   - stdout stays empty. SessionEnd cannot block, and anything printed would
//     be parsed as a decision object.
//   - The network call is capped and swallows every error.
//
// Install: see `npm run hook:install`, or the /settings page in Clerkr OS.
//
// Env:
//   CLERKR_URL    base URL of the Clerkr OS deployment  (required)
//   CLERKR_TOKEN  an API token from Clerkr OS /settings (required)
//   CLERKR_REPOS  comma-separated path fragments that count as Clerkr work.
//                 Default: "clerkr". A session whose cwd matches none of them
//                 is dropped locally and never leaves the machine.
//   CLERKR_HOOK_DEBUG=1  also log skipped sessions to the log file.

import { readFileSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const LOG_PATH = join(homedir(), ".clerkr-hook.log");
const TIMEOUT_MS = 20_000;
// Keep the tail of the conversation: the end of a session is where the
// decisions and the "that didn't work" moments actually are.
const MAX_TRANSCRIPT_CHARS = 120_000;

function log(message) {
  try {
    appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // Logging must never throw, and there is nowhere else to report it.
  }
}

function readHookInput() {
  try {
    const raw = readFileSync(0, "utf8");
    if (!raw || !raw.trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    log(`stdin parse failed: ${err && err.message}`);
    return {};
  }
}

/** Cheap local gate: does this session's cwd look like Clerkr work? */
function isClerkrPath(cwd) {
  if (!cwd) return false;
  const needles = (process.env.CLERKR_REPOS || "clerkr")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const haystack = cwd.toLowerCase();
  return needles.some((n) => haystack.includes(n));
}

function git(args, cwd) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Flatten the transcript JSONL into readable turns. Tool calls and their
 * results are dropped — they're the bulk of the bytes and almost none of the
 * meaning. What matters is what the user asked for and what was concluded.
 */
function readTranscript(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    log(`transcript unreadable (${path}): ${err && err.message}`);
    return "";
  }

  const turns = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue; // a partially-written line at the tail is normal
    }

    const role = msg?.message?.role ?? msg?.role;
    if (role !== "user" && role !== "assistant") continue;

    const content = msg?.message?.content ?? msg?.content;
    let text = "";
    if (typeof content === "string") {
      text = content;
    } else if (Array.isArray(content)) {
      text = content
        .filter((b) => b && b.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("\n");
    }

    text = text.trim();
    if (!text) continue;
    // Hook and system injections are not conversation.
    if (text.startsWith("<system-reminder>") || text.startsWith("Caveat:")) continue;

    turns.push(`${role === "user" ? "User" : "Claude"}: ${text}`);
  }

  const joined = turns.join("\n\n");
  return joined.length > MAX_TRANSCRIPT_CHARS
    ? joined.slice(joined.length - MAX_TRANSCRIPT_CHARS)
    : joined;
}

async function main() {
  const input = readHookInput();
  const sessionId = input.session_id;
  const cwd = input.cwd || process.cwd();

  if (!sessionId || !input.transcript_path) {
    log("no session_id / transcript_path in hook payload — nothing to do");
    return;
  }

  const base = (process.env.CLERKR_URL || "").replace(/\/+$/, "");
  const token = process.env.CLERKR_TOKEN;
  if (!base || !token) {
    log("CLERKR_URL / CLERKR_TOKEN not set — skipping");
    return;
  }

  if (!isClerkrPath(cwd)) {
    if (process.env.CLERKR_HOOK_DEBUG === "1") log(`skip (not a Clerkr path): ${cwd}`);
    return;
  }

  const transcript = readTranscript(input.transcript_path);
  // A session shorter than this has no decision in it worth the round trip.
  if (transcript.length < 400) {
    if (process.env.CLERKR_HOOK_DEBUG === "1") {
      log(`skip (transcript too short: ${transcript.length} chars)`);
    }
    return;
  }

  const repoRoot = git(["rev-parse", "--show-toplevel"], cwd);
  const payload = {
    sessionId,
    transcript,
    cwd,
    repo: repoRoot ? repoRoot.split("/").pop() : null,
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"], cwd),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/ingest/session`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    log(`${res.status} ${text.slice(0, 400)}`);
  } catch (err) {
    log(`POST failed: ${err && err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

// Belt and braces: whatever happens above, this process exits 0 and silently.
main()
  .catch((err) => log(`unhandled: ${err && err.message}`))
  .finally(() => process.exit(0));
