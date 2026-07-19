CREATE TABLE "mutation_idempotency" (
	"key" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
