import { SquareKanban } from "lucide-react";
import { signIn } from "@/auth";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4">
      {/* Soft animated radial accent behind the card — CSS only, dark-mode aware. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 40%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 animate-signin-glow rounded-full opacity-60"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in srgb, var(--purple) 14%, transparent), transparent 70%)",
        }}
      />

      <div className="w-full max-w-sm rounded-3xl bg-surface p-8 text-center shadow-raised">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[26px] bg-accent text-white shadow-card">
          <SquareKanban className="h-10 w-10" />
        </div>
        <h1 className="text-[24px] font-bold tracking-tight">Internships</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-secondary">
          Track every application in one place.
          <br />
          Never miss a deadline again.
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
            className="w-full rounded-xl bg-accent px-4 py-2.5 text-[15px] font-medium text-white transition-opacity hover:opacity-90 active:scale-[0.98]"
          >
            Continue with Google
          </button>
        </form>
        <p className="mt-4 text-[12px] text-tertiary">Single-user app — only the owner can sign in.</p>
      </div>
    </main>
  );
}
