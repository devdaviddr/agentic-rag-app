CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"ollama_base_url" text,
	"chat_model" text,
	"embed_model" text,
	"vision_model" text,
	"chat_temperature" real,
	"rag_top_k" integer,
	"rag_chunk_size" integer,
	"rag_chunk_overlap" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_singleton" CHECK ("app_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "document_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"page" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"kind" text NOT NULL,
	"mime_type" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bbox" jsonb,
	"bytes" "bytea" NOT NULL,
	"summary" text,
	"summary_embedding" vector(768),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "image_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "page" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ingest_status" text DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "ingest_error" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "pages_total" integer;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "pages_done" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "extraction_method" text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "document_images" ADD CONSTRAINT "document_images_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_images_doc_page_idx" ON "document_images" USING btree ("document_id","page","ordinal");--> statement-breakpoint
CREATE INDEX "document_images_embedding_idx" ON "document_images" USING hnsw ("summary_embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE INDEX "chunks_image_ids_idx" ON "chunks" USING gin ("image_ids");--> statement-breakpoint
INSERT INTO "app_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;