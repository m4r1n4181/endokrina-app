# Endokrina — Thyroid Pre-Visit Platform

A pre-visit preparation and clinical-context tool for a thyroid endocrinology clinic. Patients receive a secure link, verify their identity, fill a structured questionnaire and upload lab results before the appointment. Doctors get a read-only view with deterministic (template-based, non-AI) summaries, uploaded documents and patient history. Clinic admins manage appointments and invitations but never see clinical content.

> This README is a working draft that consolidates the former `LOCAL-SETUP-WINDOWS.md`, `artifacts/api-server/TESTING.md` and project notes. Deployment is described in [DEPLOYMENT.md](DEPLOYMENT.md).

## Stack

- pnpm workspaces (pnpm 12.7.0), Node.js 20, TypeScript 5.9
- API: Express 5 modular monolith (`artifacts/api-server`), bundled with esbuild
- Portal: React 19 + Vite 7 + Tailwind 4 (`artifacts/clinic-portal`), served by the API from the same origin in production
- Database: PostgreSQL 16 + Drizzle ORM, versioned migrations in `lib/db/drizzle/`
- Auth: staff JWT + optional email MFA; patients use magic link + date of birth + email OTP
- Password hashing: argon2id
- Validation: Zod
- File storage: S3 (AWS, or LocalStack locally), server-side encrypted
- Email: SMTP (Resend in production)
- Background jobs: in-process (questionnaire locking, reminders, doctor morning briefing)

## Repository layout

```
artifacts/
  api-server/            Express API (+ serves the built portal in production)
    src/lib/             config (env validation), storage adapters, questionnaire schema
    src/middlewares/     auth, RBAC, audit IP, error handling
    src/services/        audit log, auth, patient auth, summaries, email/SMS
    src/routes/          health, auth, patient-auth, appointments, questionnaires, uploads, doctor, admin
    src/jobs/            maintenance jobs (lock, reminders, morning briefing)
    src/scripts/         one-off scripts (demo seed)
  clinic-portal/         React portal for staff, doctors and patients
lib/
  db/                    Drizzle schema, migrations, local dev seed
  api-spec/              OpenAPI spec + codegen config
  api-zod/               generated Zod schemas
  api-client-react/      generated React Query client
scripts/                 workspace scripts (test DB setup, LocalStack bucket)
localstack/              LocalStack init hook (creates the local S3 bucket)
```

## Architecture decisions

- **RBAC is enforced server-side.** Admin/reception get HTTP 403 on clinical endpoints, not just hidden UI (`middlewares/rbac.ts`, `clinicalContentGuard`).
- **Append-only audit log.** Every access to clinical content and every sensitive action is logged; nothing is deleted.
- **Patient-reported data is labelled as such.** Summaries are deterministic templates and never contain diagnoses or therapy recommendations.
- **Config-driven questionnaire** (`questionnaire-schema.ts`, `thyroid_v1`) so new conditions can be added without migrations.
- **One container, one origin.** The API serves the portal build, so the browser calls relative `/api` URLs.

## Local development (Windows + VS Code)

### 1. Prerequisites

Git, Node.js 20 LTS, Docker Desktop, VS Code. Then:

```powershell
npm install -g pnpm@12.7.0
pnpm --version
```

The project uses native `argon2`. If `pnpm install` reports native build errors on Windows, install the Visual Studio C++ Build Tools and Python, then retry.

### 2. Install dependencies

```powershell
pnpm install --frozen-lockfile
```

Use only pnpm; `pnpm-lock.yaml` is the source of truth.

### 3. Environment file

```powershell
Copy-Item .env.example .env
```

Local values matching `docker-compose.dev.yml`:

```dotenv
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/thyroid_dev

JWT_SECRET=<random, at least 32 characters>
MAGIC_LINK_SECRET=<another random value, at least 32 characters>

SMS_PROVIDER=stub
EMAIL_PROVIDER=stub
STORAGE_PROVIDER=s3
STORAGE_BUCKET=endokrina-documents
AWS_REGION=eu-central-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_ENDPOINT_URL=http://localhost:4566

APP_BASE_URL=http://localhost:5000
PORTAL_BASE_URL=http://localhost:5173
CORS_ORIGINS=*
```

Generate each secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

`.env` and `.env.test` are git-ignored. Production never reads `.env`; production values are platform secrets (see DEPLOYMENT.md).

### 4. Start local infrastructure

```powershell
pnpm run dev:infra
docker compose -f docker-compose.dev.yml ps
```

Starts PostgreSQL 16 on `localhost:5433` (database `thyroid_dev`, user/password `postgres`/`postgres`) and LocalStack S3 on `http://localhost:4566`. The LocalStack init hook creates the `endokrina-documents` bucket; `pnpm run storage:ensure-bucket` can create it too.

### 5. Apply migrations

```powershell
pnpm run db:migrate
```

Do not use `db:push` in the normal workflow; migrations in `lib/db/drizzle/` are what production uses.

### 6. Seed local data

```powershell
pnpm run db:seed
```

Creates a local admin (`admin@clinic.test` / `Admin1234!admin`), a doctor (`dr.jovic@clinic.test` / `Doctor1234!doc`), one patient, one appointment and a preparation link (printed in the terminal). These credentials are for local development only.

### 7. Run

```powershell
pnpm run dev:api      # http://localhost:5000
pnpm run dev:portal   # http://localhost:5173
```

Health check: `http://localhost:5000/api/healthz`.

Patient flow: open the printed magic link, enter DOB `1985-03-15`, read the OTP from the API terminal (stub provider), then complete consent, questionnaire, lab status and document upload.

### Troubleshooting

- `ECONNREFUSED localhost:5433` — check `docker compose -f docker-compose.dev.yml ps` and `logs postgres`.
- `Configuration error: JWT_SECRET` / `MAGIC_LINK_SECRET` — `.env` is missing or a secret is shorter than 32 characters.
- `argon2` install failure — install C++ Build Tools + Python, then `pnpm install --frozen-lockfile`.
- S3 errors — `docker compose -f docker-compose.dev.yml logs localstack`, then `pnpm run storage:ensure-bucket`. With `STORAGE_PROVIDER=stub`, uploads go to local temp storage instead.

## Tests

API tests use Vitest + Supertest against an isolated `endokrina_test` database configured in `.env.test` (copy from `.env.test.example`).

```powershell
pnpm test                                                  # sets up the test DB, then runs API tests
pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/auth.test.ts
```

`pnpm test` creates or reuses `endokrina_test`, applies the schema and seeds test data; it never touches the development database.

Covered behaviour includes:

- staff email MFA challenge, invalid/expired codes, one-time use, phone requirement;
- questionnaire ID collection across schema sections;
- rejection of expired and tampered patient links;
- doctor morning briefing (one email per doctor per clinic-local day, ordering, cancellations, overlap safety, retry after failure, send window, DST boundaries);
- briefing email content (no clinical data, HTML escaping, local times, Serbian status labels);
- `scheduledAt` validation with explicit timezone offset, upload size and MIME limits.

CI (`.github/workflows/ci.yml`) runs install, typecheck, build and tests on every PR and push to `main`.

## Useful commands

| Task | Command |
|---|---|
| Install | `pnpm install --frozen-lockfile` |
| Start / stop Docker services | `pnpm run dev:infra` / `pnpm run dev:infra:down` |
| Apply migrations | `pnpm run db:migrate` |
| Seed local data | `pnpm run db:seed` |
| Seed demo data (demo environment) | `pnpm run db:seed:demo` |
| Start API / portal | `pnpm run dev:api` / `pnpm run dev:portal` |
| Typecheck / build | `pnpm run typecheck` / `pnpm run build` |
| Tests | `pnpm test` |

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md): single Docker image on Azure Container Apps, Azure PostgreSQL Flexible Server, documents on AWS S3, email via Resend SMTP.
