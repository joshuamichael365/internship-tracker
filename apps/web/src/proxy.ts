import { auth } from "@/auth";

// NextAuth's `auth` doubles as the proxy handler: unauthenticated requests
// (per the `authorized` callback in src/auth.ts) get redirected to /signin.
export default auth;

export const config = {
  // Protect everything except auth endpoints, the sign-in page, and static assets.
  // manifest.json must be publicly fetchable (unauthenticated) for PWA
  // installability — browsers request it without cookies/session.
  matcher: ["/((?!api/auth|api/assist|signin|_next/static|_next/image|favicon.ico|icons|sw.js|manifest.json).*)"],
};
