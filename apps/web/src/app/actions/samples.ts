"use server";

import { revalidatePath } from "next/cache";
import { db, eq, writingSamples } from "@tracker/db";

export async function addWritingSample(set: "cover_letter" | "short_answer", formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!title || !content) return;
  await db.insert(writingSamples).values({ set, title, content });
  revalidatePath("/profile");
}

export async function deleteWritingSample(id: number) {
  await db.delete(writingSamples).where(eq(writingSamples.id, id));
  revalidatePath("/profile");
}
