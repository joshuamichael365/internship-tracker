import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const sourceKind = pgEnum("source_kind", [
  "github_repo",
  "greenhouse",
  "lever",
  "smartrecruiters",
  "workday",
  "rss",
  "instagram_mirror",
]);

export const roleType = pgEnum("role_type", ["swe", "ml", "data", "quant", "other"]);
export const jobLevel = pgEnum("job_level", ["internship", "new_grad"]);
export const locationMode = pgEnum("location_mode", ["remote", "hybrid", "onsite", "unknown"]);
export const postingStatus = pgEnum("posting_status", ["active", "expired", "hidden"]);
export const sponsorship = pgEnum("sponsorship", ["sponsors", "citizens_only", "unknown"]);

export const applicationMode = pgEnum("application_mode", ["manual", "assist", "auto"]);
export const applicationStage = pgEnum("application_stage", [
  "saved",
  "in_progress",
  "applied",
  "assessment",
  "interviewing",
  "offer",
  "rejected",
]);

export const notificationChannel = pgEnum("notification_channel", ["push", "email", "sms"]);
export const notificationKind = pgEnum("notification_kind", [
  "instant",
  "digest",
  "confirmation",
  "blocker",
]);

export const sampleSet = pgEnum("sample_set", ["cover_letter", "short_answer"]);
export const documentKind = pgEnum("document_kind", [
  "resume",
  "cover_letter",
  "short_answers",
  "other",
]);
export const storageDestination = pgEnum("storage_destination", ["inapp", "local", "gdrive"]);

/** User-managed discovery sources (GitHub repos, ATS boards, feeds). */
export const sources = pgTable("sources", {
  id: serial("id").primaryKey(),
  kind: sourceKind("kind").notNull(),
  name: text("name").notNull(),
  /** kind-specific: { repo }, { boardToken }, { company }, { feedUrl }, ... */
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  enabled: boolean("enabled").notNull().default(true),
  lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
  /** ETag / Last-Modified for conditional requests */
  httpCache: jsonb("http_cache").$type<Record<string, string>>(),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const postings = pgTable(
  "postings",
  {
    id: serial("id").primaryKey(),
    dedupeHash: text("dedupe_hash").notNull(),
    company: text("company").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    locations: jsonb("locations").$type<string[]>().notNull().default([]),
    locationMode: locationMode("location_mode").notNull().default("unknown"),
    roleType: roleType("role_type").notNull().default("other"),
    jobLevel: jobLevel("job_level").notNull().default("internship"),
    description: text("description"),
    deadline: timestamp("deadline", { withTimezone: true }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    status: postingStatus("status").notNull().default("active"),
    sponsorship: sponsorship("sponsorship").notNull().default("unknown"),
    /** e.g. ["Summer 2026", "Fall 2026"] — from the source or parsed out of the title */
    terms: jsonb("terms").$type<string[]>().notNull().default([]),
    bookmarked: boolean("bookmarked").notNull().default(false),
    notes: text("notes"),
    /** every source that reported this posting: [{ sourceId, url, seenAt }] */
    seenIn: jsonb("seen_in")
      .$type<{ sourceId: number; url: string; seenAt: string }[]>()
      .notNull()
      .default([]),
    raw: jsonb("raw"),
  },
  (t) => [
    uniqueIndex("postings_dedupe_hash_idx").on(t.dedupeHash),
    index("postings_status_idx").on(t.status),
    index("postings_first_seen_idx").on(t.firstSeenAt),
  ],
);

export const resumes = pgTable("resumes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  fileKey: text("file_key").notNull(),
  /** Claude-parsed structure: education, experience, skills, projects, links */
  parsed: jsonb("parsed").$type<Record<string, unknown>>(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const applications = pgTable(
  "applications",
  {
    id: serial("id").primaryKey(),
    postingId: integer("posting_id").references(() => postings.id, { onDelete: "set null" }),
    company: text("company").notNull(),
    roleTitle: text("role_title").notNull(),
    location: text("location"),
    url: text("url").notNull(),
    /** null until the user explicitly picks a mode — never defaulted silently */
    mode: applicationMode("mode"),
    /** { recommended, reasons: string[], signals: {...} } from the recommendation engine */
    modeRecommendation: jsonb("mode_recommendation").$type<Record<string, unknown>>(),
    /** Latest user-reviewed drafts (raw text) — what the extension fills into portals */
    drafts: jsonb("drafts").$type<{
      coverLetter?: string;
      answers?: { prompt: string; answer: string }[];
    }>(),
    stage: applicationStage("stage").notNull().default("saved"),
    resumeId: integer("resume_id").references(() => resumes.id, { onDelete: "set null" }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("applications_stage_idx").on(t.stage)],
);

/** Follow-ups and OA deadlines tied to an application. */
export const reminders = pgTable("reminders", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  done: boolean("done").notNull().default(false),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
});

export const writingSamples = pgTable("writing_samples", {
  id: serial("id").primaryKey(),
  set: sampleSet("set").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id").references(() => applications.id, {
    onDelete: "set null",
  }),
  kind: documentKind("kind").notNull(),
  destination: storageDestination("destination").notNull(),
  /** R2 key, Drive file id, or suggested local path */
  location: text("location").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Single-row structured profile used for auto-fill (contact, education, work, links). */
export const profile = pgTable("profile", {
  id: boolean("id").primaryKey().default(true),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Single-row app settings. */
export const settings = pgTable("settings", {
  id: boolean("id").primaryKey().default(true),
  timezone: text("timezone").notNull().default("America/New_York"),
  quietHoursStart: integer("quiet_hours_start").notNull().default(23),
  quietHoursEnd: integer("quiet_hours_end").notNull().default(7),
  channels: jsonb("channels")
    .$type<{ push: boolean; email: boolean; sms: boolean }>()
    .notNull()
    .default({ push: true, email: true, sms: false }),
  includeNewGrad: boolean("include_new_grad").notNull().default(false),
  /** { roleTypes?, locationModes?, excludeCompanies?, keywords? } — see NotificationRules in @tracker/shared */
  notificationRules: jsonb("notification_rules")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  storageDestination: storageDestination("storage_destination").notNull().default("inapp"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  keys: jsonb("keys").$type<{ p256dh: string; auth: string }>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationLog = pgTable("notification_log", {
  id: serial("id").primaryKey(),
  postingId: integer("posting_id").references(() => postings.id, { onDelete: "set null" }),
  applicationId: integer("application_id").references(() => applications.id, {
    onDelete: "set null",
  }),
  channel: notificationChannel("channel").notNull(),
  kind: notificationKind("kind").notNull(),
  payload: jsonb("payload"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Postings held during quiet hours, flushed as the morning digest. */
export const digestQueue = pgTable("digest_queue", {
  id: serial("id").primaryKey(),
  postingId: integer("posting_id")
    .notNull()
    .references(() => postings.id, { onDelete: "cascade" }),
  queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});

/** Recommendation-vs-choice history so the engine can learn override patterns. */
export const modeDecisions = pgTable("mode_decisions", {
  id: serial("id").primaryKey(),
  applicationId: integer("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  recommended: applicationMode("recommended").notNull(),
  chosen: applicationMode("chosen").notNull(),
  signals: jsonb("signals").$type<Record<string, unknown>>(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
});
