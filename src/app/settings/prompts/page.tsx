import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import {
  DEFAULT_CHAT_PROMPT,
  DEFAULT_IMPROVE_PROMPT,
  DEFAULT_INTAKE_PROMPT,
  DEFAULT_MEETING_PROMPT,
  DEFAULT_TRANSCRIBE_CLEANUP_PROMPT,
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
  const intakeValue = byKey.get(PROMPT_KEYS.intake) ?? DEFAULT_INTAKE_PROMPT;
  const improveValue = byKey.get(PROMPT_KEYS.improve) ?? DEFAULT_IMPROVE_PROMPT;
  const transcribeValue =
    byKey.get(PROMPT_KEYS.transcribe) ?? DEFAULT_TRANSCRIBE_CLEANUP_PROMPT;

  return (
    <AppShell email={session.user.email}>
      <main className="mx-auto w-full max-w-3xl px-6 space-y-6 py-8">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/settings" className="hover:underline">
            Settings
          </Link>
          <span>/</span>
          <span>AI prompts</span>
        </div>
        <div>
          <h1 className="text-display text-[28px] font-semibold leading-tight">AI prompts</h1>
          <p className="text-sm text-muted-foreground">
            The system prompts the AI reads before firing. These are{" "}
            <strong className="font-medium text-foreground">shared by everyone</strong> — this is an
            internal tool, so tuning a prompt here tunes it for the whole team. Use “Reset to
            default” to fall back to the built-in prompt.
          </p>
        </div>

        <PromptEditor
          settingKey={PROMPT_KEYS.intake}
          title="Intake — what is this?"
          description="The one that reads a raw paste and decides what it is: a meeting, three bugs, a board card, a note. Governs how the proposal cards on /chat get built, and how hard it pushes back on near-duplicates. {{STATUSES}} is replaced with the live status list."
          value={intakeValue}
          isCustom={byKey.has(PROMPT_KEYS.intake)}
        />

        <PromptEditor
          settingKey={PROMPT_KEYS.improve}
          title="Improve my prompt"
          description="Rewrites a draft in the /chat composer so it lands well on intake or the Copilot. {{MODE}} is replaced with a description of whichever of the two is selected, and the live categories, columns and open tickets are appended."
          value={improveValue}
          isCustom={byKey.has(PROMPT_KEYS.improve)}
        />

        <PromptEditor
          settingKey={PROMPT_KEYS.transcribe}
          title="Voice — transcript cleanup"
          description="The light pass a dictated message gets before it lands in the composer: mis-heard words, punctuation, filler. Deliberately not allowed to summarise or reason."
          value={transcribeValue}
          isCustom={byKey.has(PROMPT_KEYS.transcribe)}
        />

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
    </AppShell>
  );
}
