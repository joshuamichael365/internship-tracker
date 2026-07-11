import { PageHeader } from "@/components/ui";
import { ScreenshotIntake } from "@/components/screenshot-intake";

export const metadata = { title: "Screenshot Intake" };

export default function IntakePage() {
  return (
    <>
      <PageHeader
        title="Screenshot intake"
        subtitle="Screenshot a story or post announcing a new internship, and Claude will pull out the details for you to confirm."
      />
      <ScreenshotIntake />
    </>
  );
}
