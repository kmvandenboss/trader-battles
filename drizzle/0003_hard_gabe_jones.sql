CREATE TABLE "trader_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"inviter_user_id" text NOT NULL,
	"invitee_name" text,
	"invitee_email" text NOT NULL,
	"message" text,
	"invite_code" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trader_invites" ADD CONSTRAINT "trader_invites_inviter_user_id_users_id_fk" FOREIGN KEY ("inviter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "trader_invites_invite_code_idx" ON "trader_invites" USING btree ("invite_code");