# Local Development Setup - Windows + VS Code

This guide describes a clean setup after cloning the repository. It uses Docker for PostgreSQL and LocalStack S3, and uses committed Drizzle migrations instead of `db:push`.

## 1. Install prerequisites

Install Git for Windows, Node.js LTS, Docker Desktop, and VS Code:

- Git: https://git-scm.com/downloads/win
- Node.js: https://nodejs.org
- Docker Desktop: https://www.docker.com/products/docker-desktop/
- VS Code: https://code.visualstudio.com/

Open a new PowerShell or Git Bash terminal and verify:

```powershell
git --version
node --version
npm --version
docker --version
docker compose version
```

The project uses native `argon2`. If `pnpm install` reports native build errors on Windows, install the Visual Studio C++ Build Tools and Python, then retry.

Install pnpm once:

```powershell
npm install -g pnpm
pnpm --version
```

## 2. Clone the repository

```powershell
git clone <repository-url> C:\Projects\endokrina-app
cd C:\Projects\endokrina-app
code .
```

## 3. Install dependencies

From the repository root:

```powershell
pnpm install --frozen-lockfile
```

Do not use npm or yarn for this workspace. The committed `pnpm-lock.yaml` is the source of truth.

## 4. Create the local environment file

```powershell
Copy-Item .env.example .env
```

Open `.env` and set these local values:

```dotenv
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/endokrina

JWT_SECRET=REPLACE_WITH_A_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS
MAGIC_LINK_SECRET=REPLACE_WITH_ANOTHER_RANDOM_SECRET_OF_AT_LEAST_32_CHARACTERS

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

Generate secrets instead of using the placeholders. Run this twice:

```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Use the two outputs for `JWT_SECRET` and `MAGIC_LINK_SECRET`. Never commit `.env`; it is ignored by Git. `.env.test` is also ignored and is reserved for the isolated test database.

## 5. Start local infrastructure

Make sure Docker Desktop is running. From the repository root:

```powershell
pnpm run dev:infra
```

This starts:

- PostgreSQL service `postgres` on `localhost:5432`
- Database `endokrina`
- User/password `postgres` / `postgres`
- LocalStack S3 on `http://localhost:4566`

Check the services:

```powershell
docker compose -f docker-compose.dev.yml ps
```

PostgreSQL should be healthy before continuing. If another PostgreSQL installation already occupies port `5432`, stop it or change the Compose port and `DATABASE_URL` together.

## 6. Apply versioned database migrations

The committed migration files are in `lib/db/drizzle/`. Apply them to the local `endokrina` database:

```powershell
pnpm run db:migrate
```

This is the normal local setup path and the migration workflow intended for future production/RDS deployments. Do not use `db:push` for the normal workflow.

On a new database, the command applies `0000_loose_bedlam.sql`. Running it again should report no pending migrations.

Optional verification:

```powershell
docker compose -f docker-compose.dev.yml exec -T postgres psql -U postgres -d endokrina -c "\dt public.*"
docker compose -f docker-compose.dev.yml exec -T postgres psql -U postgres -d endokrina -c "select * from __drizzle_migrations;"
```

## 7. Create the LocalStack S3 bucket

The repository includes a Windows-friendly bucket setup script; `awslocal` is not required:

```powershell
pnpm run storage:ensure-bucket
```

Expected output is either `Created bucket` or `Bucket already exists`.

## 8. Seed local demo data

```powershell
pnpm run db:seed
```

The seed creates or reuses:

- Admin: `admin@clinic.test` / `Admin1234!admin`
- Doctor: `dr.jovic@clinic.test` / `Doctor1234!doc`
- A test patient, appointment, and preparation link

The seed prints the patient magic link. Keep it available for the patient-flow check.

## 9. Start the API and portal

Open two terminals in the repository root.

Terminal 1:

```powershell
pnpm run dev:api
```

The API runs on `http://localhost:5000`.

Terminal 2:

```powershell
pnpm run dev:portal
```

The portal runs on `http://localhost:5173`.

## 10. Verify the installation

API health check:

```powershell
Invoke-WebRequest http://localhost:5000/api/healthz -UseBasicParsing
```

Open `http://localhost:5173/login` and use the seeded admin or doctor credentials. Staff MFA is opt-in; after enabling it in the security page, the development SMS code is printed in the API terminal because `SMS_PROVIDER=stub`.

Patient flow:

1. Open the magic link printed by `pnpm run db:seed`.
2. Use DOB `1985-03-15` for the seeded patient.
3. Read the SMS OTP from the API terminal.
4. Complete consent, questionnaire, lab status, and document upload.

## 11. Run checks and tests

```powershell
pnpm run typecheck
pnpm run build
pnpm test
```

`pnpm test` creates or reuses the separate `endokrina_test` database, applies the schema, seeds it, and runs API tests. It does not use or reset the local `endokrina` database.

## 12. Stop local services

Stop containers but keep database data:

```powershell
pnpm run dev:infra:down
```

To remove containers and local volumes, which deletes PostgreSQL and LocalStack data, use this only when you intentionally want a full reset:

```powershell
docker compose -f docker-compose.dev.yml down -v
```

## Quick reference

| Task | Command |
|---|---|
| Install dependencies | `pnpm install --frozen-lockfile` |
| Start Docker services | `pnpm run dev:infra` |
| Stop Docker services | `pnpm run dev:infra:down` |
| Apply DB migrations | `pnpm run db:migrate` |
| Create LocalStack bucket | `pnpm run storage:ensure-bucket` |
| Seed demo data | `pnpm run db:seed` |
| Start API | `pnpm run dev:api` |
| Start portal | `pnpm run dev:portal` |
| Type-check | `pnpm run typecheck` |
| Build | `pnpm run build` |
| Run isolated tests | `pnpm test` |
| API health | `http://localhost:5000/api/healthz` |
| Portal | `http://localhost:5173` |

## Troubleshooting

### `ECONNREFUSED localhost:5432`

Check Docker Desktop and PostgreSQL logs:

```powershell
docker compose -f docker-compose.dev.yml ps
docker compose -f docker-compose.dev.yml logs postgres
```

### `DATABASE_URL` points to the wrong database

The Compose database is `endokrina`:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/endokrina
```

The test database is `endokrina_test` and is configured separately by `.env.test`/CI.

### Migration appears to stop after `Using 'pg' driver`

Run from the repository root:

```powershell
pnpm run db:migrate
```

Then check PostgreSQL health and logs. Do not run destructive database commands unless you intend to delete local data.

### `Configuration error: JWT_SECRET` or `MAGIC_LINK_SECRET`

Make sure `.env` exists and both secrets have at least 32 characters.

### `argon2` install failure

Install the Windows C++ Build Tools and Python, then run:

```powershell
pnpm install --frozen-lockfile
```

### LocalStack or S3 errors

```powershell
docker compose -f docker-compose.dev.yml logs localstack
pnpm run storage:ensure-bucket
```

With `STORAGE_PROVIDER=stub`, uploads use local temporary storage instead of S3.
