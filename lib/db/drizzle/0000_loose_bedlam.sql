CREATE TYPE "public"."user_role" AS ENUM('doctor', 'clinic_admin', 'nurse');--> statement-breakpoint
CREATE TYPE "public"."patient_match_status" AS ENUM('new_patient', 'auto_linked', 'possible_duplicate');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('male', 'female', 'other', 'prefer_not_to_say');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('draft_invitation', 'link_sent', 'opened', 'in_progress', 'submitted', 'locked', 'reopened', 'rescheduled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."link_status" AS ENUM('active', 'deactivated', 'expired');--> statement-breakpoint
CREATE TYPE "public"."questionnaire_status" AS ENUM('not_started', 'in_progress', 'saved', 'submitted', 'locked', 'reopened');--> statement-breakpoint
CREATE TYPE "public"."summary_variant" AS ENUM('current_visit', 'current_visit_plus_history');--> statement-breakpoint
CREATE TYPE "public"."audit_actor_type" AS ENUM('user', 'patient_link', 'system', 'unauthenticated');--> statement-breakpoint
CREATE TYPE "public"."audit_outcome" AS ENUM('success', 'denied', 'failed', 'error');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"mfa_secret" text,
	"mfa_otp_hash" text,
	"mfa_otp_expires_at" timestamp with time zone,
	"mfa_otp_attempt_count" integer DEFAULT 0 NOT NULL,
	"mfa_otp_blocked_until" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	"last_morning_briefing_on" text,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"date_of_birth" date NOT NULL,
	"sex" "sex",
	"height_cm" text,
	"additional_notes" text,
	"match_status" "patient_match_status" DEFAULT 'new_patient' NOT NULL,
	"duplicate_review_flag" boolean DEFAULT false NOT NULL,
	"excluded_from_clinical_views" boolean DEFAULT false NOT NULL,
	"consent_given_at" timestamp with time zone,
	"consent_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid,
	"doctor_id" uuid NOT NULL,
	"invited_full_name" text NOT NULL,
	"invited_phone" text NOT NULL,
	"appointment_type" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" "appointment_status" DEFAULT 'draft_invitation' NOT NULL,
	"lab_status" text,
	"excluded_from_clinical_views" boolean DEFAULT false NOT NULL,
	"original_scheduled_at" timestamp with time zone,
	"consultation_duration_minutes" text,
	"doctor_documentation_effort" text,
	"last_reminder_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "preparation_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"token" text NOT NULL,
	"status" "link_status" DEFAULT 'active' NOT NULL,
	"dob_attempt_count" integer DEFAULT 0 NOT NULL,
	"dob_blocked_until" timestamp with time zone,
	"otp_code" text,
	"otp_expires_at" timestamp with time zone,
	"otp_attempt_count" integer DEFAULT 0 NOT NULL,
	"otp_blocked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deactivated_at" timestamp with time zone,
	"last_accessed_at" timestamp with time zone,
	CONSTRAINT "preparation_links_appointment_id_unique" UNIQUE("appointment_id"),
	CONSTRAINT "preparation_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "questionnaires" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"schema_version" text DEFAULT 'thyroid_v1' NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "questionnaire_status" DEFAULT 'not_started' NOT NULL,
	"consent_given_at" timestamp with time zone,
	"consent_version" text,
	"saved_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"reopened_at" timestamp with time zone,
	"reopened_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questionnaires_appointment_id_unique" UNIQUE("appointment_id")
);
--> statement-breakpoint
CREATE TABLE "uploaded_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"ocr_extracted_date" text,
	"ocr_processed_at" timestamp with time zone,
	"document_type" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deletion_reason" text,
	CONSTRAINT "uploaded_documents_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"variant" "summary_variant" NOT NULL,
	"content" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"template_version" text DEFAULT 'thyroid_v1' NOT NULL,
	CONSTRAINT "summaries_appointment_variant_unique" UNIQUE("appointment_id","variant")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_user_id" uuid,
	"actor_link_id" uuid,
	"actor_role" text,
	"actor_ip" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" uuid,
	"outcome" "audit_outcome" NOT NULL,
	"context" jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_id_users_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preparation_links" ADD CONSTRAINT "preparation_links_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_documents" ADD CONSTRAINT "uploaded_documents_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summaries" ADD CONSTRAINT "summaries_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;