# Dev Memo: Email/Password Signup (No SSO)

## Goal
In development/testing, allow creating accounts using email + password (no GitHub/Google SSO) so auth-required features can be tested without setting up OAuth apps. In production this must be **disabled even if flags are misconfigured**.

## Security Model / Enablement Rules
There are two separate gates:

1) **Server gate (authoritative)**
- `ENABLE_EMAIL_PASSWORD_AUTH="true"` AND `NODE_ENV !== "production"`.
- Implemented in `lib/feature-flags.server.ts:1` and applied in `lib/auth.ts:26`.
- If production, server forces it OFF; calling email/password endpoints will fail.

2) **Client gate (UI-only, advisory)**
- `NEXT_PUBLIC_ENABLE_EMAIL_PASSWORD_AUTH="true"` AND `NODE_ENV !== "production"`.
- Implemented in `lib/feature-flags.ts:1` and used in `app/(auth)/components/auth-dialog.tsx:198`.
- This flag is **not a secret**. Even if someone changes the UI in the browser, the server gate still prevents production usage.

## What Changed

### Server: better-auth config
- `lib/auth.ts:31` enables `emailAndPassword` when `emailPasswordAuthEnabledServer` is true.
- Social providers are now optional: if `GOOGLE_*` / `GITHUB_*` are not set, the provider is not registered (so local dev doesn’t require OAuth config).

### Client: Auth dialog
- `app/(auth)/components/auth-dialog.tsx:198` adds an email/password form:
  - Sign in: email + password
  - Sign up: email + password + confirm password
  - Uses `authClient.signIn.email(...)` and `authClient.signUp.email(...)`

### Env example
- `.env.example:15` adds:
  - `ENABLE_EMAIL_PASSWORD_AUTH` (server)
  - `NEXT_PUBLIC_ENABLE_EMAIL_PASSWORD_AUTH` (client UI)

### Tests
- `test/feature-flags.test.ts:1` ensures both gates are forced off in production and default to disabled.
- Run: `pnpm test` (script in `package.json:10`)

## DB / Migration Notes
No schema changes were made.

- better-auth email/password signup writes `user.emailVerified = false` explicitly and stores the hashed password into `account.password` under provider `credential`.
- This repo’s schema already contains `user.emailVerified` (non-null) and `account.password`, so no migration is required for this feature.

## How To Use Locally
1) Create `.env.local` and set:
```bash
ENABLE_EMAIL_PASSWORD_AUTH="true"
NEXT_PUBLIC_ENABLE_EMAIL_PASSWORD_AUTH="true"
```
2) Choose database type:
```bash
# For self-hosted/local Postgres (including docker compose)
DATABASE_TYPE="postgres"

# For hosted Neon
DATABASE_TYPE="neon"
```
3) For local Postgres via docker compose:
```bash
# If you run the app on your host machine:
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tweakcn"

# If you run the app as the `app` service in docker compose:
DATABASE_URL="postgresql://postgres:postgres@db:5432/tweakcn"
```
4) Initialize tables (one-time per fresh DB):
```bash
pnpm db:push
```
5) Start:
```bash
pnpm dev
```
6) Open the auth dialog and use email/password sign up/sign in.
