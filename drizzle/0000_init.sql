CREATE TYPE "public"."account_status" AS ENUM('ACTIVE', 'SUSPENDED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('PROP_EVALUATION', 'PROP_FUNDED', 'BROKERAGE', 'SIMULATED');--> statement-breakpoint
CREATE TYPE "public"."achievement_category" AS ENUM('PARTICIPATION', 'DISCIPLINE', 'IMPROVEMENT', 'COMPETITIVE_SUCCESS', 'MARKET_SPECIALIZATION');--> statement-breakpoint
CREATE TYPE "public"."battle_result" AS ENUM('WIN', 'LOSS', 'DRAW');--> statement-breakpoint
CREATE TYPE "public"."battle_status" AS ENUM('SCHEDULED', 'MATCHMAKING', 'LIVE', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."battle_style" AS ENUM('BALANCED', 'AGGRESSIVE', 'DEFENSIVE', 'MOMENTUM', 'SELECTIVE', 'HIGH_FREQUENCY');--> statement-breakpoint
CREATE TYPE "public"."battle_type" AS ENUM('LIVE_PERFORMANCE', 'REPLAY_CHALLENGE', 'DISCIPLINE_BATTLE');--> statement-breakpoint
CREATE TYPE "public"."battle_window" AS ENUM('OPENING_BELL', 'MIDDAY', 'AFTERNOON', 'FULL_SESSION');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('CONNECTED', 'DISCONNECTED', 'PENDING', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."connection_type" AS ENUM('SIMULATED', 'DESKTOP_ADDON', 'API', 'FILE_IMPORT');--> statement-breakpoint
CREATE TYPE "public"."division" AS ENUM('III', 'II', 'I');--> statement-breakpoint
CREATE TYPE "public"."execution_event_type" AS ENUM('ORDER_SUBMITTED', 'ORDER_ACCEPTED', 'ORDER_CANCELLED', 'ORDER_REJECTED', 'PARTIAL_FILL', 'FILL', 'POSITION_OPENED', 'POSITION_REDUCED', 'POSITION_CLOSED', 'ACCOUNT_SNAPSHOT');--> statement-breakpoint
CREATE TYPE "public"."firm_kind" AS ENUM('PROP_FIRM', 'AFFILIATION');--> statement-breakpoint
CREATE TYPE "public"."integration_provider" AS ENUM('mock', 'ninjatrader', 'tradovate', 'rithmic');--> statement-breakpoint
CREATE TYPE "public"."league" AS ENUM('BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND', 'ELITE');--> statement-breakpoint
CREATE TYPE "public"."market" AS ENUM('NQ', 'MNQ', 'ES', 'MES', 'CL', 'GC');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('MATCH_FOUND', 'OPPONENT_QUEUED', 'BATTLE_STARTING', 'BATTLE_RESULT', 'RATING_INCREASED', 'LEAGUE_PROMOTION', 'RIVAL_PASSED', 'NEW_CHALLENGE');--> statement-breakpoint
CREATE TYPE "public"."order_side" AS ENUM('BUY', 'SELL');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('SIMULATED', 'SELF_REPORTED', 'CLIENT_VERIFIED', 'PROVIDER_VERIFIED', 'MANUALLY_REVIEWED', 'DISPUTED');--> statement-breakpoint
CREATE TABLE "account_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"trading_account_id" text NOT NULL,
	"battle_id" text,
	"balance" double precision NOT NULL,
	"equity" double precision NOT NULL,
	"realized_pnl" double precision NOT NULL,
	"unrealized_pnl" double precision NOT NULL,
	"open_position" integer NOT NULL,
	"drawdown" double precision NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"source_provider" "integration_provider" NOT NULL,
	"verification_status" "verification_status" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" "achievement_category" NOT NULL,
	"icon" text NOT NULL,
	CONSTRAINT "achievements_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "battle_metric_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"battle_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"net_pnl" double precision NOT NULL,
	"maximum_drawdown" double precision NOT NULL,
	"trade_count" integer NOT NULL,
	"risk_utilization" double precision NOT NULL,
	"performance_score" double precision NOT NULL,
	"risk_efficiency_score" double precision NOT NULL,
	"discipline_score" double precision NOT NULL,
	"consistency_score" double precision NOT NULL,
	"total_battle_score" double precision NOT NULL,
	"is_final" boolean DEFAULT false NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"verification_status" "verification_status" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battle_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"battle_id" text NOT NULL,
	"user_id" text NOT NULL,
	"trading_account_id" text NOT NULL,
	"starting_rating" integer NOT NULL,
	"ending_rating" integer NOT NULL,
	"final_score" double precision NOT NULL,
	"result" "battle_result" NOT NULL,
	"verification_status" "verification_status" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battles" (
	"id" text PRIMARY KEY NOT NULL,
	"battle_type" "battle_type" NOT NULL,
	"market" "market" NOT NULL,
	"status" "battle_status" NOT NULL,
	"scheduled_start" timestamp with time zone NOT NULL,
	"actual_start" timestamp with time zone,
	"end_time" timestamp with time zone,
	"battle_window" "battle_window" NOT NULL,
	"scoring_configuration_id" text NOT NULL,
	"winner_id" text,
	"verification_status" "verification_status" NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_event_id" text NOT NULL,
	"source_provider" "integration_provider" NOT NULL,
	"trading_account_id" text NOT NULL,
	"battle_id" text,
	"user_id" text NOT NULL,
	"instrument" "market" NOT NULL,
	"side" "order_side" NOT NULL,
	"quantity" integer NOT NULL,
	"price" double precision NOT NULL,
	"commission" double precision NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"event_type" "execution_event_type" NOT NULL,
	"verification_status" "verification_status" NOT NULL,
	"raw_payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "firms" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" "firm_kind" NOT NULL,
	"description" text NOT NULL,
	"is_demo_data" boolean DEFAULT true NOT NULL,
	CONSTRAINT "firms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "integration_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"connection_type" "connection_type" NOT NULL,
	"status" "connection_status" NOT NULL,
	"external_user_id" text NOT NULL,
	"access_metadata" jsonb NOT NULL,
	"connected_at" timestamp with time zone NOT NULL,
	"last_synced_at" timestamp with time zone NOT NULL,
	"verification_status" "verification_status" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"href" text,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rating_history" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"battle_id" text NOT NULL,
	"previous_rating" integer NOT NULL,
	"new_rating" integer NOT NULL,
	"change" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trader_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"firm_id" text NOT NULL,
	"rating" integer NOT NULL,
	"league" "league" NOT NULL,
	"division" "division" NOT NULL,
	"primary_market" "market" NOT NULL,
	"secondary_markets" jsonb NOT NULL,
	"battle_style" "battle_style" NOT NULL,
	"discipline_score" integer NOT NULL,
	"risk_score" integer NOT NULL,
	"performance_score" integer NOT NULL,
	"season_wins" integer NOT NULL,
	"season_losses" integer NOT NULL,
	"lifetime_wins" integer NOT NULL,
	"lifetime_losses" integer NOT NULL,
	"current_streak" integer NOT NULL,
	"best_win_streak" integer NOT NULL,
	"season_start_rating" integer NOT NULL,
	"season_high_rating" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trading_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"external_account_id" text NOT NULL,
	"account_type" "account_type" NOT NULL,
	"prop_firm" text NOT NULL,
	"starting_balance" double precision NOT NULL,
	"current_balance" double precision NOT NULL,
	"status" "account_status" NOT NULL,
	"connection_status" "connection_status" NOT NULL,
	"maximum_contracts" integer NOT NULL,
	"daily_loss_limit" double precision NOT NULL,
	"metadata" jsonb NOT NULL,
	"verification_status" "verification_status" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"achievement_id" text NOT NULL,
	"earned_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"avatar_url" text,
	"is_demo_user" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "users_display_name_unique" UNIQUE("display_name"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD CONSTRAINT "account_snapshots_trading_account_id_trading_accounts_id_fk" FOREIGN KEY ("trading_account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_snapshots" ADD CONSTRAINT "account_snapshots_battle_id_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_metric_snapshots" ADD CONSTRAINT "battle_metric_snapshots_battle_id_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_metric_snapshots" ADD CONSTRAINT "battle_metric_snapshots_participant_id_battle_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."battle_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_participants" ADD CONSTRAINT "battle_participants_battle_id_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_participants" ADD CONSTRAINT "battle_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_participants" ADD CONSTRAINT "battle_participants_trading_account_id_trading_accounts_id_fk" FOREIGN KEY ("trading_account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battles" ADD CONSTRAINT "battles_winner_id_users_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_events" ADD CONSTRAINT "execution_events_trading_account_id_trading_accounts_id_fk" FOREIGN KEY ("trading_account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_events" ADD CONSTRAINT "execution_events_battle_id_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_events" ADD CONSTRAINT "execution_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_battle_id_battles_id_fk" FOREIGN KEY ("battle_id") REFERENCES "public"."battles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trader_profiles" ADD CONSTRAINT "trader_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trader_profiles" ADD CONSTRAINT "trader_profiles_firm_id_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."firms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_accounts" ADD CONSTRAINT "trading_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE no action ON UPDATE no action;