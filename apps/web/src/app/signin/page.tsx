import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Landing } from "@/components/landing";

export const metadata = {
  title: "Erevnitis — find internships the moment they open",
};

export default async function SignInPage() {
  // Logged-out visitors get the marketing landing; the owner goes straight in.
  const session = await auth();
  if (session?.user) redirect("/");
  return <Landing />;
}
