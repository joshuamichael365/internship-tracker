CREATE TABLE "latex_resumes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"compiled_key" text,
	"compile_log" text,
	"last_compiled_at" timestamp with time zone,
	"chat_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
