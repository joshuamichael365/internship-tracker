"use server";

import { db, settings } from "@tracker/db";
import { runAssistant, type AssistantMessage } from "@/lib/assistant";

/** Persisted-history cap — enough for continuity without bloating the row. */
const HISTORY_CAP = 30;

async function upsertHistory(history: AssistantMessage[]) {
  await db
    .insert(settings)
    .values({ id: true, assistantChatHistory: history, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.id,
      set: { assistantChatHistory: history, updatedAt: new Date() },
    });
}

export async function askAssistant(message: string): Promise<{ reply: string }> {
  const trimmed = message.trim().slice(0, 4000);
  if (!trimmed) return { reply: "" };

  const [row] = await db.select({ history: settings.assistantChatHistory }).from(settings).limit(1);
  const history = row?.history ?? [];

  const reply = await runAssistant(history, trimmed);

  await upsertHistory(
    [...history, { role: "user" as const, content: trimmed }, { role: "assistant" as const, content: reply }].slice(
      -HISTORY_CAP,
    ),
  );
  return { reply };
}

export async function clearAssistantChat() {
  await upsertHistory([]);
}
