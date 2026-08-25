import Link from "next/link";

import { AppNav } from "@/components/AppNav";
import {
  DEFAULT_CHAT_PROMPT,
  DEFAULT_MEETING_PROMPT,
  DEFAULT_TRIAGE_PROMPT,
  PROMPT_KEYS,
} from "@/lib/ai/prompts";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";

import { PromptEditor } from "./PromptEditor";

export default async function PromptsSettingsPage() {
  const session = await requireSession();

  const rows = await db.appSetting.findMany({
    where: { key: { in: Object.values(PROMPT_KEYS) } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));

  const meetingValue = byKey.get(PROMPT_KEYS.meeting) ?? DEFAULT_MEETING_PROMPT;
  const chatValue = byKey.get(PROMPT_KEYS.chat) ?? DEFAULT_CHAT_PROMPT;
  const triageValue = byKey.get(PROMPT_KEYS.triage) ?? DEFAULT_TRIAGE_PROMPT;

  return (
    <div className="min-h-screen">
      <AppNav email={session.user.email} />
      <main className="container max-w-3xl space-y-6 py-8">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/settings" className="hover:underline">
            Settings
          </Link>
          <span>/</span>
          <span>AI prompts</span>
        </div>
        <div>
          <h1 className="text-xl font-semibold">AI prompts</h1>
          <p className="text-sm text-muted-foreground">
            The system prompts the AI reads before firing. Edit them to tune how meetings get
            structured and how Copilot answers. Blank saves nothing; use “Reset to default” to fall
            back to the built-in prompt.
          </p>
        </div>

        <PromptEditor
          settingKey={PROMPT_KEYS.meeting}
          title="Meeting → Brief extraction"
          description="Governs how a pasted transcript is turned into decisions, feature signals, action items, and clusters."
          value={meetingValue}
          isCustom={byKey.has(PROMPT_KEYS.meeting)}
        />

        <PromptEditor
          settingKey={PROMPT_KEYS.chat}
          title="Copilot (chat)"
          description="The base persona and rules for the /chat assistant. Product + semantic context is appended automatically."
          value={chatValue}
          isCustom={byKey.has(PROMPT_KEYS.chat)}
        />

        <PromptEditor
          settingKey={PROMPT_KEYS.triage}
          title="Rough note → ticket"
          description="Turns a pasted note, email or bug report into one clean ticket — title, detail, category, priority. {{STATUSES}} is replaced with the live status list."
          value={triageValue}
          isCustom={byKey.has(PROMPT_KEYS.triage)}
        />
      </main>
    </div>
  );
}
