ALTER TABLE "spag_budgets" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "spag_income_sources" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "spag_posts" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "spag_user" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "spag_budgets" ADD COLUMN "encrypted_payload" text;--> statement-breakpoint
ALTER TABLE "spag_income_sources" ADD COLUMN "encrypted_payload" text;--> statement-breakpoint
ALTER TABLE "spag_posts" ADD COLUMN "encrypted_payload" text;--> statement-breakpoint
ALTER TABLE "spag_user" ADD COLUMN "encrypted_payload" text;