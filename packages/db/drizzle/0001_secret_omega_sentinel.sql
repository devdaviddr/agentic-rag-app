ALTER TABLE "documents" ADD COLUMN "mime_type" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "bytes" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "original_content" "bytea";