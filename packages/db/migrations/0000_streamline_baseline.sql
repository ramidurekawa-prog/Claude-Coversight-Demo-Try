CREATE TYPE "public"."member_role" AS ENUM('owner', 'gm', 'finance', 'admin');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "actions" (
	"org_id" uuid NOT NULL,
	"id" text NOT NULL,
	"intervention_id" text,
	"finding_id" text,
	"state" text NOT NULL,
	"owner" text NOT NULL,
	"due_on" text NOT NULL,
	"done_on" text,
	"loc" text NOT NULL,
	"record" jsonb NOT NULL,
	"evidence" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "actions_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "adjustments" (
	"org_id" uuid NOT NULL,
	"id" text NOT NULL,
	"kind" text NOT NULL,
	"intervention_id" text NOT NULL,
	"cents" integer NOT NULL,
	"status" text NOT NULL,
	"on" text NOT NULL,
	"record" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adjustments_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"on" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"actor_user_id" uuid,
	"entity_kind" text NOT NULL,
	"entity_id" text NOT NULL,
	"event" text NOT NULL,
	"from_state" text,
	"to_state" text,
	"reason" text,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "auth_verifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dayparts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"start_hour" integer NOT NULL,
	"end_hour" integer NOT NULL,
	"hours" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dayparts_org_code_uniq" UNIQUE("org_id","code")
);
--> statement-breakpoint
CREATE TABLE "feeds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"tier" text NOT NULL,
	"access" text NOT NULL,
	"cadence" text NOT NULL,
	"sla_hours" integer,
	"fields" text NOT NULL,
	"stages" text NOT NULL,
	"degraded" text NOT NULL,
	"completeness" double precision NOT NULL,
	"rows" integer DEFAULT 0 NOT NULL,
	"newest" text,
	"newest_rule" text DEFAULT 'fixed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feeds_org_code_uniq" UNIQUE("org_id","code")
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"org_id" uuid NOT NULL,
	"id" text NOT NULL,
	"state" text NOT NULL,
	"lever" text NOT NULL,
	"domain" text NOT NULL,
	"loc" text NOT NULL,
	"exposure_cents" integer NOT NULL,
	"recoverable_cents" integer NOT NULL,
	"detected_on" text NOT NULL,
	"decision_opened_on" text NOT NULL,
	"expires_on" text NOT NULL,
	"historical" boolean DEFAULT false NOT NULL,
	"converted_to" text,
	"record" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "findings_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "gm_location_scopes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"location_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gm_location_scopes_membership_location_uniq" UNIQUE("membership_id","location_code")
);
--> statement-breakpoint
CREATE TABLE "interventions" (
	"org_id" uuid NOT NULL,
	"id" text NOT NULL,
	"finding_id" text NOT NULL,
	"state" text NOT NULL,
	"lever" text NOT NULL,
	"loc" text NOT NULL,
	"exec_on" text NOT NULL,
	"eligible_on" text NOT NULL,
	"outcome" text NOT NULL,
	"bookable_cents" integer,
	"projected_cents" integer NOT NULL,
	"source" text DEFAULT 'history' NOT NULL,
	"decl" jsonb NOT NULL,
	"eval" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interventions_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"location_code" text NOT NULL,
	"week" text NOT NULL,
	"sku_code" text NOT NULL,
	"vendor" text NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"qty" double precision NOT NULL,
	"extended_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_days" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"location_code" text NOT NULL,
	"business_date" text NOT NULL,
	"daypart" text NOT NULL,
	"item_code" text NOT NULL,
	"units" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"cost_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_sides" (
	"org_id" uuid NOT NULL,
	"intervention_id" text NOT NULL,
	"period" text NOT NULL,
	"claim_cents" integer NOT NULL,
	"record" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_sides_org_id_intervention_id_pk" PRIMARY KEY("org_id","intervention_id")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"short" text NOT NULL,
	"seats" integer NOT NULL,
	"opened" text NOT NULL,
	"gm" text DEFAULT '' NOT NULL,
	"chef" text DEFAULT '' NOT NULL,
	"concept" text DEFAULT '' NOT NULL,
	"tz" text DEFAULT 'America/Los_Angeles' NOT NULL,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_org_code_uniq" UNIQUE("org_id","code")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_org_user_uniq" UNIQUE("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"cost_cents" integer,
	"price_history" jsonb NOT NULL,
	"uses_sku" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_items_org_code_uniq" UNIQUE("org_id","code")
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"synthetic" boolean DEFAULT true NOT NULL,
	"fixture_version" text,
	"fixture_label" text,
	"as_of" text NOT NULL,
	"register_through" text,
	"connected_on" text,
	"fee_monthly_cents" integer NOT NULL,
	"fee_note" text DEFAULT '' NOT NULL,
	"fiscal_calendar" text DEFAULT 'Calendar month, Mon–Sun weeks' NOT NULL,
	"pos" text DEFAULT 'Toast' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"owner_name" text DEFAULT '' NOT NULL,
	"controller_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orgs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"as_of" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"engine_version" text NOT NULL,
	"fixture_version" text,
	"findings_fired" integer DEFAULT 0 NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "reservation_days" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"location_code" text NOT NULL,
	"business_date" text NOT NULL,
	"daypart" text NOT NULL,
	"booked" integer NOT NULL,
	"walk_in" integer NOT NULL,
	"quoted_wait_min" double precision NOT NULL,
	"abandoned" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"foh" boolean NOT NULL,
	"loaded_rate_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_org_code_uniq" UNIQUE("org_id","code")
);
--> statement-breakpoint
CREATE TABLE "seed_state" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"fixture_version" text NOT NULL,
	"fingerprint" text NOT NULL,
	"through" text NOT NULL,
	"seeded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"location_code" text NOT NULL,
	"business_date" text NOT NULL,
	"dow" integer NOT NULL,
	"daypart" text NOT NULL,
	"covers" integer NOT NULL,
	"turned_away" integer DEFAULT 0 NOT NULL,
	"gross_cents" integer NOT NULL,
	"comps_cents" integer NOT NULL,
	"net_cents" integer NOT NULL,
	"cogs_cents" integer NOT NULL,
	"labor_cents" integer NOT NULL,
	"hours" double precision NOT NULL,
	"ticket_min" double precision NOT NULL,
	"rating" double precision NOT NULL,
	"constrained_share" double precision DEFAULT 0 NOT NULL,
	"holiday" boolean DEFAULT false NOT NULL,
	"capacity" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "services_org_loc_date_daypart_uniq" UNIQUE("org_id","location_code","business_date","daypart")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"location_code" text NOT NULL,
	"business_date" text NOT NULL,
	"daypart" text NOT NULL,
	"role_code" text NOT NULL,
	"scheduled_hours" double precision NOT NULL,
	"clocked_hours" double precision NOT NULL,
	"rate_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skc_admins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skc_admins_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "skus" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"vendor" text NOT NULL,
	"unit" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skus_org_code_uniq" UNIQUE("org_id","code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"intervention_id" text NOT NULL,
	"as_of" text NOT NULL,
	"outcome" text NOT NULL,
	"bookable_cents" integer,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dayparts" ADD CONSTRAINT "dayparts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feeds" ADD CONSTRAINT "feeds_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gm_location_scopes" ADD CONSTRAINT "gm_location_scopes_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gm_location_scopes" ADD CONSTRAINT "gm_location_scopes_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_days" ADD CONSTRAINT "item_days_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_sides" ADD CONSTRAINT "ledger_sides_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_days" ADD CONSTRAINT "reservation_days_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seed_state" ADD CONSTRAINT "seed_state_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skc_admins" ADD CONSTRAINT "skc_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skus" ADD CONSTRAINT "skus_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_results" ADD CONSTRAINT "verification_results_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_events_org_at_idx" ON "audit_events" USING btree ("org_id","at");--> statement-breakpoint
CREATE INDEX "audit_events_org_entity_idx" ON "audit_events" USING btree ("org_id","entity_kind","entity_id");--> statement-breakpoint
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "findings_org_state_idx" ON "findings" USING btree ("org_id","state");--> statement-breakpoint
CREATE INDEX "interventions_org_state_idx" ON "interventions" USING btree ("org_id","state");--> statement-breakpoint
CREATE INDEX "invoice_lines_org_week_idx" ON "invoice_lines" USING btree ("org_id","week");--> statement-breakpoint
CREATE INDEX "item_days_org_date_idx" ON "item_days" USING btree ("org_id","business_date");--> statement-breakpoint
CREATE INDEX "reservation_days_org_date_idx" ON "reservation_days" USING btree ("org_id","business_date");--> statement-breakpoint
CREATE INDEX "services_org_date_idx" ON "services" USING btree ("org_id","business_date");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shifts_org_date_idx" ON "shifts" USING btree ("org_id","business_date");--> statement-breakpoint
CREATE INDEX "verification_results_org_iv_idx" ON "verification_results" USING btree ("org_id","intervention_id");