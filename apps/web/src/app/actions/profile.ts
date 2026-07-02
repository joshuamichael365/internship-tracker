"use server";

import { revalidatePath } from "next/cache";
import { db, eq, profile, resumes } from "@tracker/db";
import { deleteUpload, saveUpload } from "@/lib/storage";

export async function uploadResume(formData: FormData) {
  const file = formData.get("file") as File | null;
  const name = String(formData.get("name") ?? "").trim() || file?.name || "Resume";
  if (!file || file.size === 0 || file.size > 10 * 1024 * 1024) return;

  const fileKey = await saveUpload(file, "resumes");
  const existing = await db.select({ id: resumes.id }).from(resumes).limit(1);
  const [inserted] = await db
    .insert(resumes)
    .values({
      name,
      fileKey,
      isDefault: existing.length === 0, // first resume becomes the default
    })
    .returning({ id: resumes.id });

  // Structured parsing for auto-fill; silently skipped until the API key exists.
  try {
    const { parseResume } = await import("@/lib/resume-parse");
    await parseResume(inserted!.id);
  } catch (err) {
    console.error("[resume-parse]", err);
  }
  revalidatePath("/profile");
}

export async function deleteResume(id: number) {
  const [row] = await db.select().from(resumes).where(eq(resumes.id, id)).limit(1);
  if (!row) return;
  await db.delete(resumes).where(eq(resumes.id, id));
  await deleteUpload(row.fileKey);
  revalidatePath("/profile");
}

export async function setDefaultResume(id: number) {
  await db.update(resumes).set({ isDefault: false });
  await db.update(resumes).set({ isDefault: true }).where(eq(resumes.id, id));
  revalidatePath("/profile");
}

export async function saveProfile(data: Record<string, string>) {
  await db
    .insert(profile)
    .values({ id: true, data, updatedAt: new Date() })
    .onConflictDoUpdate({ target: profile.id, set: { data, updatedAt: new Date() } });
  revalidatePath("/profile");
}
