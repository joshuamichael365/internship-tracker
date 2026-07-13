import { Bricolage_Grotesque } from "next/font/google";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Landing } from "@/components/landing";

// Distinctive display face for the landing only (scoped via the wrapper class).
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata = {
  title: "Erevnitis — find internships the moment they open",
};

export default async function SignInPage() {
  // Logged-out visitors get the marketing landing; the owner goes straight in.
  const session = await auth();
  if (session?.user) redirect("/");
  return (
    <div className={display.variable}>
      <Landing />
    </div>
  );
}
