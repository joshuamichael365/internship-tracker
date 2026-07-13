import { auth } from "@/auth";
import { TopNav } from "@/components/top-nav";
import { ToastProvider } from "@/components/toast";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const account = session?.user
    ? {
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        image: session.user.image ?? null,
      }
    : null;

  return (
    <ToastProvider>
      <div className="min-h-dvh">
        <TopNav account={account} />
        <main className="mx-auto max-w-7xl px-5 py-6 md:px-10 md:py-8">{children}</main>
      </div>
    </ToastProvider>
  );
}
