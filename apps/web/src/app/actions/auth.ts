"use server";

import { signIn, signOut } from "@/auth";

/** Bound to the sidebar's sign-out form — client components import server actions directly. */
export async function signOutAction() {
  await signOut({ redirectTo: "/signin" });
}

/** Bound to the landing page's "Continue with Google" forms. */
export async function signInWithGoogleAction() {
  await signIn("google", { redirectTo: "/" });
}
