"use server";

import { revalidatePath } from "next/cache";
import { db, eq, sources } from "@tracker/db";
import type { SourceKind } from "@tracker/shared";

const KIND_CONFIG_FIELDS: Record<SourceKind, string[]> = {
  github_repo: ["repo", "branch", "listingsPath", "columns"],
  greenhouse: ["boardToken"],
  lever: ["site"],
  smartrecruiters: ["company"],
  workday: ["host", "tenant", "site", "searchText"],
  rss: ["feedUrl", "defaultCompany"],
  instagram_mirror: ["feedUrl", "defaultCompany"],
};

export async function addSource(formData: FormData) {
  const kind = formData.get("kind") as SourceKind;
  const name = String(formData.get("name") ?? "").trim();
  if (!name || !(kind in KIND_CONFIG_FIELDS)) return;

  const config: Record<string, string> = {};
  for (const field of KIND_CONFIG_FIELDS[kind]) {
    const value = String(formData.get(field) ?? "").trim();
    if (value) config[field] = value;
  }
  await db.insert(sources).values({ kind, name, config });
  revalidatePath("/settings");
}

export async function toggleSource(id: number, enabled: boolean) {
  await db.update(sources).set({ enabled }).where(eq(sources.id, id));
  revalidatePath("/settings");
}

export async function deleteSource(id: number) {
  await db.delete(sources).where(eq(sources.id, id));
  revalidatePath("/settings");
}

/** One-click presets for the community internship repos that matter right now. */
export async function addPresetSource(preset: "simplify" | "vanshb03") {
  const presets = {
    simplify: {
      kind: "github_repo" as const,
      name: "SimplifyJobs / Summer Internships",
      config: {
        repo: "SimplifyJobs/Summer2026-Internships",
        branch: "dev",
        listingsPath: ".github/scripts/listings.json",
      },
    },
    vanshb03: {
      kind: "github_repo" as const,
      name: "vanshb03 / Summer 2027 Internships",
      config: {
        repo: "vanshb03/Summer2027-Internships",
        branch: "dev",
        listingsPath: ".github/scripts/listings.json",
      },
    },
  };
  const p = presets[preset];
  await db.insert(sources).values(p);
  revalidatePath("/settings");
}
