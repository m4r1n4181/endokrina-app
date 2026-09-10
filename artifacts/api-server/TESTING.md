# API Testing

The API tests use Vitest, Supertest, and the development database configured by the repository root `.env` file.

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

## Development database

The auth integration tests temporarily enable MFA for `dr.jovic@clinic.test`, use a test OTP hash, and restore the user to MFA-disabled state after the suite. They do not require a real SMS provider. With `SMS_PROVIDER=stub`, application login challenges print the OTP in the API terminal.

The tests are intentionally not isolated from the development database. Use a dedicated test database when the test environment is introduced.