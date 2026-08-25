#!/usr/bin/env node
// Registers the Clerkr OS session-end hook in ~/.claude/settings.json.
//
//   node scripts/install-hook.mjs --url https://clerkr-os.example.com --token clk_...
//
// Additive and idempotent: it APPENDS a SessionEnd entry and never touches
// hooks that are already there (this machine already runs nah-hook and the
// ledger hook on the same events). Re-running updates the existing Clerkr entry
// in place rather than adding a second one. A timestamped backup of
// settings.json is written before any change.

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const SETTINGS = join(homedir(), ".claude", "settings.json");
const HOOK_PATH = resolve(import.meta.dirname, "clerkr-session-hook.mjs");
const MARKER = "clerkr-session-hook.mjs";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const url = arg("url") ?? process.env.CLERKR_URL;
const token = arg("token") ?? process.env.CLERKR_TOKEN;
const repos = arg("repos") ?? process.env.CLERKR_REPOS ?? "clerkr";

if (!url || !token) {
  console.error(
    "Usage: node scripts/install-hook.mjs --url <clerkr-os-url> --token <api-token> [--repos clerkr,other]\n\n" +
      "Create the API token in Clerkr OS under /settings.",
  );
  process.exit(1);
}

if (!existsSync(SETTINGS)) {
  console.error(`No settings file at ${SETTINGS}. Run Claude Code once first.`);
  process.exit(1);
}

const settings = JSON.parse(readFileSync(SETTINGS, "utf8"));

copyFileSync(SETTINGS, `${SETTINGS}.bak-clerkr-${Date.now()}`);

settings.env = settings.env ?? {};
settings.env.CLERKR_URL = url.replace(/\/+$/, "");
settings.env.CLERKR_TOKEN = token;
settings.env.CLERKR_REPOS = repos;

settings.hooks = settings.hooks ?? {};
settings.hooks.SessionEnd = settings.hooks.SessionEnd ?? [];

const command = `node ${HOOK_PATH}`;
const entry = { hooks: [{ type: "command", command, timeout: 30 }] };

// Find our own entry by marker so re-running never stacks duplicates, and
// never matches somebody else's hook.
const existing = settings.hooks.SessionEnd.findIndex((group) =>
  (group?.hooks ?? []).some((h) => typeof h?.command === "string" && h.command.includes(MARKER)),
);

if (existing > -1) {
  settings.hooks.SessionEnd[existing] = entry;
  console.log("Updated the existing Clerkr SessionEnd hook.");
} else {
  settings.hooks.SessionEnd.push(entry);
  console.log("Added the Clerkr SessionEnd hook.");
}

writeFileSync(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`);

console.log(`
  settings   ${SETTINGS}
  hook       ${HOOK_PATH}
  url        ${settings.env.CLERKR_URL}
  repos      ${repos}
  other SessionEnd hooks left untouched: ${settings.hooks.SessionEnd.length - 1}

Sessions whose cwd contains one of [${repos}] will be offered to Clerkr OS when
they end. Everything else never leaves the machine. Watch it work:

  tail -f ~/.clerkr-hook.log
`);
