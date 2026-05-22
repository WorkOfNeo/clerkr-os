// Wire-shape probe per wiki cmozdetqx000kqa159ou8f2do. Builds the same
// MCP server the app builds, attaches a capture-only transport, replays
// `initialize` + `tools/list` against it, and prints exactly what would
// go on the wire. Run: npx tsx scripts/probe-mcp.ts

import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { buildServer } from "../src/lib/mcp/server";

class CaptureTransport implements Transport {
  onmessage?: (msg: unknown) => void;
  onerror?: (err: Error) => void;
  onclose?: () => void;
  sent: unknown[] = [];

  async start() {
    /* no-op */
  }
  async close() {
    this.onclose?.();
  }
  async send(msg: unknown) {
    this.sent.push(msg);
  }
  inject(msg: unknown) {
    this.onmessage?.(msg);
  }
}

async function main() {
  const server = buildServer({
    userId: "probe-user",
    origin: "https://example.com",
  });
  const t = new CaptureTransport();
  await server.connect(t);

  // 1. initialize
  t.inject({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "probe", version: "0.0.1" },
    },
  });

  // 2. initialized notification
  t.inject({ jsonrpc: "2.0", method: "notifications/initialized" });

  // 3. tools/list
  t.inject({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });

  // Let the server's handlers settle.
  await new Promise((r) => setTimeout(r, 200));

  for (const m of t.sent) {
    console.log(JSON.stringify(m, null, 2));
    console.log("---");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
