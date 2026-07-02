import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Single-user app: Google sign-in, hard allowlisted to ALLOWED_EMAIL.
 * JWT sessions — no database adapter needed.
 *
 * AUTH_DISABLED=true is a local-dev escape hatch for before Google OAuth
 * credentials exist. It must never be set in production.
 */
export const authDisabled =
  process.env.AUTH_DISABLED === "true" && process.env.NODE_ENV !== "production";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  callbacks: {
    signIn({ user }) {
      const allowed = process.env.ALLOWED_EMAIL?.toLowerCase();
      return !!allowed && user.email?.toLowerCase() === allowed;
    },
    authorized({ auth }) {
      return authDisabled || !!auth?.user;
    },
  },
});
