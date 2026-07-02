import { db, desc, profile, resumes, writingSamples } from "@tracker/db";
import { Card, PageHeader } from "@/components/ui";
import { ProfileForm, ResumeManager } from "@/components/profile-manager";
import { WritingSamples } from "@/components/writing-samples";

export const metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const [rows, [prof], samples] = await Promise.all([
    db.select().from(resumes).orderBy(desc(resumes.createdAt)),
    db.select().from(profile).limit(1),
    db.select().from(writingSamples).orderBy(desc(writingSamples.createdAt)),
  ]);

  return (
    <>
      <PageHeader title="Profile" subtitle="Resumes, structured profile data, and writing samples" />
      <div className="grid gap-4">
        <Card>
          <h2 className="mb-1 text-[17px] font-semibold">Resumes</h2>
          <p className="mb-2 text-[13px] text-secondary">
            Keep multiple versions and choose which one to use per application.
          </p>
          <ResumeManager
            resumes={rows.map((r) => ({
              id: r.id,
              name: r.name,
              isDefault: r.isDefault,
              createdAt: r.createdAt.toISOString(),
              parsed: r.parsed !== null,
            }))}
          />
        </Card>
        <Card>
          <h2 className="mb-3 text-[17px] font-semibold">Auto-fill profile</h2>
          <ProfileForm initial={(prof?.data ?? {}) as Record<string, string>} />
        </Card>
        <Card>
          <h2 className="mb-3 text-[17px] font-semibold">Writing samples</h2>
          <WritingSamples
            coverLetters={samples.filter((s) => s.set === "cover_letter")}
            shortAnswers={samples.filter((s) => s.set === "short_answer")}
          />
        </Card>
      </div>
    </>
  );
}
