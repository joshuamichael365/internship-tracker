import { auth } from "@/auth";
import { Sidebar } from "@/components/sidebar";
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
        <Sidebar account={account} />
        <main className="px-5 py-6 md:ml-60 md:px-10 md:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
