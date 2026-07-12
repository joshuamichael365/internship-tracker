import { NextResponse } from "next/server";
import { compileLatexPreview, compileLatexResume } from "@/lib/latex-compile";

/** Session-gated (behind the normal proxy wall) — no token auth needed here. */
export async function POST(req: Request) {
  let body: { id?: number; source?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const id = Number(body.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  // A `source` in the body means "compile this proposed change as a throwaway
  // preview" — the saved resume and its compiled PDF are left untouched. Without
  // it, compile the resume's own saved source and persist the result as usual.
  const result =
    typeof body.source === "string" && body.source.trim()
      ? await compileLatexPreview(id, body.source)
      : await compileLatexResume(id);

  if (!result.ok) {
    return NextResponse.json(result, { status: 422 });
  }
  return NextResponse.json(result);
}
