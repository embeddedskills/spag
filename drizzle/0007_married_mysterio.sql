ALTER TABLE "spag_group_members" ADD COLUMN "can_manage_categories" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "spag_groups" ADD COLUMN "expense_categories" text;--> statement-breakpoint
ALTER TABLE "spag_user" ADD COLUMN "expense_categories" text;