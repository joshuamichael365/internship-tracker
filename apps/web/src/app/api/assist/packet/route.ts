import { NextResponse } from "next/server";
import { applications, db, desc, documents, eq, profile } from "@tracker/db";
import { ASSIST_CORS, assistAuthorized, assistPreflight } from "@/lib/extension-auth";

/** The Chrome extension's data source — bearer-token auth, session-free. */

export function OPTIONS() {
  return assistPreflight();
}

export async function GET(req: Request) {
  if (!assistAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: ASSIST_CORS });
  }

  const url = new URL(req.url).searchParams.get("url") ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return NextResponse.json({ error: "bad url" }, { status: 400, headers: ASSIST_CORS });
  }

  // Match the active tab to a tracked application by URL, then hostname.
  const apps = await db.select().from(applications).orderBy(desc(applications.updatedAt));
  const match =
    apps.find((a) => a.url && url.startsWith(a.url.split("?")[0]!)) ??
    apps.find((a) => {
      try {
        return new URL(a.url).hostname === host;
      } catch {
        return false;
      }
    });

  if (!match) return NextResponse.json({ match: null }, { headers: ASSIST_CORS });

  const [prof] = await db.select().from(profile).limit(1);
  const docs = await db
    .select()
    .from(documents)
    .where(eq(documents.applicationId, match.id))
    .orderBy(desc(documents.createdAt));
  const coverLetterDoc = docs.find((d) => d.kind === "cover_letter");

  return NextResponse.json(
    {
      match: {
        applicationId: match.id,
        company: match.company,
        roleTitle: match.roleTitle,
        mode: match.mode,
        drafts: match.drafts ?? {},
        coverLetterPdfUrl: coverLetterDoc ? `/api/assist/document/${coverLetterDoc.id}` : null,
      },
      profile: prof?.data ?? {},
    },
    { headers: ASSIST_CORS },
  );
}
