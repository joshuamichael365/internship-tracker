import { db, settings } from "@tracker/db";
import { PageHeader } from "@/components/ui";
import { AssistantChat } from "@/components/assistant-chat";

export const metadata = { title: "Assistant" };
export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const [row] = await db.select({ history: settings.assistantChatHistory }).from(settings).limit(1);

  return (
    <>
      <PageHeader
        title="Assistant"
        subtitle="Ask about your postings, applications, and deadlines — answered from your live tracker data"
      />
      <AssistantChat initialHistory={row?.history ?? []} />
    </>
  );
}
