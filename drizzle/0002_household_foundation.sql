ALTER TABLE "spag_user" ADD COLUMN "active_household_id" uuid;

CREATE TABLE "spag_households" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "created_by_user_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "spag_household_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "role" text DEFAULT 'member' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "spag_household_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL,
  "invited_email" text NOT NULL,
  "invited_by_user_id" text NOT NULL,
  "token" text NOT NULL,
  "accepted_at" timestamp,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "spag_household_invites_token_unique" UNIQUE("token")
);

ALTER TABLE "spag_expenses" ADD COLUMN "expense_type" text DEFAULT 'variable' NOT NULL;
ALTER TABLE "spag_expenses" ADD COLUMN "household_id" uuid;
ALTER TABLE "spag_expenses" ADD COLUMN "created_by_user_id" text;

ALTER TABLE "spag_households" ADD CONSTRAINT "spag_households_created_by_user_id_spag_user_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."spag_user"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "spag_household_members" ADD CONSTRAINT "spag_household_members_household_id_spag_households_id_fk"
  FOREIGN KEY ("household_id") REFERENCES "public"."spag_households"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "spag_household_members" ADD CONSTRAINT "spag_household_members_user_id_spag_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."spag_user"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "spag_household_invites" ADD CONSTRAINT "spag_household_invites_household_id_spag_households_id_fk"
  FOREIGN KEY ("household_id") REFERENCES "public"."spag_households"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "spag_household_invites" ADD CONSTRAINT "spag_household_invites_invited_by_user_id_spag_user_id_fk"
  FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."spag_user"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "spag_expenses" ADD CONSTRAINT "spag_expenses_household_id_spag_households_id_fk"
  FOREIGN KEY ("household_id") REFERENCES "public"."spag_households"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "spag_expenses" ADD CONSTRAINT "spag_expenses_created_by_user_id_spag_user_id_fk"
  FOREIGN KEY ("created_by_user_id") REFERENCES "public"."spag_user"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "household_member_unique" ON "spag_household_members" ("household_id", "user_id");

WITH created_households AS (
  INSERT INTO "spag_households" ("name", "created_by_user_id")
  SELECT 'My Household', u."id"
  FROM "spag_user" u
  RETURNING "id", "created_by_user_id"
)
INSERT INTO "spag_household_members" ("household_id", "user_id", "role")
SELECT ch."id", ch."created_by_user_id", 'owner'
FROM created_households ch;

UPDATE "spag_user" u
SET "active_household_id" = hm."household_id"
FROM "spag_household_members" hm
WHERE hm."user_id" = u."id"
  AND u."active_household_id" IS NULL;

UPDATE "spag_expenses" e
SET "created_by_user_id" = e."user_id"
WHERE e."created_by_user_id" IS NULL;

UPDATE "spag_expenses" e
SET "household_id" = u."active_household_id"
FROM "spag_user" u
WHERE u."id" = e."user_id"
  AND e."household_id" IS NULL;
