import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __trackerDb: ReturnType<typeof createDb> | undefined;
}

function createDb() {
  const url = process.env.DATABASE_URL ?? "postgres://localhost:5432/internship_tracker";
  const client = postgres(url, { max: 5 });
  return drizzle(client, { schema });
}

/** Singleton — survives Next.js dev hot reloads without leaking connections. */
export const db = globalThis.__trackerDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalThis.__trackerDb = db;
