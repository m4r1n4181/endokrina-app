# Thyroid Pre-Visit Clinical Context Platform (DEV-001)

A pre-visit preparation and clinical-context tool for a thyroid endocrinology clinic. Patients fill a structured questionnaire and declare/upload lab status before their appointment. Doctors get a read-only dashboard with deterministic (non-AI) templated summaries and a longitudinal history. Admin/reception see operational status only — never clinical content.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port $PORT, routed at /api)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only; requires DATABASE_URL)

## Required environment variables

Copy `.env.example` to `.env` for local development. Required:
- `DATABASE_URL` — Postgres connection string
- `JWT_SECRET` — at least 32 chars, random hex (generate: `openssl rand -hex 64`)
- `MAGIC_LINK_SECRET` — at least 32 chars, random hex
- All others have safe defaults for development (EMAIL_PROVIDER=stub, SMS_PROVIDER=stub, STORAGE_PROVIDER=stub)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (modular monolith, API-first)
- DB: PostgreSQL + Drizzle ORM
- Auth: JWT (staff) + optional email MFA + magic-link + DOB + email OTP (patient custom flow)
- Password hashing: argon2id
- Validation: Zod v3
- Background jobs: BullMQ (Phase 2 — reminder engine)
- File storage: encrypted S3 (Phase 2 — stub in Phase 1)
- MFA codes are sent by email during MVP; SMS MFA can be added with a provider later.
- Build: esbuild (CJS bundle)

## Where things live

```
artifacts/api-server/src/
  app.ts                     — Express app setup (cors, pinoHttp, audit IP middleware)
  index.ts                   — server entrypoint
  lib/
    config.ts                — all env vars validated at startup (fail-fast)
    db.ts                    — DB connection singleton
    logger.ts                — pino logger
    questionnaire-schema.ts  — data-driven questionnaire config (thyroid_v1, extensible)
  middlewares/
    authenticate.ts          — JWT auth middleware (staff + patient sessions)
    rbac.ts                  — role-based access control guards
    audit-middleware.ts      — IP extraction for audit context
    error-handler.ts         — global error + 404 handler
  services/
    audit.ts                 — audit log write service (append-only, never throws)
    auth.ts                  — staff JWT sign/verify
    patient-auth.ts          — magic link + DOB + OTP flow helpers
    sms.ts                   — pluggable SMS provider (stub/twilio/aws_sns)
    summary.ts               — deterministic summary generator (Serbian, template-based)
  routes/
    health.ts                — GET /api/healthz
    auth.ts                  — POST /api/auth/login|refresh|logout, GET /api/auth/me
    patient-auth.ts          — POST /api/patient-auth/verify-dob|verify-otp
    appointments.ts          — CRUD + cancel/reopen/resend-link
    questionnaires.ts        — patient save/submit + doctor view
    uploads.ts               — patient document upload (metadata; file storage Phase 2)
    doctor.ts                — summaries, document list, patient history (doctor-only)
    admin.ts                 — user management, audit log query

lib/db/src/schema/
  users.ts                   — staff users (doctor, clinic_admin, nurse)
  patients.ts                — patient identity records
  appointments.ts            — appointment lifecycle + lab status
  preparation-links.ts       — magic links + DOB/OTP rate-limiting state
  questionnaires.ts          — config-driven JSON answers, consent tracking
  uploaded-documents.ts      — lab/ultrasound document metadata
  summaries.ts               — latest generated summary per (appointment, variant)
  audit-log.ts               — AUDIT_ACTIONS constants + append-only log table
```

## Architecture decisions

- **RBAC enforced server-side**: Admin/reception get HTTP 403 on any clinical-content endpoint (not just hidden UI). Enforced in `middlewares/rbac.ts` and `clinicalContentGuard`.
- **Audit log never deletes**: Append-only by design per Serbian/GDPR health-data law. No rotation job. Queryable for breach scoping (regulatory obligation to "Poverenik").
- **Patient auth is custom, not standard**: magic-link + full DOB + email OTP (three factors). DOB-only is insufficient for real health data per legal review.
- **Questionnaire answers are config-driven JSON**: `schemaVersion` tracked on each record. Allows the product to extend to other endocrine conditions without schema changes. Schema defined in `lib/questionnaire-schema.ts`.
- **Summaries are deterministic/template-based**: No LLM. Regenerated on every save/submit, only latest stored per (appointment, variant). Clearly labeled as patient-reported.
- **Storage and SMS notifications are stub-first**: `STORAGE_PROVIDER=stub` and `SMS_PROVIDER=stub` are development defaults. MFA codes use the configured email provider; configure SMTP before using email MFA with real accounts.
- **Data residency is a config value**: `AWS_REGION` defaults to `eu-central-1` but is never hardcoded. Required before any real patient data flows through.
- **Soft-delete everywhere**: Cancelled appointments are excluded from clinical views but not hard-deleted (pending legal decision). Uploaded documents have `deletedAt` soft-delete column.

## Product

- **Patient**: Receives magic link → verifies DOB + OTP → fills thyroid questionnaire → uploads labs or declares lab status → saves/submits
- **Doctor**: Reads daily appointment list → opens patient detail → views questionnaire, documents, generated summaries (two variants), historical timeline. Read-only on all patient data.
- **Admin/reception**: Creates invitations, resends links, edits/cancels/reschedules appointments, sees operational status only (never questionnaire content or documents)

## Compliance requirements (non-negotiable)

- Every access to clinical content is audit logged (see `AUDIT_ACTIONS` in `lib/db/src/schema/audit-log.ts`)
- Admin/reception access to clinical content returns 403 (server-side enforcement)
- Email OTP required (not optional) for real patient data — DOB-only insufficient per legal review
- Explicit patient consent recorded before questionnaire opens
- Health data = special category data (GDPR-equivalent Serbian law)
- DPA, Privacy Policy, DPIA, and Consent Form are go-live blockers (business tasks, not code)

## Open questions flagged to product owner

- Exact final questionnaire wording/ordering in Serbian
- Exact final summary template wording/terminology
- Whether uploads need instructional video vs text/visual guidance only
- Exact dashboard density on phone vs desktop
- How much historical context shows by default vs collapsed
- Whether patient sees submission-confirmation summary

## User preferences

_Populate as you build._

## Gotchas

- Run `pnpm --filter @workspace/db run push` after schema changes (requires DATABASE_URL set)
- `EMAIL_PROVIDER=stub` logs MFA codes to console — use SMTP for real accounts
- `STORAGE_PROVIDER=stub` records document metadata but doesn't write files — Phase 2 only
- Questionnaire `answers` field is `jsonb` — validated at application layer against `schemaVersion`
- Audit log table is intentionally append-only — no update/delete code should touch it
- `argon2` is in `onlyBuiltDependencies` (pnpm-workspace.yaml) — required for native binary build
- Patient session JWT (`type: "patient_session"`) is separate from staff JWT — different verification path

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `.env.example` for the full list of environment variables with documentation
- See `attached_assets/` for the original PRD, functional requirements, UX requirements, and compliance docs
