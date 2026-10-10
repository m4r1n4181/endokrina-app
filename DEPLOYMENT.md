# Docker and deployment

The image contains both the clinic portal and API. Express serves the Vite build and `/api` from one origin, so the same image can run in Azure Container Apps and later in AWS without changing the app's network layout.

## Build and run

```sh
docker build -t foundation-phase-one:local .
docker run --rm -p 8080:8080 --env-file .env -e PORT=8080 foundation-phase-one:local
```

Open `http://localhost:8080`; the health endpoint is `http://localhost:8080/api/healthz`. The container listens on `PORT` (8080 by default in the image). Never pass production credentials in a Docker build argument or bake them into the image.

The image uses Node 20 and pnpm 12, matching the project's CI toolchain. The build stage compiles native `argon2` dependencies; compiler packages are not included in the final runtime stage. The process runs as the unprivileged `node` user.

## Azure Container Apps

1. Create an Azure Container Registry and build/push this repository's Docker image to it.
2. Create an Azure Container App with external HTTP ingress and target port `8080`.
3. Set the startup/liveness probe to `GET /api/healthz` on port `8080`.
4. Set `min replicas` to `1` and initially keep `max replicas` at `1`. The API starts maintenance jobs in-process; increase replicas only after moving those jobs to a single worker or confirming their cross-replica locking.
5. Configure secrets in Container Apps and reference them as environment variables. Do not commit real values to `.env.example` or the image.

Required production environment:

```text
NODE_ENV=production
PORT=8080
DATABASE_URL=<Azure PostgreSQL connection string>
JWT_SECRET=<at least 32 random characters>
MAGIC_LINK_SECRET=<at least 32 random characters>
APP_BASE_URL=https://<container-app-hostname>
PORTAL_BASE_URL=https://<container-app-hostname>
CORS_ORIGINS=https://<container-app-hostname>
STORAGE_PROVIDER=s3
STORAGE_BUCKET=<existing S3 bucket>
AWS_REGION=<bucket region>
AWS_ACCESS_KEY_ID=<secret>
AWS_SECRET_ACCESS_KEY=<secret>
EMAIL_PROVIDER=smtp
EMAIL_FROM=<verified sender address>
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=<secret>
APP_TIMEZONE=Europe/Belgrade
```

`CORS_ORIGINS=*` is rejected in production. Set it to the exact public app origin (scheme and host, no trailing slash). `APP_BASE_URL` and `PORTAL_BASE_URL` should use that same origin because the portal and API are served together. Leave `AWS_ENDPOINT_URL` unset for AWS S3; set it only for an S3-compatible endpoint.

This app currently supports S3-compatible document storage, not Azure Blob Storage. The configuration above keeps file storage on S3 while the app runs in Azure and avoids a storage migration when moving the container to AWS. Ensure the bucket exists, the credentials have only the required bucket permissions, and database network rules allow connections from Container Apps.

## Database migrations

Run committed Drizzle migrations once from a release job or CI runner that can reach the production database, before shifting traffic to a new image:

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/db migrate
```

Provide `DATABASE_URL` to that job as a secret. Do not run schema push or seed commands against production. The runtime image intentionally does not run migrations automatically: multiple replicas and automatic restarts must not race schema changes.

## Before opening the app to patients

- Replace both signing secrets with independent random values of at least 32 characters and store them as platform secrets.
- Use a production PostgreSQL database with TLS, automated backups, and a recovery test.
- Confirm SMTP sender verification and send/receive an invitation email.
- Confirm the app can reach S3 and upload, read, and delete a test document; set lifecycle/retention policies consistently with clinic policy.
- Confirm the Container App health probe succeeds and review startup logs for storage, SMTP, and database errors.
- Do not seed demo users or patient records in production. Rotate any credentials previously used for local testing before deploying.

## Moving the image to AWS

Push the same image to ECR and run it as an ECS service (or another container service) with `PORT=8080`, the same `/api/healthz` probe, and the same secret names. Move PostgreSQL to the selected AWS database and update `DATABASE_URL`; keep the S3 bucket and update IAM access. The Docker image does not contain Azure-specific runtime dependencies.
