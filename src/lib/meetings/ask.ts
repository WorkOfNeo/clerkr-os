import { CHAT_MODEL, getOpenAI, isOpenAIAvailable } from "@/lib/ai/openai";
import { db } from "@/lib/db";

import { meetingText } from "./structure";

// Asking questions about one meeting, answered from its own transcript.
//
// The point of this is the case where the summary is WRONG. A summary is a
// lossy read of a long conversation, and when it drops the third step of a
// plan there is nowhere to go — except that the transcript is still sitting
// right there. So this answers strictly from the meeting's own text and says
// when the text does not support an answer, rather than filling the gap in
// from somewhere else. A confident wrong answer here is worse than no answer:
// the whole reason someone is asking is that they already doubt the summary.

/** Room for a long meeting while leaving the model space to answer. */
const MAX_CONTEXT_CHARS = 120_000;
/** Earlier turns to carry, so follow-ups like "and then?" work. */
const HISTORY_TURNS = 8;

const SYSTEM = `You answer questions about ONE meeting, using only its summary and transcript.

Rules:
- Answer from the meeting text alone. Never use outside knowledge about the product, the people or the company.
- If the text does not answer the question, say so plainly and say what it DOES cover. Do not guess.
- The summary can be wrong or incomplete — the transcript is the evidence. Where they disagree, trust the transcript and say that you are.
- Quote or paraphrase the relevant lines when it helps someone check you.
- The transcript may label speakers SPEAKER_00, SPEAKER_01 and so on when nobody has named them. Use those labels as they are; do not invent names.
- The meeting may not be in English. Answer in the language the QUESTION was asked in.
- Be direct and concrete. When asked for steps, give a numbered list in the order they were actually discussed.`;

export interface AskResult {
  answer: string;
  error?: string;
}

export async function askMeeting(input: {
  meetingId: string;
  question: string;
}): Promise<AskResult> {
  const { meetingId } = input;
  const question = input.question.trim();
  if (!question) return { answer: "", error: "Ask something first." };

  if (!isOpenAIAvailable()) {
    return { answer: "", error: "OPENAI_API_KEY is not set, so questions can't be answered." };
  }

  const meeting = await db.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, title: true, transcript: true, summary: true, meetingDate: true },
  });
  if (!meeting) return { answer: "", error: "Meeting not found." };

  const full = meetingText(meeting);
  if (!full.trim()) {
    return { answer: "", error: "This meeting has no transcript or summary to read." };
  }

  const history = await db.meetingMessage.findMany({
    where: { meetingId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_TURNS,
    select: { role: true, content: true },
  });

  const head = [
    `Meeting: ${meeting.title}`,
    `Date: ${meeting.meetingDate.toISOString().slice(0, 10)}`,
    meeting.summary?.trim()
      ? `\n--- SUMMARY (may be wrong or incomplete) ---\n${meeting.summary.trim()}`
      : "\n(No summary for this meeting.)",
    meeting.transcript?.trim()
      ? `\n--- TRANSCRIPT ---\n${meeting.transcript.trim()}`
      : "\n(No transcript for this meeting — only the summary above.)",
  ].join("\n");

  // Trim the assembled block, not either part alone, and say so. Without the
  // note the model answers "that wasn't discussed" about something that was,
  // just past the cut — which is exactly the failure this feature exists to
  // fix, reintroduced one layer down.
  const truncated = head.length > MAX_CONTEXT_CHARS;
  const contextBlock = truncated
    ? `${head.slice(0, MAX_CONTEXT_CHARS)}\n\n(NOTE: the meeting text was too long and is cut off here. If the answer may lie past the cut, say so.)`
    : head;

  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "system", content: contextBlock },
        ...history
          .reverse()
          .map((m) => ({
            role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: m.content,
          })),
        { role: "user", content: question },
      ],
    });

    const answer = completion.choices[0]?.message?.content?.trim();
    if (!answer) return { answer: "", error: "The model returned nothing. Try rephrasing." };

    // Persist only once an answer exists, so a failed call doesn't leave a
    // question hanging in the thread with no reply under it.
    await db.meetingMessage.createMany({
      data: [
        { meetingId, role: "user", content: question },
        { meetingId, role: "assistant", content: answer },
      ],
    });

    return { answer };
  } catch (err) {
    return {
      answer: "",
      error: err instanceof Error ? err.message : "Could not reach OpenAI.",
    };
  }
}

export async function meetingMessages(meetingId: string) {
  return db.meetingMessage.findMany({
    where: { meetingId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, createdAt: true },
  });
}

export async function clearMeetingChat(meetingId: string): Promise<void> {
  await db.meetingMessage.deleteMany({ where: { meetingId } });
}
