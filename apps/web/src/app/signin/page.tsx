import { SquareKanban } from "lucide-react";
import { signIn } from "@/auth";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl bg-surface p-8 text-center shadow-raised">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-white shadow-card">
          <SquareKanban className="h-7 w-7" />
        </div>
        <h1 className="text-[22px] font-bold tracking-tight">Internships</h1>
        <p className="mt-1 text-[14px] text-secondary">
          Your private internship discovery & application assistant
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
          className="mt-7"
        >
          <button
            type="submit"
            className="w-full rounded-xl bg-accent px-4 py-2.5 text-[15px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Continue with Google
          </button>
        </form>
        <p className="mt-4 text-[12px] text-tertiary">Single-user app — only the owner can sign in.</p>
      </div>
    </main>
  );
}
