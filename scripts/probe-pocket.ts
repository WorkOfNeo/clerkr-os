// Sends a correctly-signed Pocket webhook at a running instance, so the
// integration can be verified without waiting on a device to finish a
// recording. Signs exactly the way Pocket does — HMAC-SHA256 over
// `{timestamp}.{rawBody}` — so a 401 here is a real secret mismatch.
//
//   npm run probe:pocket -- --secret whsec_… [--url http://localhost:3000]
//
// Prints the response. On success the meeting appears at the href it returns.

import crypto from "node:crypto";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const url = arg("url") ?? process.env.POCKET_PROBE_URL ?? "http://localhost:3000";
const secret = arg("secret") ?? process.env.POCKET_PROBE_SECRET;
const email = arg("email") ?? "probe@example.com";
const event = arg("event") ?? "summary.completed";

if (!secret) {
  console.error(
    "Missing --secret. Use the signing secret you pasted into /settings/pocket.\n" +
      "  npm run probe:pocket -- --secret whsec_… --url https://your-app",
  );
  process.exit(1);
}

const now = new Date();
// A distinct recording id per run, so repeat probes don't just update the same
// meeting — pass --recording to re-send for one deliberately and watch the
// upsert path instead.
const recordingId = arg("recording") ?? `probe_${now.getTime()}`;

const payload = {
  event,
  timestamp: now.toISOString(),
  user: { id: "user_probe", email },
  recording: {
    id: recordingId,
    title: `Probe recording ${now.toLocaleTimeString("en-US")}`,
    description: "Sent by scripts/probe-pocket.ts",
    duration: 420,
    language: "English",
    createdAt: now.toISOString(),
  },
  summarizations: {
    sum_probe: {
      processingStatus: "completed",
      createdAt: now.toISOString(),
      v2: {
        summary: {
          title: "Probe recording",
          markdown:
            "The team agreed to move the Pocket integration behind a signing secret, " +
            "and to keep every extracted item as a proposal rather than writing records directly.",
          bulletPoints: ["Webhook must verify HMAC", "Proposals, not auto-created records"],
        },
        actionItems: {
          actionItems: [
            { title: "Confirm the webhook lands a meeting", dueDate: null, status: "TODO" },
          ],
        },
      },
    },
  },
  transcript: [
    { speaker: "Alice", text: "Did the Pocket webhook come through?", start: 0, end: 2.4 },
    { speaker: "Bob", text: "It should land as a meeting with cards.", start: 2.4, end: 5.1 },
    { speaker: "Bob", text: "Nothing gets filed until someone accepts one.", start: 5.1, end: 8.0 },
    { speaker: "Alice", text: "Good. Let's check the meetings page.", start: 8.0, end: 10.2 },
  ],
};

// The signature covers these exact bytes — everything downstream must use them
// verbatim, which is why the route reads req.text() and never req.json().
const rawBody = JSON.stringify(payload);
const timestamp = String(Date.now());
const signature = crypto
  .createHmac("sha256", secret)
  .update(`${timestamp}.${rawBody}`)
  .digest("hex");

const endpoint = `${url.replace(/\/$/, "")}/api/webhooks/pocket`;

async function main() {
  console.log(`POST ${endpoint}\n  event      ${event}\n  recording  ${recordingId}\n`);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "HeyPocket-Webhook/1.0",
      "x-heypocket-signature": signature,
      "x-heypocket-timestamp": timestamp,
    },
    body: rawBody,
  });

  const text = await res.text();
  console.log(`${res.status} ${res.statusText}`);
  console.log(text);

  if (res.status === 401) {
    console.log(
      "\nThe secret does not match any connection. Check the one saved at /settings/pocket.",
    );
  } else if (res.status === 307 || res.status === 302) {
    console.log(
      "\nRedirected — /api/webhooks/ is not in the allowlist in src/proxy.ts, so the " +
        "request never reached the handler.",
    );
  } else if (res.ok) {
    console.log("\nReading the transcript happens after the response; give it a few seconds.");
  }

  process.exitCode = res.ok ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
