# API Testing

The API tests use Vitest, Supertest, and the isolated `endokrina_test` database configured by `.env.test`.

## Run tests

From the repository root:

```powershell
pnpm --filter @workspace/api-server test
```

Run one focused file:

```powershell
pnpm --filter @workspace/api-server exec vitest run src/routes/__tests__/auth.test.ts
```

## Covered behavior

- Staff SMS MFA requires a challenge before issuing a staff token.
- Invalid MFA codes return `401 INVALID_MFA`.
- A valid SMS MFA code is accepted once and then cleared.
- Enabling MFA without a phone returns `400 MFA_PHONE_REQUIRED`.
- Questionnaire IDs are collected from all schema sections.
- Expired and tampered patient preparation links are rejected.

The appointment POST route also validates `scheduledAt` as an ISO datetime with an explicit timezone offset. Uploads enforce the configured size limit and allowed MIME metadata before storage.

## Test database

The auth integration tests temporarily enable MFA for `dr.jovic@clinic.test`, use a test OTP hash, and restore the user to MFA-disabled state after the suite. They do not require a real SMS provider. With `SMS_PROVIDER=stub`, application login challenges print the OTP in the API terminal.

The root `pnpm test` command runs `pnpm db:test:setup` first. The setup script creates `endokrina_test` through the PostgreSQL `postgres` maintenance database, applies the Drizzle schema, and seeds the test user/data. It never changes the development database configured by `.env`.

## LocalStack storage

Start LocalStack with `docker compose -f docker-compose.dev.yml up -d localstack`, create the bucket with `aws --endpoint-url=http://localhost:4566 s3 mb s3://endokrina-documents`, and set `STORAGE_PROVIDER=s3`, `STORAGE_BUCKET=endokrina-documents`, and `AWS_ENDPOINT_URL=http://localhost:4566` in `.env`. With `STORAGE_PROVIDER=stub`, files continue to use the local temporary storage adapter.

CI creates `.env.test` from its Postgres service environment before running the same command. The local `.env.test` file is ignored because it contains database credentials.