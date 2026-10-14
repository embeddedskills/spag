CREATE TABLE "spag_agenda_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agenda_item_id" uuid NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"notified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spag_agenda_items" ADD COLUMN "schedule_mode" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "spag_agenda_items" ADD COLUMN "schedule_times" text DEFAULT '';--> statement-breakpoint
ALTER TABLE "spag_agenda_items" ADD COLUMN "interval_minutes" integer;--> statement-breakpoint
ALTER TABLE "spag_agenda_items" ADD COLUMN "duration_mode" text DEFAULT 'ongoing' NOT NULL;--> statement-breakpoint
ALTER TABLE "spag_agenda_items" ADD COLUMN "duration_days" integer;--> statement-breakpoint
ALTER TABLE "spag_agenda_items" ADD COLUMN "end_date" timestamp;--> statement-breakpoint
ALTER TABLE "spag_agenda_occurrences" ADD CONSTRAINT "spag_agenda_occurrences_agenda_item_id_spag_agenda_items_id_fk" FOREIGN KEY ("agenda_item_id") REFERENCES "public"."spag_agenda_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_occurrence_unique" ON "spag_agenda_occurrences" USING btree ("agenda_item_id","scheduled_at");