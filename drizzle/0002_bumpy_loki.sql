CREATE TYPE "public"."challenge_status" AS ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."scoring_mode" AS ENUM('PNL_V1', 'NORMALIZED_4F');--> statement-breakpoint
ALTER TYPE "public"."battle_status" ADD VALUE 'SETTLING' BEFORE 'COMPLETED';--> statement-breakpoint
ALTER TYPE "public"."integration_provider" ADD VALUE 'csv';--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"challenger_user_id" text NOT NULL,
	"opponent_user_id" text NOT NULL,
	"status" "challenge_status" NOT NULL,
	"session_date" text NOT NULL,
	"battle_window" "battle_window" NOT NULL,
	"market" "market",
	"account_bracket" text NOT NULL,
	"message" text,
	"battle_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "market_bars" (
	"id" text PRIMARY KEY NOT NULL,
	"instrument" "market" NOT NULL,
	"bar_start" timestamp with time zone NOT NULL,
	"open" double precision NOT NULL,
	"high" double precision NOT NULL,
	"low" double precision NOT NULL,
	"close" double precision NOT NULL,
	"volume" double precision NOT NULL,
	"source" text NOT NULL,
	"imported_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "battle_participants" ALTER COLUMN "trading_account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "battle_participants" ALTER COLUMN "ending_rating" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "battle_participants" ALTER COLUMN "final_score" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "battle_participants" ALTER COLUMN "result" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "battles" ALTER COLUMN "market" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "battle_participants" ADD COLUMN "realized_pnl" double precision;--> statement-breakpoint
ALTER TABLE "battle_participants" ADD COLUMN "participation_bonus" double precision;--> statement-breakpoint
ALTER TABLE "battle_participants" ADD COLUMN "closed_trade_count" integer;--> statement-breakpoint
ALTER TABLE "battle_participants" ADD COLUMN "gross_profit" double precision;--> statement-breakpoint
ALTER TABLE "battle_participants" ADD COLUMN "gross_loss" double precision;--> statement-breakpoint
ALTER TABLE "battle_participants" ADD COLUMN "mark_out_pnl" double precision;--> statement-breakpoint
ALTER TABLE "battle_participants" ADD COLUMN "mark_out_status" text;--> statement-breakpoint
ALTER TABLE "battle_participants" ADD COLUMN "mark_out_note" text;--> statement-breakpoint
ALTER TABLE "battles" ADD COLUMN "scheduled_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "battles" ADD COLUMN "scoring_mode" "scoring_mode" DEFAULT 'NORMALIZED_4F' NOT NULL;--> statement-breakpoint
ALTER TABLE "battles" ADD COLUMN "account_bracket" text;--> statement-breakpoint
ALTER TABLE "battles" ADD COLUMN "decided_by" text;--> statement-breakpoint
ALTER TABLE "battles" ADD COLUMN "resolution_detail" text;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_challenger_user_id_users_id_fk" FOREIGN KEY ("challenger_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_opponent_user_id_users_id_fk" FOREIGN KEY ("opponent_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_battle_id_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "market_bars_instrument_bar_start_idx" ON "market_bars" USING btree ("instrument","bar_start");