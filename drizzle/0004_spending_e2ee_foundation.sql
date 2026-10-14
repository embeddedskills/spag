ALTER TABLE "spag_expenses" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "spag_expenses" ADD COLUMN "encrypted_payload" text;