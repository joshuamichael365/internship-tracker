export * from "./client";
export * from "./schema";

// Re-export query operators so consumers don't need their own drizzle-orm copy.
export {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  like,
  lt,
  lte,
  ne,
  not,
  or,
  sql,
} from "drizzle-orm";
