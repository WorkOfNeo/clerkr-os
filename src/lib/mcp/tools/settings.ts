import { z } from "zod";

import {
  DEFAULT_CHAT_PROMPT,
  DEFAULT_MEETING_PROMPT,
  PROMPT_KEYS,
} from "@/lib/ai/prompts";
import { db } from "@/lib/db";

import type { ToolDef } from "./types";

// Mirrors /settings/prompts — the editable AI system prompts stored in
// app_setting. API-token management stays UI-only on purpose (an MCP client
// must not be able to mint or revoke credentials).

const KEY_INFO = [
  {
    key: PROMPT_KEYS.meeting,
    label: "Meeting brief extraction",
    default: DEFAULT_MEETING_PROMPT,
  },
  {
    key: PROMPT_KEYS.chat,
    label: "Copilot chat",
    default: DEFAULT_CHAT_PROMPT,
  },
] as const;

const VALID_KEYS = KEY_INFO.map((k) => k.key);

const keySchema = z.enum([PROMPT_KEYS.meeting, PROMPT_KEYS.chat]);

export const SETTINGS_TOOLS: ToolDef[] = [
  {
    name: "list_prompts",
    description:
      "List the editable AI system prompts (meeting extraction + Copilot chat): current " +
      "effective value, whether it's customized or the code default, and the default text.",
    inputSchema: { type: "object", properties: {} },
    handler: async () => {
      const rows = await db.appSetting.findMany({ where: { key: { in: [...VALID_KEYS] } } });
      const byKey = new Map(rows.map((r) => [r.key, r]));
      return {
        prompts: KEY_INFO.map((k) => {
          const row = byKey.get(k.key);
          const customized = Boolean(row?.value?.trim());
          return {
            key: k.key,
            label: k.label,
            customized,
            value: customized ? row!.value : k.default,
            default: k.default,
            updatedAt: row?.updatedAt ?? null,
          };
        }),
      };
    },
  },

  {
    name: "save_prompt",
    description:
      "Overwrite an editable AI system prompt. The AI reads it before every extraction / " +
      "chat turn, so changes take effect immediately. Use reset_prompt to go back to the " +
      "code default.",
    inputSchema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          enum: [PROMPT_KEYS.meeting, PROMPT_KEYS.chat],
        },
        value: { type: "string", description: "The full new system prompt." },
      },
      required: ["key", "value"],
    },
    handler: async (args) => {
      const input = z.object({ key: keySchema, value: z.string().min(1) }).parse(args);
      const setting = await db.appSetting.upsert({
        where: { key: input.key },
        create: { key: input.key, value: input.value },
        update: { value: input.value },
      });
      return { key: setting.key, customized: true, updatedAt: setting.updatedAt };
    },
  },

  {
    name: "reset_prompt",
    description: "Reset an editable AI system prompt back to the code default.",
    inputSchema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          enum: [PROMPT_KEYS.meeting, PROMPT_KEYS.chat],
        },
      },
      required: ["key"],
    },
    handler: async (args) => {
      const { key } = z.object({ key: keySchema }).parse(args);
      await db.appSetting.deleteMany({ where: { key } });
      return { key, customized: false };
    },
  },
];
