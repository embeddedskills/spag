ALTER TABLE "spag_expenses"
  ALTER COLUMN "amount" TYPE numeric(24, 8) USING "amount"::numeric(24, 8);
--> statement-breakpoint
ALTER TABLE "spag_budgets"
  ALTER COLUMN "amount" TYPE numeric(24, 8) USING "amount"::numeric(24, 8);
--> statement-breakpoint
ALTER TABLE "spag_income_sources"
  ALTER COLUMN "amount" TYPE numeric(24, 8) USING "amount"::numeric(24, 8);
--> statement-breakpoint
ALTER TABLE "spag_settlements"
  ALTER COLUMN "amount" TYPE numeric(24, 8) USING "amount"::numeric(24, 8);
--> statement-breakpoint
ALTER TABLE "spag_settlements"
  ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;
--> statement-breakpoint
CREATE INDEX "session_user_id_idx"
  ON "spag_session" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "group_member_status_idx"
  ON "spag_group_members" USING btree ("user_id", "status", "group_id");
--> statement-breakpoint
CREATE INDEX "expense_household_created_idx"
  ON "spag_expenses" USING btree ("household_id", "created_at");
--> statement-breakpoint
CREATE INDEX "expense_household_user_created_idx"
  ON "spag_expenses" USING btree ("household_id", "user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "expense_budget_id_idx"
  ON "spag_expenses" USING btree ("budget_id");
--> statement-breakpoint
CREATE INDEX "budget_household_created_idx"
  ON "spag_budgets" USING btree ("household_id", "created_at");
--> statement-breakpoint
CREATE INDEX "income_household_created_idx"
  ON "spag_income_sources" USING btree ("household_id", "created_at");
--> statement-breakpoint
CREATE INDEX "agenda_user_created_idx"
  ON "spag_agenda_items" USING btree ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX "agenda_user_target_idx"
  ON "spag_agenda_items" USING btree ("user_id", "target_date");
--> statement-breakpoint
CREATE INDEX "agenda_occurrence_schedule_idx"
  ON "spag_agenda_occurrences" USING btree ("agenda_item_id", "is_completed", "notified", "scheduled_at");
