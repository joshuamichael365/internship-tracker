"use server";

import { signOut } from "@/auth";

/** Bound to the sidebar's sign-out form — client components import server actions directly. */
export async function signOutAction() {
  await signOut({ redirectTo: "/signin" });
}
