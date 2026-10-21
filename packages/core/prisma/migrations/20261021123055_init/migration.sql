-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TEACHER', 'STUDENT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'PENDING_CONSENT', 'DISABLED');

-- CreateEnum
CREATE TYPE "ThemePreference" AS ENUM ('SYSTEM', 'LIGHT', 'DARK');

-- CreateEnum
CREATE TYPE "LegalDocumentType" AS ENUM ('PRIVACY_POLICY', 'TERMS');

-- CreateEnum
CREATE TYPE "ConsentMethod" AS ENUM ('EMAIL_LINK', 'PAPER');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'REFUSED');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('MULTIPLE_CHOICE', 'TRUE_FALSE', 'MATCHING', 'FILL_BLANKS', 'STRIKE_OUT');

-- CreateEnum
CREATE TYPE "TaskOrigin" AS ENUM ('FORM', 'PHOTO', 'TEXT', 'CLASSROOM');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'NEW', 'IN_PROGRESS', 'OVERDUE', 'COMPLETED', 'CORRECTED', 'REDO');

-- CreateEnum
CREATE TYPE "AiJobKind" AS ENUM ('OCR', 'GENERATE', 'CLASSROOM_MATERIAL');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ClassroomImportKind" AS ENUM ('MATERIAL', 'ROSTER');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "password_hash" TEXT,
    "google_sub" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "theme" "ThemePreference" NOT NULL DEFAULT 'SYSTEM',
    "email_verified" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "student_profiles" (
    "user_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "family_contact_name" TEXT,
    "family_contact_email" TEXT,
    "family_contact_phone" TEXT,
    "preferences" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "legal_documents" (
    "id" UUID NOT NULL,
    "type" "LegalDocumentType" NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "major_change" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "legal_document_id" UUID NOT NULL,
    "method" "ConsentMethod" NOT NULL,
    "status" "ConsentStatus" NOT NULL,
    "grantor_name" TEXT NOT NULL,
    "grantor_relationship" TEXT NOT NULL,
    "grantor_email" TEXT,
    "statements" JSONB,
    "decided_at" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "evidence_file_id" UUID,
    "recorded_by_id" UUID,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms_acceptances" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "legal_document_id" UUID NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terms_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_tokens" (
    "user_id" UUID NOT NULL,
    "refresh_token_enc" TEXT NOT NULL,
    "scopes" TEXT[],
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_tokens_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "school_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "pass_grade" INTEGER NOT NULL DEFAULT 7,
    "ai_monthly_budget_usd" DECIMAL(8,2) NOT NULL DEFAULT 50,
    "achievements_enabled" BOOLEAN NOT NULL DEFAULT true,
    "google_login_enabled" BOOLEAN NOT NULL DEFAULT true,
    "active_cycle_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_cycles" (
    "id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,

    CONSTRAINT "school_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "classroom_course_id" TEXT,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "area" TEXT,
    "color" TEXT,
    "description" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_subjects" (
    "teacher_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,

    CONSTRAINT "teacher_subjects_pkey" PRIMARY KEY ("teacher_id","subject_id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_templates" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "type" "TaskType" NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "origin" "TaskOrigin" NOT NULL DEFAULT 'FORM',
    "in_bank" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID NOT NULL,
    "on_behalf_of_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_items" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "correct_answer" JSONB NOT NULL,
    "max_points" DECIMAL(6,2) NOT NULL,
    "explanation" TEXT,
    "image_file_id" UUID,

    CONSTRAINT "template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'DRAFT',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "pass_grade" INTEGER NOT NULL DEFAULT 7,
    "current_attempt" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "late" BOOLEAN NOT NULL DEFAULT false,
    "late_days" INTEGER NOT NULL DEFAULT 0,
    "redo_due_at" TIMESTAMP(3),

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "response" JSONB,
    "auto_points" DECIMAL(6,2),
    "ai_suggested_points" DECIMAL(6,2),
    "final_points" DECIMAL(6,2),
    "item_comment" TEXT,
    "carried_over" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "results" (
    "attempt_id" UUID NOT NULL,
    "suggested_grade" INTEGER NOT NULL,
    "grade" INTEGER NOT NULL,
    "grade_overridden" BOOLEAN NOT NULL DEFAULT false,
    "passed" BOOLEAN NOT NULL,
    "failed_for_late" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "comment" TEXT,
    "redo_requested" BOOLEAN NOT NULL DEFAULT false,
    "approved_by_id" UUID NOT NULL,
    "on_behalf_of_id" UUID,
    "approved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "results_pkey" PRIMARY KEY ("attempt_id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_sources" (
    "template_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,

    CONSTRAINT "template_sources_pkey" PRIMARY KEY ("template_id","file_id")
);

-- CreateTable
CREATE TABLE "ai_jobs" (
    "id" UUID NOT NULL,
    "kind" "AiJobKind" NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "model" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "cost_usd" DECIMAL(10,4),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "ai_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classroom_imports" (
    "id" UUID NOT NULL,
    "kind" "ClassroomImportKind" NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "classroom_course_id" TEXT NOT NULL,
    "summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classroom_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_log" (
    "id" UUID NOT NULL,
    "to" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "resend_id" TEXT,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "on_behalf_of_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_type_version_key" ON "legal_documents"("type", "version");

-- CreateIndex
CREATE INDEX "consents_student_id_idx" ON "consents"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "terms_acceptances_user_id_legal_document_id_key" ON "terms_acceptances"("user_id", "legal_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_cycles_year_key" ON "school_cycles"("year");

-- CreateIndex
CREATE UNIQUE INDEX "courses_cycle_id_name_key" ON "courses"("cycle_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_name_key" ON "subjects"("name");

-- CreateIndex
CREATE INDEX "assignments_teacher_id_active_idx" ON "assignments"("teacher_id", "active");

-- CreateIndex
CREATE INDEX "assignments_student_id_active_idx" ON "assignments"("student_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "template_items_template_id_position_key" ON "template_items"("template_id", "position");

-- CreateIndex
CREATE INDEX "tasks_assignment_id_idx" ON "tasks"("assignment_id");

-- CreateIndex
CREATE INDEX "tasks_status_due_at_idx" ON "tasks"("status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "attempts_task_id_number_key" ON "attempts"("task_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "answers_attempt_id_item_id_key" ON "answers"("attempt_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "files_storage_key_key" ON "files"("storage_key");

-- CreateIndex
CREATE INDEX "ai_jobs_created_at_idx" ON "ai_jobs"("created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "achievements_student_id_kind_key" ON "achievements"("student_id", "kind");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_legal_document_id_fkey" FOREIGN KEY ("legal_document_id") REFERENCES "legal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_evidence_file_id_fkey" FOREIGN KEY ("evidence_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_legal_document_id_fkey" FOREIGN KEY ("legal_document_id") REFERENCES "legal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_tokens" ADD CONSTRAINT "google_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_settings" ADD CONSTRAINT "school_settings_active_cycle_id_fkey" FOREIGN KEY ("active_cycle_id") REFERENCES "school_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "school_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "school_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_items" ADD CONSTRAINT "template_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_items" ADD CONSTRAINT "template_items_image_file_id_fkey" FOREIGN KEY ("image_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "template_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "results" ADD CONSTRAINT "results_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_sources" ADD CONSTRAINT "template_sources_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_sources" ADD CONSTRAINT "template_sources_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reglas que Prisma no puede expresar en el esquema

-- Un solo docente activo por alumno y materia en cada ciclo
CREATE UNIQUE INDEX "assignments_one_active_teacher" ON "assignments"("student_id", "subject_id", "cycle_id") WHERE "active";

-- Notas enteras de 0 a 10
ALTER TABLE "results" ADD CONSTRAINT "results_grade_range" CHECK ("grade" BETWEEN 0 AND 10 AND "suggested_grade" BETWEEN 0 AND 10);
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_pass_grade_range" CHECK ("pass_grade" BETWEEN 0 AND 10);
ALTER TABLE "school_settings" ADD CONSTRAINT "school_settings_pass_grade_range" CHECK ("pass_grade" BETWEEN 0 AND 10);
ALTER TABLE "school_settings" ADD CONSTRAINT "school_settings_single_row" CHECK ("id" = 1);

-- Puntajes
ALTER TABLE "template_items" ADD CONSTRAINT "template_items_max_points_positive" CHECK ("max_points" > 0);
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_due_after_start" CHECK ("due_at" >= "starts_at");

-- Emails siempre en minúsculas
ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase" CHECK ("email" = lower("email"));
