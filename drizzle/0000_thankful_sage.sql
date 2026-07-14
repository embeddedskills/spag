CREATE TABLE "spag_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spag_agenda_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"content" text,
	"target_date" timestamp NOT NULL,
	"is_completed" boolean DEFAULT false,
	"notified" boolean NOT NULL,
	"repeat_interval" text DEFAULT 'none',
	"pinned" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spag_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"category" text DEFAULT 'General' NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spag_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "spag_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "spag_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"username" text,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "spag_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "spag_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "spag_account" ADD CONSTRAINT "spag_account_user_id_spag_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."spag_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spag_agenda_items" ADD CONSTRAINT "spag_agenda_items_user_id_spag_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."spag_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spag_expenses" ADD CONSTRAINT "spag_expenses_user_id_spag_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."spag_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spag_session" ADD CONSTRAINT "spag_session_user_id_spag_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."spag_user"("id") ON DELETE cascade ON UPDATE no action;