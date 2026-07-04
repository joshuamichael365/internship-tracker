import { NextResponse } from "next/server";
import { compileLatexResume } from "@/lib/latex-compile";

/** Session-gated (behind the normal proxy wall) — no token auth needed here. */
export async function POST(req: Request) {
  let body: { id?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  const id = Number(body.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const result = await compileLatexResume(id);
  if (!result.ok) {
    return NextResponse.json(result, { status: 422 });
  }
  return NextResponse.json(result);
}
