ALTER TABLE "spag_user" ADD COLUMN "encryption_public_key" text;
--> statement-breakpoint
ALTER TABLE "spag_user" ADD COLUMN "encrypted_private_key" text;
--> statement-breakpoint
ALTER TABLE "spag_agenda_items" ALTER COLUMN "title" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "spag_agenda_items" ADD COLUMN "encrypted_payload" text;